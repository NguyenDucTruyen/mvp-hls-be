/* eslint-disable @typescript-eslint/unbound-method */
import * as fs from 'fs';
import { Test, TestingModule } from '@nestjs/testing';
import {
  BadRequestException,
  ConflictException,
  NotFoundException,
} from '@nestjs/common';
import { VideoService } from './video.service';
import { VIDEO_REPOSITORY } from '../repositories/video.repository.interface';
import type { IVideoRepository } from '../repositories/video.repository.interface';
import { STORAGE_ADAPTER } from '../../../infra/storage/storage.constants';
import type { IStorageAdapter } from '../../../infra/storage/storage.interface';
import { QueueService } from '../../../infra/queue/queue.service';
import { VideoStatus } from '../entities/video.entity';

// ── Helpers ──────────────────────────────────────────────────────────────────

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

function makeQueueService(): jest.Mocked<
  Pick<QueueService, 'enqueueTranscode' | 'enqueueThumbnail' | 'enqueueCleanup'>
> {
  return {
    enqueueTranscode: jest.fn().mockResolvedValue(undefined),
    enqueueThumbnail: jest.fn().mockResolvedValue(undefined),
    enqueueCleanup: jest.fn().mockResolvedValue(undefined),
  };
}

function makeMulterFile(
  overrides: Partial<Express.Multer.File> = {},
): Express.Multer.File {
  return {
    fieldname: 'file',
    originalname: 'sample.mp4',
    encoding: '7bit',
    mimetype: 'video/mp4',
    size: 2048,
    buffer: Buffer.from('fake-video-data'),
    stream: null as unknown as Express.Multer.File['stream'],
    destination: '',
    filename: '',
    path: '',
    ...overrides,
  };
}

function makeVideo(overrides: Record<string, unknown> = {}) {
  return {
    id: 'uuid-video-1',
    title: 'My Test Video',
    description: null,
    originalFilename: 'sample.mp4',
    mimeType: 'video/mp4',
    sizeBytes: 2048,
    rawKey: 'mvp-hls/raw/abc',
    rawUrl: 'https://res.cloudinary.com/raw/abc.mp4',
    hlsKey: null,
    playbackUrl: null,
    thumbnailKey: null,
    thumbnailUrl: null,
    durationSec: null,
    width: null,
    height: null,
    status: VideoStatus.UPLOADED,
    progress: 0,
    errorMessage: null,
    processedAt: null,
    deletedAt: null,
    variants: [],
    createdAt: new Date('2026-01-01'),
    updatedAt: new Date('2026-01-01'),
    ...overrides,
  };
}

// ── Tests ─────────────────────────────────────────────────────────────────────

describe('VideoService', () => {
  let service: VideoService;
  let videoRepo: jest.Mocked<IVideoRepository>;
  let storage: jest.Mocked<IStorageAdapter>;
  let queueService: ReturnType<typeof makeQueueService>;

  beforeEach(async () => {
    videoRepo = makeVideoRepo();
    storage = makeStorage();
    queueService = makeQueueService();

    const module: TestingModule = await Test.createTestingModule({
      providers: [
        VideoService,
        { provide: VIDEO_REPOSITORY, useValue: videoRepo },
        { provide: STORAGE_ADAPTER, useValue: storage },
        { provide: QueueService, useValue: queueService },
      ],
    }).compile();

    service = module.get(VideoService);
  });

  beforeEach(() => {
    jest
      .spyOn(fs.promises, 'writeFile')
      .mockImplementation(() => Promise.resolve());
    jest
      .spyOn(fs.promises, 'unlink')
      .mockImplementation(() => Promise.resolve());
  });

  afterEach(() => {
    jest.restoreAllMocks();
  });

  // ── uploadVideo ─────────────────────────────────────────────────────────

  describe('uploadVideo', () => {
    it('uploads file, creates DB record, and enqueues transcode job', async () => {
      const file = makeMulterFile();
      const dto = { title: 'My Test Video' };
      const createdVideo = makeVideo();

      storage.upload.mockResolvedValue({
        publicId: 'mvp-hls/raw/abc',
        url: 'http://res.cloudinary.com/raw/abc.mp4',
        secureUrl: 'https://res.cloudinary.com/raw/abc.mp4',
      });
      videoRepo.create.mockResolvedValue(createdVideo as never);

      const result = await service.uploadVideo(file, dto);

      expect(fs.promises.writeFile).toHaveBeenCalled();
      expect(storage.upload).toHaveBeenCalledWith(
        expect.stringMatching(/\.mp4$/),
        { folder: 'mvp-hls/raw', resourceType: 'video' },
      );
      expect(videoRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'My Test Video',
          originalFilename: 'sample.mp4',
          mimeType: 'video/mp4',
          sizeBytes: 2048,
        }),
      );
      expect(videoRepo.updateStatus).toHaveBeenCalledWith(
        'uuid-video-1',
        VideoStatus.QUEUED,
      );
      expect(queueService.enqueueTranscode).toHaveBeenCalledWith(
        'uuid-video-1',
      );
      expect(result.status).toBe(VideoStatus.QUEUED);
    });

    it('removes the temp file even when upload fails', async () => {
      const file = makeMulterFile();
      storage.upload.mockRejectedValue(new Error('Cloudinary unavailable'));

      await expect(
        service.uploadVideo(file, { title: 'fail' }),
      ).rejects.toThrow('Cloudinary unavailable');

      expect(fs.promises.unlink).toHaveBeenCalled();
    });
  });

  describe('createSignedUpload', () => {
    it('creates a pending video and returns signed Cloudinary upload parameters', async () => {
      const createdVideo = makeVideo({ rawKey: null, rawUrl: null });
      videoRepo.create.mockResolvedValue(createdVideo as never);
      storage.createSignedUpload.mockResolvedValue({
        uploadUrl: 'https://api.cloudinary.com/v1_1/demo/video/upload',
        publicId: 'mvp-hls/raw/uuid-video-1',
        apiKey: 'api-key',
        timestamp: 1781111111,
        signature: 'signed',
        resourceType: 'video',
      });

      const result = await service.createSignedUpload({
        title: 'Direct Upload',
        originalFilename: 'direct.mp4',
        mimeType: 'video/mp4',
        sizeBytes: 2048,
      });

      expect(videoRepo.create).toHaveBeenCalledWith(
        expect.objectContaining({
          title: 'Direct Upload',
          originalFilename: 'direct.mp4',
          rawKey: null,
          rawUrl: null,
        }),
      );
      expect(storage.createSignedUpload).toHaveBeenCalledWith({
        publicId: 'mvp-hls/raw/uuid-video-1',
        resourceType: 'video',
        maxFileSize: 500 * 1024 * 1024,
      });
      expect(result.videoId).toBe('uuid-video-1');
      expect(result.uploadParams.public_id).toBe('mvp-hls/raw/uuid-video-1');
    });
  });

  describe('completeSignedUpload', () => {
    it('verifies upload metadata, stores raw asset, and queues transcode', async () => {
      const video = makeVideo({ rawKey: null, rawUrl: null });
      videoRepo.findById.mockResolvedValue(video as never);
      storage.verifyUploadResult.mockResolvedValue(true);

      const result = await service.completeSignedUpload('uuid-video-1', {
        publicId: 'mvp-hls/raw/uuid-video-1',
        version: 1781111111,
        signature: 'response-signature',
        secureUrl:
          'https://res.cloudinary.com/demo/video/upload/v1/mvp-hls/raw/uuid-video-1.mp4',
      });

      expect(storage.verifyUploadResult).toHaveBeenCalledWith({
        publicId: 'mvp-hls/raw/uuid-video-1',
        version: 1781111111,
        signature: 'response-signature',
        secureUrl:
          'https://res.cloudinary.com/demo/video/upload/v1/mvp-hls/raw/uuid-video-1.mp4',
      });
      expect(videoRepo.updateRawAsset).toHaveBeenCalledWith('uuid-video-1', {
        rawKey: 'mvp-hls/raw/uuid-video-1',
        rawUrl:
          'https://res.cloudinary.com/demo/video/upload/v1/mvp-hls/raw/uuid-video-1.mp4',
      });
      expect(videoRepo.updateStatus).toHaveBeenCalledWith(
        'uuid-video-1',
        VideoStatus.QUEUED,
      );
      expect(queueService.enqueueTranscode).toHaveBeenCalledWith(
        'uuid-video-1',
      );
      expect(result.status).toBe(VideoStatus.QUEUED);
    });

    it('rejects completion when the public id does not match the video', async () => {
      videoRepo.findById.mockResolvedValue(makeVideo() as never);

      await expect(
        service.completeSignedUpload('uuid-video-1', {
          publicId: 'mvp-hls/raw/other-video',
          version: 1781111111,
          signature: 'response-signature',
          secureUrl:
            'https://res.cloudinary.com/demo/video/upload/v1/mvp-hls/raw/other-video.mp4',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(queueService.enqueueTranscode).not.toHaveBeenCalled();
    });

    it('rejects completion when Cloudinary response signature is invalid', async () => {
      videoRepo.findById.mockResolvedValue(makeVideo() as never);
      storage.verifyUploadResult.mockResolvedValue(false);

      await expect(
        service.completeSignedUpload('uuid-video-1', {
          publicId: 'mvp-hls/raw/uuid-video-1',
          version: 1781111111,
          signature: 'bad-signature',
          secureUrl:
            'https://res.cloudinary.com/demo/video/upload/v1/mvp-hls/raw/uuid-video-1.mp4',
        }),
      ).rejects.toThrow(BadRequestException);
      expect(queueService.enqueueTranscode).not.toHaveBeenCalled();
    });
  });

  // ── findById ────────────────────────────────────────────────────────────

  describe('findById', () => {
    it('returns the video when it exists', async () => {
      const video = makeVideo();
      videoRepo.findById.mockResolvedValue(video as never);

      const result = await service.findById('uuid-video-1');

      expect(result).toBe(video);
      expect(videoRepo.findById).toHaveBeenCalledWith('uuid-video-1');
    });

    it('throws NotFoundException when video does not exist', async () => {
      videoRepo.findById.mockResolvedValue(null);

      await expect(service.findById('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── retryVideo ─────────────────────────────────────────────────────────

  describe('retryVideo', () => {
    it('resets progress, sets QUEUED status, and enqueues transcode for a FAILED video', async () => {
      const failedVideo = makeVideo({
        status: VideoStatus.FAILED,
        progress: 40,
        errorMessage: 'ffmpeg crash',
      });
      videoRepo.findById.mockResolvedValue(failedVideo as never);

      const result = await service.retryVideo('uuid-video-1');

      expect(videoRepo.updateStatus).toHaveBeenCalledWith(
        'uuid-video-1',
        VideoStatus.QUEUED,
      );
      expect(videoRepo.setProgress).toHaveBeenCalledWith('uuid-video-1', 0);
      expect(queueService.enqueueTranscode).toHaveBeenCalledWith(
        'uuid-video-1',
      );
      expect(result.status).toBe(VideoStatus.QUEUED);
      expect(result.progress).toBe(0);
    });

    it('throws ConflictException when video status is not FAILED', async () => {
      const processingVideo = makeVideo({ status: VideoStatus.PROCESSING });
      videoRepo.findById.mockResolvedValue(processingVideo as never);

      await expect(service.retryVideo('uuid-video-1')).rejects.toThrow(
        ConflictException,
      );
      expect(queueService.enqueueTranscode).not.toHaveBeenCalled();
    });

    it('throws NotFoundException when video does not exist', async () => {
      videoRepo.findById.mockResolvedValue(null);

      await expect(service.retryVideo('non-existent')).rejects.toThrow(
        NotFoundException,
      );
    });
  });

  // ── deleteVideo ─────────────────────────────────────────────────────────

  describe('deleteVideo', () => {
    it('soft-deletes an existing video', async () => {
      const video = makeVideo();
      videoRepo.findById.mockResolvedValue(video as never);

      await service.deleteVideo('uuid-video-1');

      expect(videoRepo.softDelete).toHaveBeenCalledWith('uuid-video-1');
    });

    it('throws NotFoundException when video does not exist', async () => {
      videoRepo.findById.mockResolvedValue(null);

      await expect(service.deleteVideo('non-existent')).rejects.toThrow(
        NotFoundException,
      );
      expect(videoRepo.softDelete).not.toHaveBeenCalled();
    });
  });

  // ── findAll ──────────────────────────────────────────────────────────────

  describe('findAll', () => {
    it('delegates to repository with forwarded options', async () => {
      const videos = [makeVideo()];
      videoRepo.findAll.mockResolvedValue({
        videos: videos as never,
        total: 1,
      });

      const result = await service.findAll({ page: 1, limit: 10 });

      expect(videoRepo.findAll).toHaveBeenCalledWith({
        status: undefined,
        page: 1,
        limit: 10,
      });
      expect(result.total).toBe(1);
      expect(result.videos).toHaveLength(1);
    });
  });
});
