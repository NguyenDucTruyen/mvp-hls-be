import * as fs from 'fs';
import * as os from 'os';
import * as path from 'path';
import { Inject, Logger } from '@nestjs/common';
import { Processor, WorkerHost } from '@nestjs/bullmq';
import { Job } from 'bullmq';
import { FfmpegService } from '../infra/ffmpeg/ffmpeg.service';
import type { IStorageAdapter } from '../infra/storage/storage.interface';
import { STORAGE_ADAPTER } from '../infra/storage/storage.constants';
import { VIDEO_QUEUE, JobType } from '../infra/queue/queue.constants';
import { QueueService } from '../infra/queue/queue.service';
import type { IVideoRepository } from '../modules/videos/repositories/video.repository.interface';
import { VIDEO_REPOSITORY } from '../modules/videos/repositories/video.repository.interface';
import { VideoStatus } from '../modules/videos/entities/video.entity';
import type { IJobLogRepository } from '../infra/database/repositories/job-log.repository.interface';
import { JOB_LOG_REPOSITORY } from '../infra/database/repositories/job-log.repository.interface';
import type { JobLog } from '../infra/database/entities/job-log.entity';

interface JobPayload {
  videoId: string;
}

@Processor(VIDEO_QUEUE, { concurrency: 1 })
export class VideoWorker extends WorkerHost {
  private readonly logger = new Logger(VideoWorker.name);

  constructor(
    @Inject(VIDEO_REPOSITORY)
    private readonly videoRepo: IVideoRepository,
    @Inject(STORAGE_ADAPTER)
    private readonly storage: IStorageAdapter,
    @Inject(JOB_LOG_REPOSITORY)
    private readonly jobLogRepo: IJobLogRepository,
    private readonly ffmpegService: FfmpegService,
    private readonly queueService: QueueService,
  ) {
    super();
  }

  async process(job: Job<JobPayload>): Promise<void> {
    switch (job.name) {
      case JobType.TRANSCODE_HLS:
        return this.handleTranscode(job);
      case JobType.GENERATE_THUMBNAIL:
        return this.handleThumbnail(job);
      case JobType.CLEANUP_TEMP:
        return this.handleCleanup(job);
      default:
        throw new Error(`Unknown job type: ${String(job.name)}`);
    }
  }

  // ── Transcode ────────────────────────────────────────────────────────────

  private async handleTranscode(job: Job<JobPayload>): Promise<void> {
    const { videoId } = job.data;
    this.logger.log(
      `[transcode] start video=${videoId} attempt=${job.attemptsMade + 1}`,
    );

    let logEntry: JobLog | null = null;
    try {
      logEntry = await this.jobLogRepo
        .create({
          videoId,
          queueJobId: job.id ?? null,
          type: JobType.TRANSCODE_HLS,
          attempt: job.attemptsMade + 1,
          startedAt: new Date(),
        })
        .catch(() => null);

      const video = await this.videoRepo.findById(videoId);
      if (!video) throw new Error(`Video ${videoId} not found`);
      if (video.status === VideoStatus.UPLOADED) {
        throw new Error(`Video ${videoId} upload has not completed`);
      }
      if (!video.rawUrl) throw new Error(`Video ${videoId} has no rawUrl`);

      await this.videoRepo.updateStatus(videoId, VideoStatus.PROCESSING);
      await this.videoRepo.setProgress(videoId, 0);

      const tmpDir = this.tmpDirFor(videoId);
      await fs.promises.mkdir(tmpDir, { recursive: true });

      const ext = path.extname(video.originalFilename) || '.mp4';
      const rawPath = path.join(tmpDir, `raw${ext}`);
      const hlsDir = path.join(tmpDir, 'hls');

      // 1. Download raw
      this.logger.log(`[transcode] downloading raw video=${videoId}`);
      await this.storage.downloadToTemp(video.rawUrl, rawPath);
      await this.videoRepo.setProgress(videoId, 10);

      // 2. Transcode
      this.logger.log(`[transcode] running ffmpeg video=${videoId}`);
      const transcodeResult = await this.ffmpegService.transcode(
        rawPath,
        hlsDir,
      );
      await this.videoRepo.setProgress(videoId, 60);

      // 3. Upload variants (segments + playlists with rewritten CDN URLs)
      const variantPlaylistUrls = new Map<string, string>();
      const variantsToSave: Array<
        Omit<
          import('../modules/videos/entities/video-variant.entity').VideoVariant,
          'id' | 'video' | 'createdAt'
        >
      > = [];

      for (const variant of transcodeResult.variants) {
        const { playlistKey, playlistUrl } = await this.uploadVariantFiles(
          hlsDir,
          variant.label,
          videoId,
        );
        variantPlaylistUrls.set(variant.label, playlistUrl);
        variantsToSave.push({
          videoId,
          qualityLabel: variant.label,
          width: variant.width,
          height: variant.height,
          bitrateKbps: variant.bitrateKbps,
          playlistKey,
          playlistUrl,
        });
      }
      await this.videoRepo.setProgress(videoId, 80);

      // 4. Upload master playlist with rewritten variant URLs
      const { masterKey, masterUrl } = await this.uploadMasterPlaylist(
        transcodeResult.masterPlaylistPath,
        videoId,
        variantPlaylistUrls,
      );
      await this.videoRepo.setProgress(videoId, 90);

      // 5. Persist variants + mark ready
      await this.videoRepo.saveVariants(videoId, variantsToSave);
      await this.videoRepo.setReady(videoId, {
        hlsKey: masterKey,
        playbackUrl: masterUrl,
        processedAt: new Date(),
      });

      if (logEntry) {
        await this.jobLogRepo
          .markCompleted(logEntry.id, new Date())
          .catch(() => {});
      }
      this.logger.log(`[transcode] complete video=${videoId}`);

      // 6. Chain thumbnail job
      await this.queueService.enqueueThumbnail(videoId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? (err.stack ?? null) : null;
      this.logger.error(`[transcode] failed video=${videoId}: ${message}`);
      await this.videoRepo.setFailed(videoId, message).catch(() => {});
      if (logEntry) {
        await this.jobLogRepo
          .markFailed(logEntry.id, message, stack, new Date())
          .catch(() => {});
      }
      throw err;
    }
  }

  // ── Thumbnail ────────────────────────────────────────────────────────────

  private async handleThumbnail(job: Job<JobPayload>): Promise<void> {
    const { videoId } = job.data;
    this.logger.log(`[thumbnail] start video=${videoId}`);

    let logEntry: JobLog | null = null;
    try {
      logEntry = await this.jobLogRepo
        .create({
          videoId,
          queueJobId: job.id ?? null,
          type: JobType.GENERATE_THUMBNAIL,
          attempt: job.attemptsMade + 1,
          startedAt: new Date(),
        })
        .catch(() => null);

      const video = await this.videoRepo.findById(videoId);
      if (!video) throw new Error(`Video ${videoId} not found`);

      const tmpDir = this.tmpDirFor(videoId);
      await fs.promises.mkdir(tmpDir, { recursive: true });

      const ext = path.extname(video.originalFilename) || '.mp4';
      const rawPath = path.join(tmpDir, `raw${ext}`);
      const thumbPath = path.join(tmpDir, 'thumb.jpg');

      // Re-use cached temp file or re-download
      const rawExists = await fs.promises
        .access(rawPath)
        .then(() => true)
        .catch(() => false);

      if (!rawExists) {
        if (!video.rawUrl)
          throw new Error(`Video ${videoId} has no rawUrl for thumbnail`);
        this.logger.log(`[thumbnail] re-downloading raw video=${videoId}`);
        await this.storage.downloadToTemp(video.rawUrl, rawPath);
      }

      await this.ffmpegService.generateThumbnail(rawPath, thumbPath, 1);

      const result = await this.storage.upload(thumbPath, {
        resourceType: 'image',
        publicId: `mvp-hls/thumbnails/${videoId}/thumb`,
      });

      // Refresh video to get current hlsKey / playbackUrl
      const current = await this.videoRepo.findById(videoId);
      await this.videoRepo.setReady(videoId, {
        hlsKey: current?.hlsKey ?? '',
        playbackUrl: current?.playbackUrl ?? '',
        thumbnailKey: result.publicId,
        thumbnailUrl: result.secureUrl,
        durationSec: current?.durationSec ?? null,
        width: current?.width ?? null,
        height: current?.height ?? null,
        processedAt: current?.processedAt ?? new Date(),
      });

      if (logEntry) {
        await this.jobLogRepo
          .markCompleted(logEntry.id, new Date())
          .catch(() => {});
      }
      this.logger.log(`[thumbnail] complete video=${videoId}`);

      // Chain cleanup job
      await this.queueService.enqueueCleanup(videoId);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      const stack = err instanceof Error ? (err.stack ?? null) : null;
      this.logger.error(`[thumbnail] failed video=${videoId}: ${message}`);
      if (logEntry) {
        await this.jobLogRepo
          .markFailed(logEntry.id, message, stack, new Date())
          .catch(() => {});
      }
      throw err;
    }
  }

  // ── Cleanup ──────────────────────────────────────────────────────────────

  private async handleCleanup(job: Job<JobPayload>): Promise<void> {
    const { videoId } = job.data;
    const tmpDir = this.tmpDirFor(videoId);
    this.logger.log(`[cleanup] removing ${tmpDir}`);

    const logEntry = await this.jobLogRepo
      .create({
        videoId,
        queueJobId: job.id ?? null,
        type: JobType.CLEANUP_TEMP,
        attempt: job.attemptsMade + 1,
        startedAt: new Date(),
      })
      .catch(() => null);

    await fs.promises
      .rm(tmpDir, { recursive: true, force: true })
      .catch(() => {});

    if (logEntry) {
      await this.jobLogRepo
        .markCompleted(logEntry.id, new Date())
        .catch(() => {});
    }
    this.logger.log(`[cleanup] complete video=${videoId}`);
  }

  // ── Helpers ──────────────────────────────────────────────────────────────

  private tmpDirFor(videoId: string): string {
    return path.join(os.tmpdir(), `video-${videoId}`);
  }

  /**
   * Upload .ts segments for one quality tier, rewrite the variant playlist
   * to use absolute CDN URLs, then upload the rewritten playlist.
   */
  private async uploadVariantFiles(
    hlsDir: string,
    quality: string,
    videoId: string,
  ): Promise<{ playlistKey: string; playlistUrl: string }> {
    const variantDir = path.join(hlsDir, quality);
    const files = await fs.promises.readdir(variantDir);
    const segmentFiles = files.filter((f) => f.endsWith('.ts')).sort();

    // Upload segments and collect CDN URLs
    const segmentUrlMap = new Map<string, string>();
    for (const segFile of segmentFiles) {
      const localPath = path.join(variantDir, segFile);
      const publicId = `mvp-hls/hls/${videoId}/${quality}/${path.basename(segFile, '.ts')}`;
      const uploaded = await this.storage.upload(localPath, {
        resourceType: 'raw',
        publicId,
      });
      segmentUrlMap.set(segFile, uploaded.secureUrl);
    }

    // Rewrite index.m3u8: replace segment filenames with CDN URLs
    const playlistPath = path.join(variantDir, 'index.m3u8');
    const content = await fs.promises.readFile(playlistPath, 'utf-8');
    const rewritten = content
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        if (trimmed.endsWith('.ts') && segmentUrlMap.has(trimmed)) {
          return segmentUrlMap.get(trimmed)!;
        }
        return line;
      })
      .join('\n');

    const rewrittenPath = path.join(variantDir, 'index_cdn.m3u8');
    await fs.promises.writeFile(rewrittenPath, rewritten, 'utf-8');

    const uploaded = await this.storage.upload(rewrittenPath, {
      resourceType: 'raw',
      publicId: `mvp-hls/hls/${videoId}/${quality}/index`,
    });

    return { playlistKey: uploaded.publicId, playlistUrl: uploaded.secureUrl };
  }

  /**
   * Rewrite master.m3u8 to replace relative variant paths with CDN URLs,
   * then upload the rewritten master playlist.
   */
  private async uploadMasterPlaylist(
    localMasterPath: string,
    videoId: string,
    variantPlaylistUrls: Map<string, string>,
  ): Promise<{ masterKey: string; masterUrl: string }> {
    const content = await fs.promises.readFile(localMasterPath, 'utf-8');
    const rewritten = content
      .split('\n')
      .map((line) => {
        const trimmed = line.trim();
        const match = trimmed.match(/^(\w+)\/index\.m3u8$/);
        if (match && variantPlaylistUrls.has(match[1])) {
          return variantPlaylistUrls.get(match[1])!;
        }
        return line;
      })
      .join('\n');

    const rewrittenPath = path.join(
      path.dirname(localMasterPath),
      'master_cdn.m3u8',
    );
    await fs.promises.writeFile(rewrittenPath, rewritten, 'utf-8');

    const uploaded = await this.storage.upload(rewrittenPath, {
      resourceType: 'raw',
      publicId: `mvp-hls/hls/${videoId}/master`,
    });

    return { masterKey: uploaded.publicId, masterUrl: uploaded.secureUrl };
  }
}
