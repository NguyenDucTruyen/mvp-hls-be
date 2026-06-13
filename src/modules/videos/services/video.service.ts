import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import {
  BadRequestException,
  ConflictException,
  Inject,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import type { IStorageAdapter } from '../../../infra/storage/storage.interface';
import { STORAGE_ADAPTER } from '../../../infra/storage/storage.constants';
import { QueueService } from '../../../infra/queue/queue.service';
import { Video, VideoStatus } from '../entities/video.entity';
import type { IVideoRepository } from '../repositories/video.repository.interface';
import { VIDEO_REPOSITORY } from '../repositories/video.repository.interface';
import type { UploadVideoDto } from '../dto/upload-video.dto';
import type { ListVideosDto } from '../dto/list-videos.dto';
import type { CreateSignedUploadDto } from '../dto/create-signed-upload.dto';
import { MAX_DIRECT_UPLOAD_SIZE } from '../dto/create-signed-upload.dto';
import type { CompleteSignedUploadDto } from '../dto/complete-signed-upload.dto';

interface SignedUploadResponse {
  videoId: string;
  uploadUrl: string;
  publicId: string;
  apiKey: string;
  timestamp: number;
  signature: string;
  resourceType: 'video';
  maxFileSize: number;
  uploadParams: {
    public_id: string;
    timestamp: number;
    api_key: string;
    signature: string;
    overwrite: false;
  };
}

@Injectable()
export class VideoService {
  private readonly logger = new Logger(VideoService.name);

  constructor(
    @Inject(VIDEO_REPOSITORY)
    private readonly videoRepo: IVideoRepository,
    @Inject(STORAGE_ADAPTER)
    private readonly storage: IStorageAdapter,
    private readonly queueService: QueueService,
  ) {}

  async uploadVideo(
    file: Express.Multer.File,
    dto: UploadVideoDto,
  ): Promise<Video> {
    const tmpPath = path.join(
      os.tmpdir(),
      `${randomUUID()}${path.extname(file.originalname)}`,
    );

    try {
      await fs.promises.writeFile(tmpPath, file.buffer);
      this.logger.log(`Uploading ${file.originalname} to Cloudinary`);

      const result = await this.storage.upload(tmpPath, {
        folder: 'mvp-hls/raw',
        resourceType: 'video',
      });

      const video = await this.videoRepo.create({
        title: dto.title,
        description: dto.description ?? null,
        originalFilename: file.originalname,
        mimeType: file.mimetype,
        sizeBytes: file.size,
        rawKey: result.publicId,
        rawUrl: result.secureUrl,
      });

      await this.videoRepo.updateStatus(video.id, VideoStatus.QUEUED);
      await this.queueService.enqueueTranscode(video.id);
      this.logger.log(`Video ${video.id} queued for transcoding`);

      return { ...video, status: VideoStatus.QUEUED };
    } catch (err) {
      this.logger.error(
        `Upload failed: filename=${file.originalname}`,
        err instanceof Error
          ? err.stack
          : JSON.stringify(err, Object.getOwnPropertyNames(err)),
      );
      throw err;
    } finally {
      await fs.promises.unlink(tmpPath).catch(() => {});
    }
  }

  async createSignedUpload(
    dto: CreateSignedUploadDto,
  ): Promise<SignedUploadResponse> {
    const video = await this.videoRepo.create({
      title: dto.title,
      description: dto.description ?? null,
      originalFilename: dto.originalFilename,
      mimeType: dto.mimeType,
      sizeBytes: dto.sizeBytes,
      rawKey: null,
      rawUrl: null,
    });
    const publicId = `mvp-hls/raw/${video.id}`;
    const signedUpload = await this.storage.createSignedUpload({
      publicId,
      resourceType: 'video',
      maxFileSize: MAX_DIRECT_UPLOAD_SIZE,
    });

    this.logger.log(`Created signed upload for video ${video.id}`);

    return {
      videoId: video.id,
      uploadUrl: signedUpload.uploadUrl,
      publicId: signedUpload.publicId,
      apiKey: signedUpload.apiKey,
      timestamp: signedUpload.timestamp,
      signature: signedUpload.signature,
      resourceType: 'video',
      maxFileSize: MAX_DIRECT_UPLOAD_SIZE,
      uploadParams: {
        public_id: signedUpload.publicId,
        timestamp: signedUpload.timestamp,
        api_key: signedUpload.apiKey,
        signature: signedUpload.signature,
        overwrite: false,
      },
    };
  }

  async completeSignedUpload(
    id: string,
    dto: CompleteSignedUploadDto,
  ): Promise<Video> {
    const video = await this.findById(id);

    if (video.status !== VideoStatus.UPLOADED) {
      throw new ConflictException(
        `Video ${id} cannot complete upload from status "${video.status}"`,
      );
    }

    const expectedPublicId = `mvp-hls/raw/${video.id}`;
    if (dto.publicId !== expectedPublicId) {
      throw new BadRequestException('Uploaded asset does not match video');
    }

    const isValidUpload = await this.storage.verifyUploadResult({
      publicId: dto.publicId,
      version: dto.version,
      signature: dto.signature,
      secureUrl: dto.secureUrl,
    });

    if (!isValidUpload) {
      throw new BadRequestException('Invalid upload signature');
    }

    await this.videoRepo.updateRawAsset(id, {
      rawKey: dto.publicId,
      rawUrl: dto.secureUrl,
    });
    await this.videoRepo.updateStatus(id, VideoStatus.QUEUED);
    await this.queueService.enqueueTranscode(id);
    this.logger.log(`Direct upload complete; video ${id} queued`);

    return {
      ...video,
      rawKey: dto.publicId,
      rawUrl: dto.secureUrl,
      status: VideoStatus.QUEUED,
    };
  }

  async findAll(
    dto: ListVideosDto,
  ): Promise<{ videos: Video[]; total: number }> {
    this.logger.log(
      `findAll: page=${dto.page ?? 1}, limit=${dto.limit ?? 20}, status=${dto.status ?? 'all'}`,
    );
    const result = await this.videoRepo.findAll({
      status: dto.status,
      page: dto.page,
      limit: dto.limit,
    });
    this.logger.log(
      `findAll success: returned=${result.videos.length}, total=${result.total}`,
    );
    return result;
  }

  async findById(id: string): Promise<Video> {
    const video = await this.videoRepo.findById(id);
    if (!video) {
      this.logger.warn(`Video not found: id=${id}`);
      throw new NotFoundException(`Video ${id} not found`);
    }
    return video;
  }

  async deleteVideo(id: string): Promise<void> {
    await this.findById(id);
    await this.videoRepo.softDelete(id);
    this.logger.log(`Video ${id} soft-deleted`);
  }

  async retryVideo(id: string): Promise<Video> {
    const video = await this.findById(id);

    if (video.status !== VideoStatus.FAILED) {
      this.logger.warn(
        `Retry rejected: id=${id}, current status="${video.status}" (must be FAILED)`,
      );
      throw new ConflictException(
        `Video ${id} cannot be retried: current status is "${video.status}"`,
      );
    }

    await this.videoRepo.updateStatus(id, VideoStatus.QUEUED);
    await this.videoRepo.setProgress(id, 0);
    await this.queueService.enqueueTranscode(id);
    this.logger.log(`Video ${id} re-queued for transcoding`);

    return { ...video, status: VideoStatus.QUEUED, progress: 0 };
  }
}
