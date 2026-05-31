import { Module } from '@nestjs/common';
import { UserModule } from './modules/users/modules/user.module';
import { SystemModule } from './modules/system/modules/system.module';
import { StorageModule } from './infra/storage/storage.module';
import { QueueModule } from './infra/queue/queue.module';
import { FfmpegModule } from './infra/ffmpeg/ffmpeg.module';
import { VideoModule } from './modules/videos/modules/video.module';
import { WorkerModule } from './workers/worker.module';

@Module({
  imports: [
    SystemModule,
    StorageModule,
    QueueModule,
    FfmpegModule,
    VideoModule,
    WorkerModule,
    UserModule,
  ],
  controllers: [],
})
export class AppModule {}
