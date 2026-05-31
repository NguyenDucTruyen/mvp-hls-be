# DATABASE RULES

## Technology

- **PostgreSQL** (production and local dev via Docker)
- **TypeORM** as ORM (with NestJS `@nestjs/typeorm`)
- **UUID** primary keys everywhere (`gen_random_uuid()` / `uuid_generate_v4()`)
- Migrations managed via TypeORM CLI (`pnpm typeorm migration:run`)

## TypeORM Setup

- `DatabaseModule` is a global module that configures `TypeOrmModule.forRootAsync()`.
- Entity files are auto-loaded from `src/**/*.entity.ts`.
- `synchronize: false` in all environments — use migrations only.
- Connection config comes from `ConfigService`, never hardcoded.

```typescript
// database.module.ts
TypeOrmModule.forRootAsync({
  useFactory: (config: ConfigService) => ({
    type: 'postgres',
    url: config.get('DATABASE_URL'),
    entities: [__dirname + '/../../**/*.entity{.ts,.js}'],
    synchronize: false,
    logging: config.get('NODE_ENV') === 'development',
  }),
  inject: [ConfigService],
})
```

## Entity Conventions

### Primary Key
Always UUID, never auto-increment integer:
```typescript
@PrimaryGeneratedColumn('uuid')
id: string;
```

### Timestamps
Every entity must have:
```typescript
@CreateDateColumn({ name: 'created_at' })
createdAt: Date;

@UpdateDateColumn({ name: 'updated_at' })
updatedAt: Date;
```

### Column Naming
- TypeScript property: `camelCase`
- Database column: `snake_case` via explicit `name` option

```typescript
@Column({ name: 'raw_url', type: 'text' })
rawUrl: string;

@Column({ name: 'size_bytes', type: 'bigint' })
sizeBytes: number;
```

### Enums
Define TypeScript enum and map to PostgreSQL enum type:
```typescript
export enum VideoStatus {
  UPLOADED = 'uploaded',
  QUEUED = 'queued',
  PROCESSING = 'processing',
  READY = 'ready',
  FAILED = 'failed',
  DELETED = 'deleted',
}

@Column({ name: 'status', type: 'enum', enum: VideoStatus, default: VideoStatus.UPLOADED })
status: VideoStatus;
```

### Nullable Columns
Be explicit — all nullable columns must have `nullable: true`:
```typescript
@Column({ name: 'hls_key', type: 'text', nullable: true })
hlsKey: string | null;
```

### Soft Delete
Use `deleted_at` timestamp column instead of physical delete:
```typescript
@Column({ name: 'deleted_at', type: 'timestamptz', nullable: true })
deletedAt: Date | null;
```
All queries must filter `WHERE deleted_at IS NULL` by default.

## Entities in This Project

### `Video` (`videos` table)
```
id, title, description,
original_filename, mime_type, size_bytes,
raw_key, raw_url,
hls_key, playback_url,
thumbnail_key, thumbnail_url,
duration_sec, width, height,
status (VideoStatus enum),
progress (0-100),
error_message,
processed_at, deleted_at,
created_at, updated_at
```

### `VideoVariant` (`video_variants` table)
```
id, video_id (FK → videos),
quality_label (360p / 720p / 1080p),
width, height, bitrate_kbps,
playlist_key, playlist_url,
created_at
```
Unique constraint: `(video_id, quality_label)`

### `JobLog` (`jobs_log` table)
```
id, video_id (FK → videos),
queue_job_id, type (JobType enum),
status (JobStatus enum),
attempt, message, error_stack,
started_at, finished_at, created_at
```

## Repository Interface Pattern

Every entity has an interface that describes the data access contract:

```typescript
// video.repository.interface.ts
export interface IVideoRepository {
  findById(id: string): Promise<Video | null>;
  findAll(options?: { status?: VideoStatus }): Promise<Video[]>;
  create(data: CreateVideoData): Promise<Video>;
  updateStatus(id: string, status: VideoStatus): Promise<void>;
  setProgress(id: string, progress: number): Promise<void>;
  setFailed(id: string, errorMessage: string): Promise<void>;
  setReady(id: string, data: ReadyVideoData): Promise<void>;
  softDelete(id: string): Promise<void>;
}
```

## Repository Implementation

```typescript
// video.repository.ts
@Injectable()
export class VideoRepository implements IVideoRepository {
  constructor(
    @InjectRepository(Video)
    private readonly repo: Repository<Video>,
  ) {}

  async findById(id: string): Promise<Video | null> {
    return this.repo.findOne({ where: { id, deletedAt: IsNull() } });
  }
  // ...
}
```

## Migrations

- All schema changes go through migration files — never use `synchronize: true`.
- Generate: `pnpm typeorm migration:generate src/infra/database/migrations/MigrationName`
- Run: `pnpm typeorm migration:run`
- Revert: `pnpm typeorm migration:revert`
- Migration files live in `src/infra/database/migrations/`.

## Indexes

Required indexes (already defined in schema):
- `idx_videos_status` on `videos(status)`
- `idx_videos_created_at` on `videos(created_at DESC)`
- `idx_jobs_video_id` on `jobs_log(video_id)`
- `idx_jobs_status` on `jobs_log(status)`
- `idx_variants_video_id` on `video_variants(video_id)`

When adding new queries that filter or sort by a column, add a migration to create the index.

## Query Rules

- Never use raw SQL strings unless TypeORM QueryBuilder is genuinely insufficient.
- Use `QueryBuilder` for complex joins or aggregations.
- Always paginate list queries — never return unbounded result sets.
- Default page size: 20, max: 100.
- Filter soft-deleted records in every list/find query.
