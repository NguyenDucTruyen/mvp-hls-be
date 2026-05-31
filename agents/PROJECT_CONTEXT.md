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

## Current State (as of project start)

- NestJS app bootstrapped
- `UserModule` exists as a reference pattern (feature-based structure)
- No database connection yet
- No Cloudinary, BullMQ, or FFmpeg integration yet

## MVP Goals

1. Upload raw video → store on Cloudinary
2. Queue transcode job → process via BullMQ worker
3. FFmpeg transcodes to HLS (360p / 720p / 1080p)
4. Upload HLS files back to Cloudinary
5. Generate thumbnail
6. Expose REST API: upload, list, detail, delete, retry
7. Track status per video: `uploaded → queued → processing → ready / failed`

## Out of Scope (for MVP)

- Authentication / user accounts
- Private videos
- Subtitles / watermarks
- S3 migration
- Frontend (handled separately)

## Modules to Build

| Module   | Responsibility                                    |
|----------|---------------------------------------------------|
| `videos` | CRUD, upload trigger, status tracking             |
| `queue`  | BullMQ producer — enqueue transcode jobs          |
| `worker` | BullMQ worker — consume jobs, call FFmpeg         |
| `storage`| Cloudinary adapter (behind `IStorageAdapter`)     |
| `ffmpeg` | FFmpeg wrapper (transcode + thumbnail)            |
| `db`     | TypeORM config, entities, migrations              |

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
