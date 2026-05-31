# ARCHITECTURE

## Folder Structure

```
src/
├── main.ts                          # Bootstrap
├── app.module.ts                    # Root module (imports all feature modules)
├── app.controller.ts                # Health check only
│
├── config/
│   └── configuration.ts            # Typed env config (ConfigModule)
│
├── modules/
│   ├── videos/                      # Feature: video CRUD + upload trigger
│   │   ├── controllers/
│   │   │   └── video.controller.ts
│   │   ├── services/
│   │   │   └── video.service.ts
│   │   ├── repositories/
│   │   │   ├── video.repository.interface.ts
│   │   │   └── video.repository.ts
│   │   ├── dto/
│   │   │   ├── upload-video.dto.ts
│   │   │   └── update-video-status.dto.ts
│   │   ├── entities/
│   │   │   ├── video.entity.ts
│   │   │   └── video-variant.entity.ts
│   │   └── modules/
│   │       └── video.module.ts
│   │
│   └── user/                        # Reference pattern (already exists)
│       ├── controllers/
│       ├── services/
│       ├── interfaces/
│       └── modules/
│
├── infra/
│   ├── database/
│   │   ├── database.module.ts       # TypeORM async config
│   │   └── entities/
│   │       └── job-log.entity.ts
│   │
│   ├── storage/
│   │   ├── storage.module.ts
│   │   ├── storage.interface.ts     # IStorageAdapter
│   │   └── cloudinary.storage.ts   # Implements IStorageAdapter
│   │
│   ├── queue/
│   │   ├── queue.module.ts          # BullMQ producer setup
│   │   ├── queue.service.ts         # enqueueTranscode(), enqueueThumbnail()
│   │   └── queue.constants.ts       # Queue names, job type strings
│   │
│   └── ffmpeg/
│       ├── ffmpeg.module.ts
│       └── ffmpeg.service.ts        # transcode(), generateThumbnail()
│
└── workers/
    ├── worker.module.ts             # BullMQ worker registration
    └── video.worker.ts              # Handles transcode-hls, generate-thumbnail, cleanup-temp
```

## Module Dependency Graph

```
AppModule
  └── VideoModule
        ├── DatabaseModule      (TypeORM connection)
        ├── StorageModule       (Cloudinary adapter)
        └── QueueModule         (BullMQ producer)

WorkerModule (separate process or same app)
  ├── DatabaseModule
  ├── StorageModule
  └── FfmpegModule
```

## Key Design Decisions

### 1. Repository Pattern
- Services NEVER import TypeORM `Repository<T>` directly.
- Services depend on `IVideoRepository` interface (injected via token).
- `VideoRepository` implements the interface and wraps TypeORM.
- Injection token: `VIDEO_REPOSITORY` (string constant).

### 2. Storage Abstraction
- `IStorageAdapter` interface with `upload()`, `delete()`, `getUrl()`.
- `CloudinaryStorageAdapter` implements it.
- Injected via `STORAGE_ADAPTER` token.
- Swappable to S3 in the future without touching service code.

### 3. Queue Abstraction
- `QueueService` encapsulates BullMQ `Queue` instance.
- Service calls `queueService.enqueueTranscode(videoId)`, not BullMQ directly.
- Job type strings defined in `queue.constants.ts`.

### 4. Worker
- `VideoWorker` is a NestJS `@Processor('video-processing')` class.
- Each job type handled by a separate `@Process(JOB_TYPE)` method.
- Worker updates video status in DB after each step.

### 5. Configuration
- All env vars accessed through `ConfigService` (typed).
- No `process.env` access outside `config/configuration.ts`.

## Data Flow: Upload

```
POST /api/videos/upload (multipart)
  → VideoController
  → VideoService.uploadVideo(file, dto)
      → StorageAdapter.upload(file) → Cloudinary raw URL
      → VideoRepository.create({ ...metadata, status: 'uploaded' })
      → QueueService.enqueueTranscode(video.id)
      → VideoRepository.updateStatus(id, 'queued')
  ← { id, status: 'queued' }
```

## Data Flow: Worker

```
BullMQ job received (transcode-hls, { videoId })
  → VideoWorker.handleTranscode(job)
      → VideoRepository.updateStatus(id, 'processing')
      → StorageAdapter.download(rawKey) → temp file
      → FfmpegService.transcode(tempFile) → HLS segments
      → StorageAdapter.uploadDirectory(hlsDir) → Cloudinary
      → VideoRepository.saveVariants(variants)
      → FfmpegService.generateThumbnail() → thumb.jpg
      → StorageAdapter.upload(thumb) → thumbnailUrl
      → VideoRepository.updateStatus(id, 'ready')
      → QueueService.enqueueCleanup(videoId)
  [on error]
      → VideoRepository.setFailed(id, error.message)
      → throw error (BullMQ retries up to 3x)
```
