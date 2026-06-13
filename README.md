# MVP HLS — Backend

REST API for an HLS video streaming platform built with **NestJS + TypeORM + BullMQ + Cloudinary**.

---

## Tech stack

| Layer            | Technology               |
| ---------------- | ------------------------ |
| Framework        | NestJS (Express)         |
| Language         | TypeScript               |
| Database         | PostgreSQL via TypeORM   |
| Queue            | BullMQ (Redis)           |
| Storage          | Cloudinary               |
| Video processing | FFmpeg (`fluent-ffmpeg`) |
| Package manager  | pnpm                     |

---

## Prerequisites

- Node.js ≥ 20
- pnpm ≥ 9
- PostgreSQL
- Redis

Copy `.env.example` to `.env` and fill in the required values before starting.

---

## Setup

```bash
pnpm install
```

---

## Running the server

```bash
# development (watch mode)
pnpm start:dev

# production
pnpm build && pnpm start:prod
```

Server starts at `http://localhost:3000` (or the `PORT` env variable).
All routes are prefixed with `/api`.

---

## API Documentation

The project uses a **code-free OpenAPI spec** — no decorators in controllers.
The spec is written manually in [`scripts/generate-openapi.ts`](scripts/generate-openapi.ts).

### Generate / update `openapi.yaml`

```bash
pnpm generate:openapi
# → writes openapi.yaml to the project root
```

### View the docs

**Option 1 — Local server (recommended)**

Start the server (`pnpm start:dev`) then open:

```
http://localhost:3000/api/docs
```

**Option 2 — Swagger UI (online, no install)**

1. Open [https://editor.swagger.io](https://editor.swagger.io)
2. `File → Import file` → select `openapi.yaml`

**Option 2 — Swagger UI via Docker**

```bash
docker run --rm -p 8080:8080 \
  -v "$(pwd)/openapi.yaml:/usr/share/nginx/html/openapi.yaml" \
  -e SWAGGER_JSON=/usr/share/nginx/html/openapi.yaml \
  swaggerapi/swagger-ui
# → open http://localhost:8080
```

**Option 3 — VS Code extension**

Install [OpenAPI (Swagger) Editor](https://marketplace.visualstudio.com/items?itemName=42Crunch.vscode-openapi), open `openapi.yaml`, press `Ctrl+Shift+P` → `OpenAPI: Show Preview`.

### Updating the spec when adding a new API

1. Add schemas (DTOs / responses) to the `schemas` object in `scripts/generate-openapi.ts`
2. Add the new endpoint to the `paths` object in the same file
3. Run `pnpm generate:openapi` to regenerate `openapi.yaml`

---

## Database migrations

```bash
# Run pending migrations
pnpm migration:run

# Revert last migration
pnpm migration:revert

# Generate a new migration from entity changes
pnpm migration:generate -- src/infra/database/migrations/MigrationName

# Create an empty migration file
pnpm migration:create
```

---

## Tests

```bash
# Unit tests
pnpm test

# Unit tests (watch)
pnpm test:watch

# Coverage
pnpm test:cov

# e2e tests
pnpm test:e2e
```

---

## Project structure

```
src/
├── infra/
│   ├── database/        # TypeORM data-source, entities, migrations, repositories
│   ├── ffmpeg/          # FFmpeg service
│   ├── queue/           # BullMQ queue setup
│   └── storage/         # Cloudinary storage adapter
├── modules/
│   └── videos/          # Video upload & HLS processing (controller, service, repository, DTOs)
├── shared/
│   ├── filters/         # Global exception filter
│   ├── interceptors/    # Response interceptor
│   ├── types/           # Shared TypeScript types
│   └── utils/           # API response helpers
└── workers/
    └── video.worker.ts  # BullMQ worker for video processing

scripts/
└── generate-openapi.ts  # Generates openapi.yaml (does NOT touch source code)

agents/                  # AI agent context files (architecture, coding rules, etc.)
```
