import { Injectable, Logger } from '@nestjs/common';
import { InjectQueue } from '@nestjs/bullmq';
import { Queue } from 'bullmq';
import { VIDEO_QUEUE, JobType } from './queue.constants';

@Injectable()
export class QueueService {
  private readonly logger = new Logger(QueueService.name);

  constructor(@InjectQueue(VIDEO_QUEUE) private readonly videoQueue: Queue) {}

  async enqueueTranscode(videoId: string): Promise<void> {
    await this.videoQueue.add(
      JobType.TRANSCODE_HLS,
      { videoId },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
    this.logger.log(`Enqueued ${JobType.TRANSCODE_HLS} for video ${videoId}`);
  }

  async enqueueThumbnail(videoId: string): Promise<void> {
    await this.videoQueue.add(
      JobType.GENERATE_THUMBNAIL,
      { videoId },
      { attempts: 3, backoff: { type: 'exponential', delay: 5000 } },
    );
    this.logger.log(
      `Enqueued ${JobType.GENERATE_THUMBNAIL} for video ${videoId}`,
    );
  }

  async enqueueCleanup(videoId: string): Promise<void> {
    await this.videoQueue.add(
      JobType.CLEANUP_TEMP,
      { videoId },
      { attempts: 1 },
    );
    this.logger.log(`Enqueued ${JobType.CLEANUP_TEMP} for video ${videoId}`);
  }
}
