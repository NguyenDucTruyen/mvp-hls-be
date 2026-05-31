import {
  Column,
  CreateDateColumn,
  Entity,
  Index,
  ManyToOne,
  PrimaryGeneratedColumn,
  Unique,
  JoinColumn,
} from 'typeorm';
import { Video } from './video.entity';

@Entity('video_variants')
@Unique('uq_variants_video_quality', ['videoId', 'qualityLabel'])
export class VideoVariant {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'video_id', type: 'uuid' })
  @Index('idx_variants_video_id')
  videoId!: string;

  @ManyToOne(() => Video, (video) => video.variants, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'video_id' })
  video!: Video;

  @Column({ name: 'quality_label', type: 'varchar', length: 10 })
  qualityLabel!: string;

  @Column({ name: 'width', type: 'int' })
  width!: number;

  @Column({ name: 'height', type: 'int' })
  height!: number;

  @Column({ name: 'bitrate_kbps', type: 'int' })
  bitrateKbps!: number;

  @Column({ name: 'playlist_key', type: 'text', nullable: true })
  playlistKey!: string | null;

  @Column({ name: 'playlist_url', type: 'text', nullable: true })
  playlistUrl!: string | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
