import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { IsNull, Repository } from 'typeorm';
import { Video, VideoStatus } from '../entities/video.entity';
import { VideoVariant } from '../entities/video-variant.entity';
import {
  CreateVideoData,
  FindAllOptions,
  IVideoRepository,
  ReadyVideoData,
} from './video.repository.interface';

@Injectable()
export class VideoRepository implements IVideoRepository {
  constructor(
    @InjectRepository(Video)
    private readonly videoRepo: Repository<Video>,
    @InjectRepository(VideoVariant)
    private readonly variantRepo: Repository<VideoVariant>,
  ) {}

  async findById(id: string): Promise<Video | null> {
    return this.videoRepo.findOne({
      where: { id, deletedAt: IsNull() },
      relations: { variants: true },
    });
  }

  async findAll(
    options?: FindAllOptions,
  ): Promise<{ videos: Video[]; total: number }> {
    const page = options?.page ?? 1;
    const limit = Math.min(options?.limit ?? 20, 100);

    const where: Record<string, unknown> = {
      deletedAt: IsNull(),
    };
    if (options?.status) {
      where.status = options.status;
    }

    const [videos, total] = await this.videoRepo.findAndCount({
      where,
      order: { createdAt: 'DESC' },
      skip: (page - 1) * limit,
      take: limit,
    });

    return { videos, total };
  }

  async create(data: CreateVideoData): Promise<Video> {
    const video = this.videoRepo.create({
      title: data.title,
      description: data.description ?? null,
      originalFilename: data.originalFilename,
      mimeType: data.mimeType,
      sizeBytes: data.sizeBytes,
      rawKey: data.rawKey ?? null,
      rawUrl: data.rawUrl ?? null,
      status: VideoStatus.UPLOADED,
      progress: 0,
    });
    return this.videoRepo.save(video);
  }

  async updateStatus(id: string, status: VideoStatus): Promise<void> {
    await this.videoRepo.update(id, { status });
  }

  async setProgress(id: string, progress: number): Promise<void> {
    await this.videoRepo.update(id, { progress });
  }

  async setFailed(id: string, errorMessage: string): Promise<void> {
    await this.videoRepo.update(id, {
      status: VideoStatus.FAILED,
      errorMessage,
    });
  }

  async setReady(id: string, data: ReadyVideoData): Promise<void> {
    await this.videoRepo.update(id, {
      status: VideoStatus.READY,
      progress: 100,
      hlsKey: data.hlsKey,
      playbackUrl: data.playbackUrl,
      thumbnailKey: data.thumbnailKey ?? null,
      thumbnailUrl: data.thumbnailUrl ?? null,
      durationSec: data.durationSec ?? null,
      width: data.width ?? null,
      height: data.height ?? null,
      processedAt: data.processedAt,
    });
  }

  async saveVariants(
    videoId: string,
    variants: Omit<VideoVariant, 'id' | 'video' | 'createdAt'>[],
  ): Promise<VideoVariant[]> {
    const entities = variants.map((v) =>
      this.variantRepo.create({ ...v, videoId }),
    );
    return this.variantRepo.save(entities);
  }

  async softDelete(id: string): Promise<void> {
    await this.videoRepo.softDelete(id);
  }
}
