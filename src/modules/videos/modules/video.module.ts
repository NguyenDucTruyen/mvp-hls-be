import { Module } from '@nestjs/common';
import { TypeOrmModule } from '@nestjs/typeorm';
import { Video } from '../entities/video.entity';
import { VideoVariant } from '../entities/video-variant.entity';
import { VideoRepository } from '../repositories/video.repository';
import { VIDEO_REPOSITORY } from '../repositories/video.repository.interface';
import { VideoService } from '../services/video.service';
import { VideoController } from '../controllers/video.controller';

@Module({
  imports: [TypeOrmModule.forFeature([Video, VideoVariant])],
  controllers: [VideoController],
  providers: [
    VideoService,
    { provide: VIDEO_REPOSITORY, useClass: VideoRepository },
  ],
  exports: [VideoService],
})
export class VideoModule {}
