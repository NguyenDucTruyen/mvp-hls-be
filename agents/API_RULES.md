# API RULES

## Base URL

```
/api
```

All endpoints are prefixed with `/api`. Set globally in `main.ts`:
```typescript
app.setGlobalPrefix('api');
```

## Versioning

No URL versioning for MVP. Add `v1` prefix only when breaking changes require it.

## Endpoints

| Method | Path                     | Description              | Status Code  |
|--------|--------------------------|--------------------------|--------------|
| POST   | `/api/videos/upload`     | Upload raw video         | 201          |
| GET    | `/api/videos`            | List all videos          | 200          |
| GET    | `/api/videos/:id`        | Get video detail         | 200          |
| DELETE | `/api/videos/:id`        | Soft-delete video        | 204          |
| POST   | `/api/videos/:id/retry`  | Retry failed video       | 202          |

## Request Format

### Upload Video
- Method: `POST /api/videos/upload`
- Content-Type: `multipart/form-data`
- Fields:
  - `file` (required): video file binary
  - `title` (required): string, max 255 chars
  - `description` (optional): string

### List Videos
- Method: `GET /api/videos`
- Query params:
  - `status` (optional): filter by `VideoStatus` enum value
  - `page` (optional, default 1): pagination page
  - `limit` (optional, default 20, max 100): items per page

### Retry
- Method: `POST /api/videos/:id/retry`
- Body: none
- Only allowed when current status is `failed`

## Response Format

### Success — single resource
```json
{
  "data": {
    "id": "uuid",
    "title": "My Video",
    "status": "ready",
    "playbackUrl": "https://cdn.example.com/.../master.m3u8",
    "thumbnailUrl": "https://cdn.example.com/.../thumb.jpg",
    "progress": 100,
    "createdAt": "2026-01-01T00:00:00.000Z"
  }
}
```

### Success — list
```json
{
  "data": [ { ... }, { ... } ],
  "meta": {
    "total": 42,
    "page": 1,
    "limit": 20
  }
}
```

### Upload success (201)
```json
{
  "data": {
    "id": "uuid",
    "status": "queued"
  }
}
```

### Delete success (204)
Empty body.

### Retry success (202)
```json
{
  "data": {
    "id": "uuid",
    "status": "queued"
  }
}
```

## Error Format

All errors use this shape (handled by NestJS exception filters):
```json
{
  "statusCode": 404,
  "error": "Not Found",
  "message": "Video not found"
}
```

## HTTP Status Codes

| Scenario                    | Code |
|-----------------------------|------|
| Resource created            | 201  |
| Accepted (async action)     | 202  |
| Success, no content         | 204  |
| Validation failed           | 400  |
| Not found                   | 404  |
| Conflict (invalid state)    | 409  |
| Server error                | 500  |

## Validation Rules

- All request bodies validated via `ValidationPipe` (globally enabled).
- `whitelist: true` — strips unknown properties.
- `forbidNonWhitelisted: true` — throws 400 if unknown properties are sent.
- File upload: validate MIME type (`video/mp4`, `video/quicktime`, etc.) and max size in the controller using a `FileInterceptor` with `ParseFilePipe`.

```typescript
@Post('upload')
@UseInterceptors(FileInterceptor('file'))
async uploadVideo(
  @UploadedFile(
    new ParseFilePipe({
      validators: [
        new MaxFileSizeValidator({ maxSize: 2 * 1024 * 1024 * 1024 }), // 2GB
        new FileTypeValidator({ fileType: /^video\// }),
      ],
    }),
  )
  file: Express.Multer.File,
  @Body() dto: UploadVideoDto,
) { ... }
```

## Retry Endpoint Rules

- If video status is NOT `failed`, return `409 Conflict` with message `"Video is not in failed state"`.
- Service resets status to `uploaded`, clears `error_message`, then enqueues job again.

## Response Serialization

- Use `ClassSerializerInterceptor` globally to exclude sensitive/internal fields.
- Entities should use `@Exclude()` on DB-internal fields if exposed directly.
- Prefer dedicated response DTO classes (e.g., `VideoResponseDto`) over returning raw entities.

## CORS

Enable CORS in `main.ts` for development:
```typescript
app.enableCors({
  origin: process.env.FRONTEND_URL ?? 'http://localhost:5173',
  methods: ['GET', 'POST', 'DELETE'],
  credentials: false,
});
```

## Rate Limiting

Not required for MVP. Add `@nestjs/throttler` if needed post-MVP.
