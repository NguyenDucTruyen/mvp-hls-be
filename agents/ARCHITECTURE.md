# ARCHITECTURE

## Folder Structure

```
src/
├── main.ts                          # Bootstrap
├── app.module.ts                    # Root module (imports all feature modules)
│
├── shared/
│   ├── filters/
│   │   └── http-exception.filter.ts
│   ├── interceptors/
│   │   └── response.interceptor.ts
│   ├── types/
│   │   └── api-response.type.ts
│   └── utils/
│       └── api-response.util.ts
│
├── modules/
│   ├── system/                          # DB connection + entity barrel
│   │   ├── entities/
│   │   │   ├── audit-column.ts          # AuditEntity base (createdAt/updatedAt/deletedAt)
│   │   │   └── index.ts                 # Named re-exports for TypeORM entity loading
│   │   └── modules/
│   │       └── system.module.ts         # TypeORM forRootAsync + ConfigModule
│   │
│   ├── videos/                          # Feature: video CRUD + upload trigger
│   │   ├── controllers/
│   │   │   └── video.controller.ts
│   │   ├── services/
│   │   │   ├── video.service.ts
│   │   │   └── video.service.spec.ts    # Unit tests (10 cases)
│   │   ├── repositories/
│   │   │   ├── video.repository.interface.ts
│   │   │   └── video.repository.ts
│   │   ├── dto/
│   │   │   ├── upload-video.dto.ts
│   │   │   ├── list-videos.dto.ts
│   │   │   └── video-response.dto.ts
│   │   ├── entities/
│   │   │   ├── video.entity.ts
│   │   │   └── video-variant.entity.ts
│   │   └── modules/
│   │       └── video.module.ts
│   │
├── infra/
│   ├── database/
│   │   ├── data-source.ts           # TypeORM CLI DataSource (migrations)
│   │   ├── entities/
│   │   │   └── job-log.entity.ts        # JobLog entity (jobs_log table)
│   │   ├── repositories/
│   │   │   ├── job-log.repository.interface.ts
│   │   │   └── job-log.repository.ts
│   │   └── migrations/
│   │       └── 1748649600000-InitialSchema.ts
│   │
│   ├── storage/
│   │   ├── storage.module.ts        # @Global provider of STORAGE_ADAPTER
│   │   ├── storage.interface.ts     # IStorageAdapter
│   │   ├── storage.constants.ts     # STORAGE_ADAPTER token
│   │   └── cloudinary.storage.ts    # Implements IStorageAdapter
│   │
│   ├── queue/
│   │   ├── queue.module.ts          # @Global BullMQ producer setup
│   │   ├── queue.service.ts         # enqueueTranscode/Thumbnail/Cleanup (retry options)
│   │   └── queue.constants.ts       # VIDEO_QUEUE, JobType constants
│   │
│   └── ffmpeg/
│       ├── ffmpeg.module.ts         # @Global FfmpegService provider
│       └── ffmpeg.service.ts        # transcode() + generateThumbnail()
│
└── workers/
    ├── worker.module.ts             # BullMQ @Processor registration
    ├── video.worker.ts              # Handles transcode-hls, generate-thumbnail, cleanup-temp
    └── video.worker.spec.ts         # Unit tests (9 cases)
```

## Module Dependency Graph

```
AppModule
  ├── SystemModule          ← TypeORM forRootAsync + ConfigModule (@global)
  ├── StorageModule         ← @Global, exports STORAGE_ADAPTER
  ├── QueueModule           ← @Global, exports QueueService
  ├── FfmpegModule          ← @Global, exports FfmpegService
  ├── VideoModule           ← VideoController + VideoService + VideoRepository
  └── WorkerModule          ← VideoWorker + VideoRepository + JobLogRepository

WorkerModule (same process, separate registration)
  ├── TypeOrmModule.forFeature([Video, VideoVariant, JobLog])
  ├── VideoRepository  (provide: VIDEO_REPOSITORY)
  └── JobLogRepository (provide: JOB_LOG_REPOSITORY)
  GlobalDeps (injected automatically via @Global):
    ├── StorageModule   → STORAGE_ADAPTER
    ├── QueueModule     → QueueService
    └── FfmpegModule    → FfmpegService
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

- `VideoWorker` is a NestJS `@Processor('video-processing')` class extending `WorkerHost`.
- Single `process(job)` method dispatches to `handleTranscode` / `handleThumbnail` / `handleCleanup`.
- Worker updates video status in DB after each step.
- **JobLog tracking**: every job creates a row in `jobs_log` at start, updated on completion or failure.
- **Error handling**: transcode errors call `videoRepo.setFailed` + `jobLogRepo.markFailed`, then re-throw for BullMQ retry (max 3, exponential backoff 5s).
- **Job chain**: transcode success → enqueuesThumbnail; thumbnail success → enqueuesCleanup.

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
