import { Module } from '@nestjs/common';
import { BullModule } from '@nestjs/bullmq';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Video } from '../modules/videos/entities/video.entity';
import { VideoVariant } from '../modules/videos/entities/video-variant.entity';
import { VideoRepository } from '../modules/videos/repositories/video.repository';
import { VIDEO_REPOSITORY } from '../modules/videos/repositories/video.repository.interface';
import { VIDEO_QUEUE } from '../infra/queue/queue.constants';
import { VideoWorker } from './video.worker';

@Module({
  imports: [
    BullModule.registerQueue({ name: VIDEO_QUEUE }),
    TypeOrmModule.forFeature([Video, VideoVariant]),
  ],
  providers: [
    VideoWorker,
    { provide: VIDEO_REPOSITORY, useClass: VideoRepository },
  ],
})
export class WorkerModule {}
