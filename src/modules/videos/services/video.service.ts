import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { randomUUID } from 'crypto';
import {
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
    } finally {
      await fs.promises.unlink(tmpPath).catch(() => {});
    }
  }

  async findAll(
    dto: ListVideosDto,
  ): Promise<{ videos: Video[]; total: number }> {
    return this.videoRepo.findAll({
      status: dto.status,
      page: dto.page,
      limit: dto.limit,
    });
  }

  async findById(id: string): Promise<Video> {
    const video = await this.videoRepo.findById(id);
    if (!video) {
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
