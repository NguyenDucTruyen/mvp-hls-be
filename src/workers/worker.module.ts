import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Video } from '../modules/videos/entities/video.entity';
import { VideoVariant } from '../modules/videos/entities/video-variant.entity';
import { VideoRepository } from '../modules/videos/repositories/video.repository';
import { VIDEO_REPOSITORY } from '../modules/videos/repositories/video.repository.interface';
import { JobLog } from '../infra/database/entities/job-log.entity';
import { JobLogRepository } from '../infra/database/repositories/job-log.repository';
import { JOB_LOG_REPOSITORY } from '../infra/database/repositories/job-log.repository.interface';
import { VIDEO_QUEUE } from '../infra/queue/queue.constants';
import { VideoWorker } from './video.worker';

@Module({
  imports: [
    BullModule.registerQueue({ name: VIDEO_QUEUE }),
    TypeOrmModule.forFeature([Video, VideoVariant, JobLog]),
  ],
  providers: [
    VideoWorker,
    { provide: VIDEO_REPOSITORY, useClass: VideoRepository },
    { provide: JOB_LOG_REPOSITORY, useClass: JobLogRepository },
  ],
})
export class WorkerModule {}
