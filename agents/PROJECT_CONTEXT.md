# PROJECT CONTEXT

## Overview

MVP video upload & HLS streaming platform. Users upload raw video files; the system transcodes them to HLS format via a background worker, then serves adaptive bitrate playback.

## Tech Stack

| Layer       | Technology                              |
|-------------|----------------------------------------|
| Framework   | NestJS 11 (TypeScript)                 |
| Database    | PostgreSQL (TypeORM)                   |
| Storage     | Cloudinary                             |
| Queue       | BullMQ                                 |
| Cache/Broker| Redis                                  |
| Transcoding | FFmpeg (local process)                 |
| Runtime     | Node.js                                |
| Package Mgr | pnpm                                   |

## Current State (MVP Complete — Phase 9)

- ✅ Phase 0: Database foundation (PostgreSQL, TypeORM, migration — all tables + enums created)
- ✅ Phase 1: Storage adapter (IStorageAdapter, CloudinaryStorageAdapter, StorageModule)
- ✅ Phase 2: Queue / BullMQ producer (constants, module, QueueService with retry options)
- ✅ Phase 3: Video entities & repository (Video, VideoVariant, IVideoRepository, VideoRepository)
- ✅ Phase 4: DTOs (UploadVideoDto, ListVideosDto, VideoResponseDto)
- ✅ Phase 5: VideoService & VideoController (5 endpoints: upload, list, detail, delete, retry)
- ✅ Phase 6: FfmpegService (transcode HLS 360p/720p/1080p + thumbnail, local test passed)
- ✅ Phase 7: VideoWorker (transcode → thumbnail → cleanup chain, error handling + BullMQ retry)
- ✅ Phase 8: JobLog tracking (JobLog entity, IJobLogRepository, worker writes start/end/fail rows)
- ✅ Phase 9: Unit tests (VideoService — 10 tests; VideoWorker — 9 tests), 0 TypeScript errors, build passes

## MVP Goals

1. ✅ Upload raw video → store on Cloudinary
2. ✅ Queue transcode job → process via BullMQ worker
3. ✅ FFmpeg transcodes to HLS (360p / 720p / 1080p)
4. ✅ Upload HLS files back to Cloudinary
5. ✅ Generate thumbnail
6. ✅ Expose REST API: upload, list, detail, delete, retry
7. ✅ Track status per video: `uploaded → queued → processing → ready / failed`

## Out of Scope (for MVP)

- Authentication / user accounts
- Private videos
- Subtitles / watermarks
- S3 migration
- Frontend (handled separately)

## Modules to Build

| Module    | Responsibility                                    | Status      |
|-----------|---------------------------------------------------|-------------|
| `videos`  | CRUD, upload trigger, status tracking             | ✅ Complete  |
| `queue`   | BullMQ producer — enqueue transcode jobs          | ✅ Complete  |
| `worker`  | BullMQ worker — consume jobs, call FFmpeg         | ✅ Complete  |
| `storage` | Cloudinary adapter (behind `IStorageAdapter`)     | ✅ Complete  |
| `ffmpeg`  | FFmpeg wrapper (transcode + thumbnail)            | ✅ Complete  |
| `db`      | TypeORM config, entities, migrations, job-log     | ✅ Complete  |

## Environment Variables Required

```
DATABASE_URL=postgresql://user:pass@localhost:5432/mvp_hls
REDIS_HOST=localhost
REDIS_PORT=6379
CLOUDINARY_CLOUD_NAME=
CLOUDINARY_API_KEY=
CLOUDINARY_API_SECRET=
PORT=3000
NODE_ENV=development
```
