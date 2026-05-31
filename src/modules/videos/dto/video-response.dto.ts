import { VideoStatus } from '../entities/video.entity';

export class VideoVariantResponseDto {
  id!: string;
  qualityLabel!: string;
  width!: number;
  height!: number;
  bitrateKbps!: number;
  playlistUrl!: string | null;
}

export class VideoResponseDto {
  id!: string;
  title!: string;
  description!: string | null;
  status!: VideoStatus;
  progress!: number;
  playbackUrl!: string | null;
  thumbnailUrl!: string | null;
  durationSec!: number | null;
  width!: number | null;
  height!: number | null;
  errorMessage!: string | null;
  variants!: VideoVariantResponseDto[];
  createdAt!: Date;
  updatedAt!: Date;
}
