import {
  Column,
  CreateDateColumn,
  Entity,
  JoinColumn,
  ManyToOne,
  PrimaryGeneratedColumn,
} from 'typeorm';
import { JobType } from '../../queue/queue.constants';
import { Video } from '../../../modules/videos/entities/video.entity';

export enum JobStatus {
  PENDING = 'pending',
  ACTIVE = 'active',
  COMPLETED = 'completed',
  FAILED = 'failed',
}

@Entity('jobs_log')
export class JobLog {
  @PrimaryGeneratedColumn('uuid')
  id!: string;

  @Column({ name: 'video_id', type: 'uuid' })
  videoId!: string;

  @ManyToOne(() => Video, { onDelete: 'CASCADE' })
  @JoinColumn({ name: 'video_id' })
  video?: Video;

  @Column({ name: 'queue_job_id', type: 'text', nullable: true })
  queueJobId!: string | null;

  @Column({
    name: 'type',
    type: 'enum',
    enum: Object.values(JobType),
    enumName: 'job_type_enum',
  })
  type!: JobType;

  @Column({
    name: 'status',
    type: 'enum',
    enum: JobStatus,
    enumName: 'job_status_enum',
    default: JobStatus.PENDING,
  })
  status!: JobStatus;

  @Column({ name: 'attempt', type: 'smallint', default: 1 })
  attempt!: number;

  @Column({ name: 'message', type: 'text', nullable: true })
  message!: string | null;

  @Column({ name: 'error_stack', type: 'text', nullable: true })
  errorStack!: string | null;

  @Column({ name: 'started_at', type: 'timestamptz', nullable: true })
  startedAt!: Date | null;

  @Column({ name: 'finished_at', type: 'timestamptz', nullable: true })
  finishedAt!: Date | null;

  @CreateDateColumn({ name: 'created_at' })
  createdAt!: Date;
}
