import { Column, Entity, OneToMany, PrimaryGeneratedColumn } from 'typeorm';
import { AuditEntity } from '../../system/entities/audit-column';
import { VideoVariant } from './video-variant.entity';

export enum VideoStatus {
  UPLOADED = 'uploaded',
  QUEUED = 'queued',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
  DELETED = 'deleted',
}

@Entity('videos')
export class Video extends AuditEntity {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'title', type: 'varchar', length: 255 })
  title!: string;

  @Column({ name: 'description', type: 'text', nullable: true })
  description!: string | null;

  @Column({ name: 'original_filename', type: 'text' })
  originalFilename!: string;

  @Column({ name: 'mime_type', type: 'varchar', length: 100 })
  mimeType!: string;

  @Column({ name: 'size_bytes', type: 'bigint' })
  sizeBytes!: number;

  @Column({ name: 'raw_key', type: 'text', nullable: true })
  rawKey!: string | null;

  @Column({ name: 'raw_url', type: 'text', nullable: true })
  rawUrl!: string | null;

  @Column({ name: 'hls_key', type: 'text', nullable: true })
  hlsKey!: string | null;

  @Column({ name: 'playback_url', type: 'text', nullable: true })
  playbackUrl!: string | null;

  @Column({ name: 'thumbnail_key', type: 'text', nullable: true })
  thumbnailKey!: string | null;

  @Column({ name: 'thumbnail_url', type: 'text', nullable: true })
  thumbnailUrl!: string | null;

  @Column({ name: 'duration_sec', type: 'float', nullable: true })
  durationSec!: number | null;

  @Column({ name: 'width', type: 'int', nullable: true })
  width!: number | null;

  @Column({ name: 'height', type: 'int', nullable: true })
  height!: number | null;

  @Column({
    name: 'status',
    type: 'enum',
    enum: VideoStatus,
    default: VideoStatus.UPLOADED,
  })
  status!: VideoStatus;

  @Column({ name: 'progress', type: 'smallint', default: 0 })
  progress!: number;

  @Column({ name: 'error_message', type: 'text', nullable: true })
  errorMessage!: string | null;

  @Column({ name: 'processed_at', type: 'timestamptz', nullable: true })
  processedAt!: Date | null;

  @OneToMany(() => VideoVariant, (variant) => variant.video, { cascade: true })
  variants!: VideoVariant[];
}
