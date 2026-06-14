/* eslint-disable @typescript-eslint/unbound-method */
import * as fs from 'fs';
import { VideoWorker } from './video.worker';
import { VideoStatus } from '../modules/videos/entities/video.entity';
import { JobType } from '../infra/queue/queue.constants';
import type { IVideoRepository } from '../modules/videos/repositories/video.repository.interface';
import type { IStorageAdapter } from '../infra/storage/storage.interface';
import type { IJobLogRepository } from '../infra/database/repositories/job-log.repository.interface';
import type { FfmpegService } from '../infra/ffmpeg/ffmpeg.service';
import type { QueueService } from '../infra/queue/queue.service';
import type { Job } from 'bullmq';

// ── Helpers ───────────────────────────────────────────────────────────────────

function makeJob(
  name: string,
  videoId: string,
  id = 'bullmq-job-1',
): Job<{ videoId: string }> {
  return {
    id,
    name,
    data: { videoId },
    attemptsMade: 0,
  } as unknown as Job<{ videoId: string }>;
}

function makeVideoRepo(): jest.Mocked<IVideoRepository> {
  return {
    findById: jest.fn(),
    findAll: jest.fn(),
    create: jest.fn(),
    updateRawAsset: jest.fn().mockResolvedValue(undefined),
    updateStatus: jest.fn().mockResolvedValue(undefined),
    setProgress: jest.fn().mockResolvedValue(undefined),
    setFailed: jest.fn().mockResolvedValue(undefined),
    setReady: jest.fn().mockResolvedValue(undefined),
    saveVariants: jest.fn().mockResolvedValue([]),
    softDelete: jest.fn().mockResolvedValue(undefined),
  };
}

function makeStorage(): jest.Mocked<IStorageAdapter> {
  return {
    upload: jest.fn(),
    createSignedUpload: jest.fn(),
    verifyUploadResult: jest.fn(),
    delete: jest.fn(),
    downloadToTemp: jest.fn().mockResolvedValue(undefined),
  };
}

function makeJobLogRepo(): jest.Mocked<IJobLogRepository> {
  return {
    create: jest.fn().mockResolvedValue({ id: 'log-1', videoId: 'video-1' }),
    markCompleted: jest.fn().mockResolvedValue(undefined),
    markFailed: jest.fn().mockResolvedValue(undefined),
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('VideoWorker', () => {
  let worker: VideoWorker;
  let videoRepo: jest.Mocked<IVideoRepository>;
  let storage: jest.Mocked<IStorageAdapter>;
  let jobLogRepo: jest.Mocked<IJobLogRepository>;
  let ffmpegService: jest.Mocked<
    Pick<FfmpegService, 'transcode' | 'generateThumbnail'>
  >;
  let queueService: jest.Mocked<
    Pick<
      QueueService,
      'enqueueTranscode' | 'enqueueThumbnail' | 'enqueueCleanup'
    >
  >;

  beforeEach(() => {
    videoRepo = makeVideoRepo();
    storage = makeStorage();
    jobLogRepo = makeJobLogRepo();
    ffmpegService = {
      transcode: jest.fn(),
      generateThumbnail: jest.fn(),
    };
    queueService = {
      enqueueTranscode: jest.fn().mockResolvedValue(undefined),
      enqueueThumbnail: jest.fn().mockResolvedValue(undefined),
      enqueueCleanup: jest.fn().mockResolvedValue(undefined),
    };

    worker = new VideoWorker(
      videoRepo,
      storage,
      jobLogRepo,
      ffmpegService as unknown as FfmpegService,
      queueService as unknown as QueueService,
    );
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── process() dispatch ───────────────────────────────────────────────────

  describe('process() dispatch', () => {
    it('routes TRANSCODE_HLS to handleTranscode', async () => {
      const spy = jest
        .spyOn(
          worker as unknown as Record<string, () => Promise<void>>,
          'handleTranscode',
        )
        .mockResolvedValue(undefined);

      await worker.process(makeJob(JobType.TRANSCODE_HLS, 'video-1'));

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('routes GENERATE_THUMBNAIL to handleThumbnail', async () => {
      const spy = jest
        .spyOn(
          worker as unknown as Record<string, () => Promise<void>>,
          'handleThumbnail',
        )
        .mockResolvedValue(undefined);

      await worker.process(makeJob(JobType.GENERATE_THUMBNAIL, 'video-1'));

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('routes CLEANUP_TEMP to handleCleanup', async () => {
      const spy = jest
        .spyOn(
          worker as unknown as Record<string, () => Promise<void>>,
          'handleCleanup',
        )
        .mockResolvedValue(undefined);

      await worker.process(makeJob(JobType.CLEANUP_TEMP, 'video-1'));

      expect(spy).toHaveBeenCalledTimes(1);
    });

    it('throws an error for unknown job types', async () => {
      await expect(
        worker.process(makeJob('unsupported-type', 'video-1')),
      ).rejects.toThrow('Unknown job type: unsupported-type');
    });
  });

  // ── handleTranscode error path ───────────────────────────────────────────

  describe('handleTranscode — error handling', () => {
    it('calls setFailed + markFailed and re-throws when video is not found', async () => {
      videoRepo.findById.mockResolvedValue(null);

      await expect(
        worker.process(makeJob(JobType.TRANSCODE_HLS, 'video-1')),
      ).rejects.toThrow('Video video-1 not found');

      expect(videoRepo.setFailed).toHaveBeenCalledWith(
        'video-1',
        'Video video-1 not found',
      );
      expect(jobLogRepo.markFailed).toHaveBeenCalledWith(
        'log-1',
        'Video video-1 not found',
        expect.anything(),
        expect.any(Date),
      );
    });

    it('calls setFailed when video has no rawUrl', async () => {
      videoRepo.findById.mockResolvedValue({
        id: 'video-1',
        rawUrl: null,
        originalFilename: 'test.mp4',
        status: VideoStatus.QUEUED,
      } as never);

      await expect(
        worker.process(makeJob(JobType.TRANSCODE_HLS, 'video-1')),
      ).rejects.toThrow('Video video-1 has no rawUrl');

      expect(videoRepo.setFailed).toHaveBeenCalledWith(
        'video-1',
        'Video video-1 has no rawUrl',
      );
    });

    it('calls setFailed when a direct upload has not completed', async () => {
      videoRepo.findById.mockResolvedValue({
        id: 'video-1',
        rawUrl: null,
        originalFilename: 'test.mp4',
        status: VideoStatus.UPLOADED,
      } as never);

      await expect(
        worker.process(makeJob(JobType.TRANSCODE_HLS, 'video-1')),
      ).rejects.toThrow('Video video-1 upload has not completed');

      expect(videoRepo.setFailed).toHaveBeenCalledWith(
        'video-1',
        'Video video-1 upload has not completed',
      );
    });
  });

  // ── handleThumbnail error path ───────────────────────────────────────────

  describe('handleThumbnail — error handling', () => {
    it('calls markFailed and re-throws when video is not found', async () => {
      videoRepo.findById.mockResolvedValue(null);

      await expect(
        worker.process(makeJob(JobType.GENERATE_THUMBNAIL, 'video-1')),
      ).rejects.toThrow('Video video-1 not found');

      expect(jobLogRepo.markFailed).toHaveBeenCalledWith(
        'log-1',
        'Video video-1 not found',
        expect.anything(),
        expect.any(Date),
      );
    });

    it('does not call videoRepo.setFailed for thumbnail errors (only transcode sets failed status)', async () => {
      videoRepo.findById.mockResolvedValue(null);

      await expect(
        worker.process(makeJob(JobType.GENERATE_THUMBNAIL, 'video-1')),
      ).rejects.toThrow();

      expect(videoRepo.setFailed).not.toHaveBeenCalled();
    });
  });

  // ── handleTranscode success path (partial — fs calls mocked) ────────────

  describe('handleTranscode — success path', () => {
    it('sets PROCESSING status, transcodes, persists variants, marks ready, then enqueues thumbnail', async () => {
      const fakeVideo = {
        id: 'video-1',
        rawUrl: 'https://res.cloudinary.com/raw/test.mp4',
        originalFilename: 'test.mp4',
        status: VideoStatus.QUEUED,
      };
      videoRepo.findById.mockResolvedValue(fakeVideo as never);

      const fakeTranscodeResult = {
        variants: [
          { label: '360p', width: 640, height: 360, bitrateKbps: 800 },
        ],
        source: { durationSec: 12.5, width: 640, height: 360 },
        masterPlaylistPath: '/tmp/video-1/hls/master.m3u8',
      };

      // Spy on private helpers to avoid real fs / ffmpeg calls
      jest
        .spyOn(
          worker as unknown as Record<string, () => Promise<unknown>>,
          'uploadVariantFiles',
        )
        .mockResolvedValue({
          playlistKey: 'mvp-hls/hls/video-1/360p/index',
          playlistUrl: 'https://cdn.example.com/hls/video-1/360p/index.m3u8',
        });
      jest
        .spyOn(
          worker as unknown as Record<string, () => Promise<unknown>>,
          'uploadMasterPlaylist',
        )
        .mockResolvedValue({
          masterKey: 'mvp-hls/hls/video-1/master',
          masterUrl: 'https://cdn.example.com/hls/video-1/master.m3u8',
        });

      // Mock fs.promises.mkdir so tmpDir creation doesn't hit disk
      const mkdirSpy = jest
        .spyOn(fs.promises, 'mkdir')
        .mockResolvedValue(undefined);

      ffmpegService.transcode = jest
        .fn()
        .mockResolvedValue(fakeTranscodeResult);

      await worker.process(makeJob(JobType.TRANSCODE_HLS, 'video-1'));

      expect(videoRepo.updateStatus).toHaveBeenCalledWith(
        'video-1',
        VideoStatus.PROCESSING,
      );
      expect(storage.downloadToTemp).toHaveBeenCalled();
      expect(ffmpegService.transcode).toHaveBeenCalled();
      expect(videoRepo.saveVariants).toHaveBeenCalled();
      expect(videoRepo.setReady).toHaveBeenCalledWith(
        'video-1',
        expect.objectContaining({
          playbackUrl: 'https://cdn.example.com/hls/video-1/master.m3u8',
          durationSec: 12.5,
          width: 640,
          height: 360,
        }),
      );
      expect(jobLogRepo.markCompleted).toHaveBeenCalledWith(
        'log-1',
        expect.any(Date),
      );
      expect(queueService.enqueueThumbnail).toHaveBeenCalledWith('video-1');

      mkdirSpy.mockRestore();
    });
  });
});
