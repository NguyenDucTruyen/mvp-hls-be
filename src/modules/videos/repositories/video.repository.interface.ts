import { Video, VideoStatus } from '../entities/video.entity';
import { VideoVariant } from '../entities/video-variant.entity';

export const VIDEO_REPOSITORY = 'VIDEO_REPOSITORY';

export interface CreateVideoData {
  title: string;
  description?: string | null;
  originalFilename: string;
  mimeType: string;
  sizeBytes: number;
  rawKey?: string | null;
  rawUrl?: string | null;
}

export interface ReadyVideoData {
  hlsKey: string;
  playbackUrl: string;
  thumbnailKey?: string | null;
  thumbnailUrl?: string | null;
  durationSec?: number | null;
  width?: number | null;
  height?: number | null;
  processedAt: Date;
}

export interface RawAssetData {
  rawKey: string;
  rawUrl: string;
}

export interface FindAllOptions {
  status?: VideoStatus;
  page?: number;
  limit?: number;
}

export interface IVideoRepository {
  findById(id: string): Promise<Video | null>;
  findAll(
    options?: FindAllOptions,
  ): Promise<{ videos: Video[]; total: number }>;
  create(data: CreateVideoData): Promise<Video>;
  updateRawAsset(id: string, data: RawAssetData): Promise<void>;
  updateStatus(id: string, status: VideoStatus): Promise<void>;
  setProgress(id: string, progress: number): Promise<void>;
  setFailed(id: string, errorMessage: string): Promise<void>;
  setReady(id: string, data: ReadyVideoData): Promise<void>;
  saveVariants(
    videoId: string,
    variants: Omit<VideoVariant, 'id' | 'video' | 'createdAt'>[],
  ): Promise<VideoVariant[]>;
  softDelete(id: string): Promise<void>;
}
