# CODING RULES

## General

- Language: **TypeScript strict mode** (`strict: true` in tsconfig)
- Formatter: **Prettier** (run `pnpm format` before committing)
- Linter: **ESLint** (run `pnpm lint` before committing)
- No `any` type unless absolutely unavoidable — use `unknown` and narrow it
- No commented-out code left in files
- No `console.log` in production code — use NestJS `Logger`

## NestJS Patterns

### Controllers
- Controllers are **thin**. No business logic, no DB calls, no storage calls.
- Only: parse request → call service → return response.
- Use `@Controller('api/videos')` prefix.
- Always declare return types explicitly.
- Use `@HttpCode(HttpStatus.CREATED)` for POST endpoints that create resources.

```typescript
// GOOD
@Post('upload')
@HttpCode(HttpStatus.CREATED)
async uploadVideo(@UploadedFile() file: Express.Multer.File, @Body() dto: UploadVideoDto) {
  return this.videoService.uploadVideo(file, dto);
}

// BAD — business logic in controller
@Post('upload')
async uploadVideo(@UploadedFile() file: Express.Multer.File) {
  const url = await this.cloudinary.upload(file); // ❌
  const video = await this.videoRepo.create({ url }); // ❌
  return video;
}
```

### Services
- Services contain **all business logic**.
- Services depend on **repository interfaces**, not concrete TypeORM repos.
- Services depend on **IStorageAdapter** and **QueueService** abstractions.
- Never import `InjectRepository` from TypeORM inside a service.
- Always inject via constructor with typed interfaces.

```typescript
// GOOD
@Injectable()
export class VideoService {
  constructor(
    @Inject(VIDEO_REPOSITORY) private readonly videoRepo: IVideoRepository,
    @Inject(STORAGE_ADAPTER) private readonly storage: IStorageAdapter,
    private readonly queueService: QueueService,
  ) {}
}

// BAD
@Injectable()
export class VideoService {
  constructor(
    @InjectRepository(Video) private readonly repo: Repository<Video>, // ❌
  ) {}
}
```

### Repositories
- Every feature has a repository **interface** in `repositories/[name].repository.interface.ts`.
- Concrete implementation in `repositories/[name].repository.ts`.
- Use injection token constant: `export const VIDEO_REPOSITORY = 'VIDEO_REPOSITORY'`.
- Register in module as:
  ```typescript
  { provide: VIDEO_REPOSITORY, useClass: VideoRepository }
  ```

### DTOs
- All request bodies and query params use **DTO classes**.
- Use `class-validator` decorators for validation.
- Use `class-transformer` with `@Transform` when needed.
- DTOs live in `dto/` inside the feature folder.
- Naming: `upload-video.dto.ts`, `update-video.dto.ts`.

```typescript
import { IsString, IsNotEmpty, IsOptional, MaxLength } from 'class-validator';

export class UploadVideoDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(255)
  title: string;

  @IsOptional()
  @IsString()
  description?: string;
}
```

- Enable global `ValidationPipe` in `main.ts`:
  ```typescript
  app.useGlobalPipes(new ValidationPipe({ whitelist: true, forbidNonWhitelisted: true }));
  ```

### Entities
- Entities live in `entities/` inside the feature folder.
- Use TypeORM decorators: `@Entity`, `@Column`, `@PrimaryGeneratedColumn('uuid')`.
- Always define `created_at` and `updated_at` with `@CreateDateColumn` / `@UpdateDateColumn`.
- Use `snake_case` for column names: `@Column({ name: 'raw_url' })`.
- Enums defined in the entity file or a separate `enums/` file.

### Interfaces
- Repository interfaces, service interfaces, and adapter interfaces go in `interfaces/` or next to the implementation.
- Use `I` prefix: `IVideoRepository`, `IStorageAdapter`.
- Injection tokens as `const` strings in a `constants.ts` file.

## Module Registration

Every module must register:
1. Controllers in `controllers: []`
2. Providers (services, repositories with tokens)
3. Imports for other modules it depends on
4. Exports for what other modules can use

```typescript
@Module({
  imports: [DatabaseModule, StorageModule, QueueModule],
  controllers: [VideoController],
  providers: [
    VideoService,
    { provide: VIDEO_REPOSITORY, useClass: VideoRepository },
  ],
  exports: [VideoService],
})
export class VideoModule {}
```

## Error Handling

- Throw NestJS built-in exceptions in services:
  - `NotFoundException` — resource not found
  - `BadRequestException` — invalid input
  - `InternalServerErrorException` — unexpected errors
- Do NOT throw raw `Error` objects from services.
- Worker errors: throw the error so BullMQ can retry; log with `Logger`.

## Logging

```typescript
private readonly logger = new Logger(VideoService.name);

this.logger.log(`Starting transcode for video ${videoId}`);
this.logger.error(`Transcode failed: ${error.message}`, error.stack);
```

## File Naming Conventions

| Type            | Pattern                          | Example                        |
|-----------------|----------------------------------|--------------------------------|
| Controller      | `[name].controller.ts`           | `video.controller.ts`          |
| Service         | `[name].service.ts`              | `video.service.ts`             |
| Repository impl | `[name].repository.ts`           | `video.repository.ts`          |
| Repo interface  | `[name].repository.interface.ts` | `video.repository.interface.ts`|
| DTO             | `[action]-[name].dto.ts`         | `upload-video.dto.ts`          |
| Entity          | `[name].entity.ts`               | `video.entity.ts`              |
| Module          | `[name].module.ts`               | `video.module.ts`              |
| Constants       | `[name].constants.ts`            | `queue.constants.ts`           |
| Spec            | `[name].spec.ts`                 | `video.service.spec.ts`        |

## Testing

- Unit tests for **services** and **repositories** only.
- Mock all injected dependencies using Jest mocks.
- Test file next to the source file: `video.service.spec.ts`.
- E2E tests in `/test/`.
- Use `@nestjs/testing` `Test.createTestingModule()`.
