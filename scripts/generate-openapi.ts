/**
 * generate-openapi.ts
 *
 * Generates openapi.yaml at the project root.
 * Run via: pnpm generate:openapi
 *
 * This script is entirely self-contained — it does NOT touch any controller,
 * service, entity, or existing source file.
 */

import { writeFileSync } from 'fs';
import { join } from 'path';
import * as yaml from 'js-yaml';
import type { OpenAPIObject } from '@nestjs/swagger';

// ─── Reusable schema fragments ────────────────────────────────────────────────

const Meta = {
  type: 'object',
  required: ['total', 'page', 'limit'],
  properties: {
    total: { type: 'integer', example: 42 },
    page: { type: 'integer', example: 1 },
    limit: { type: 'integer', example: 20 },
  },
} as const;

const ErrorResponse = {
  type: 'object',
  required: ['statusCode', 'error', 'message'],
  properties: {
    statusCode: { type: 'integer', example: 400 },
    error: { type: 'string', example: 'Bad Request' },
    message: {
      oneOf: [
        { type: 'string', example: 'Validation failed' },
        { type: 'array', items: { type: 'string' } },
      ],
    },
  },
} as const;

const UuidParam = (name: string) => ({
  name,
  in: 'path',
  required: true,
  schema: { type: 'string', format: 'uuid' },
  example: '3fa85f64-5717-4562-b3fc-2c963f66afa6',
});

const PaginationParams = [
  {
    name: 'page',
    in: 'query',
    required: false,
    schema: { type: 'integer', minimum: 1, default: 1 },
  },
  {
    name: 'limit',
    in: 'query',
    required: false,
    schema: { type: 'integer', minimum: 1, maximum: 100, default: 20 },
  },
];

// ─── Schemas ──────────────────────────────────────────────────────────────────

const schemas: Record<string, object> = {
  // ── Meta / errors ────────────────────────────────────────────────────────────
  Meta,
  ErrorResponse,

  // ── User ─────────────────────────────────────────────────────────────────────
  User: {
    type: 'object',
    required: ['id', 'name', 'email', 'createdAt', 'updatedAt'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      name: { type: 'string', maxLength: 255, example: 'Alice' },
      email: { type: 'string', format: 'email', example: 'alice@example.com' },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  CreateUserRequest: {
    type: 'object',
    required: ['name', 'email'],
    properties: {
      name: { type: 'string', maxLength: 255, example: 'Alice' },
      email: { type: 'string', format: 'email', example: 'alice@example.com' },
    },
  },

  UpdateUserRequest: {
    type: 'object',
    properties: {
      name: { type: 'string', maxLength: 255, example: 'Alice' },
      email: { type: 'string', format: 'email', example: 'alice@example.com' },
    },
  },

  UserResponse: {
    type: 'object',
    required: ['data'],
    properties: {
      data: { $ref: '#/components/schemas/User' },
    },
  },

  UserListResponse: {
    type: 'object',
    required: ['data', 'meta'],
    properties: {
      data: { type: 'array', items: { $ref: '#/components/schemas/User' } },
      meta: { $ref: '#/components/schemas/Meta' },
    },
  },

  // ── Video ─────────────────────────────────────────────────────────────────────
  VideoStatus: {
    type: 'string',
    enum: ['uploaded', 'queued', 'processing', 'ready', 'failed', 'deleted'],
  },

  VideoVariant: {
    type: 'object',
    required: ['id', 'qualityLabel', 'width', 'height', 'bitrateKbps'],
    properties: {
      id: { type: 'string', format: 'uuid' },
      qualityLabel: { type: 'string', example: '1080p' },
      width: { type: 'integer', example: 1920 },
      height: { type: 'integer', example: 1080 },
      bitrateKbps: { type: 'integer', example: 5000 },
      playlistUrl: { type: 'string', format: 'uri', nullable: true },
    },
  },

  Video: {
    type: 'object',
    required: [
      'id',
      'title',
      'status',
      'progress',
      'variants',
      'createdAt',
      'updatedAt',
    ],
    properties: {
      id: { type: 'string', format: 'uuid' },
      title: { type: 'string', maxLength: 255, example: 'My Video' },
      description: { type: 'string', nullable: true },
      status: { $ref: '#/components/schemas/VideoStatus' },
      progress: { type: 'integer', minimum: 0, maximum: 100, example: 75 },
      playbackUrl: { type: 'string', format: 'uri', nullable: true },
      thumbnailUrl: { type: 'string', format: 'uri', nullable: true },
      durationSec: { type: 'number', nullable: true, example: 120.5 },
      width: { type: 'integer', nullable: true, example: 1920 },
      height: { type: 'integer', nullable: true, example: 1080 },
      errorMessage: { type: 'string', nullable: true },
      variants: {
        type: 'array',
        items: { $ref: '#/components/schemas/VideoVariant' },
      },
      createdAt: { type: 'string', format: 'date-time' },
      updatedAt: { type: 'string', format: 'date-time' },
    },
  },

  VideoUploadResponse: {
    type: 'object',
    required: ['data'],
    properties: {
      data: {
        type: 'object',
        required: ['id', 'status'],
        properties: {
          id: { type: 'string', format: 'uuid' },
          status: { $ref: '#/components/schemas/VideoStatus' },
        },
      },
    },
  },

  VideoResponse: {
    type: 'object',
    required: ['data'],
    properties: {
      data: { $ref: '#/components/schemas/Video' },
    },
  },

  VideoListResponse: {
    type: 'object',
    required: ['data', 'meta'],
    properties: {
      data: { type: 'array', items: { $ref: '#/components/schemas/Video' } },
      meta: { $ref: '#/components/schemas/Meta' },
    },
  },
};

// ─── Paths ────────────────────────────────────────────────────────────────────

const errorResponses = {
  '400': {
    description: 'Bad Request / Validation error',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResponse' },
      },
    },
  },
  '404': {
    description: 'Not Found',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResponse' },
      },
    },
  },
  '500': {
    description: 'Internal Server Error',
    content: {
      'application/json': {
        schema: { $ref: '#/components/schemas/ErrorResponse' },
      },
    },
  },
};

const paths: Record<string, object> = {
  // ─── Users ─────────────────────────────────────────────────────────────────
  '/api/users': {
    get: {
      tags: ['Users'],
      summary: 'List users',
      operationId: 'listUsers',
      parameters: PaginationParams,
      responses: {
        '200': {
          description: 'Paginated list of users',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UserListResponse' },
            },
          },
        },
        ...errorResponses,
      },
    },
    post: {
      tags: ['Users'],
      summary: 'Create a user',
      operationId: 'createUser',
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/CreateUserRequest' },
          },
        },
      },
      responses: {
        '201': {
          description: 'User created',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UserResponse' },
            },
          },
        },
        '400': errorResponses['400'],
        '500': errorResponses['500'],
      },
    },
  },

  '/api/users/{id}': {
    get: {
      tags: ['Users'],
      summary: 'Get a user by ID',
      operationId: 'getUser',
      parameters: [UuidParam('id')],
      responses: {
        '200': {
          description: 'User found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UserResponse' },
            },
          },
        },
        ...errorResponses,
      },
    },
    patch: {
      tags: ['Users'],
      summary: 'Update a user',
      operationId: 'updateUser',
      parameters: [UuidParam('id')],
      requestBody: {
        required: true,
        content: {
          'application/json': {
            schema: { $ref: '#/components/schemas/UpdateUserRequest' },
          },
        },
      },
      responses: {
        '200': {
          description: 'User updated',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/UserResponse' },
            },
          },
        },
        ...errorResponses,
      },
    },
    delete: {
      tags: ['Users'],
      summary: 'Delete a user',
      operationId: 'deleteUser',
      parameters: [UuidParam('id')],
      responses: {
        '204': { description: 'User deleted' },
        ...errorResponses,
      },
    },
  },

  // ─── Videos ────────────────────────────────────────────────────────────────
  '/api/videos/upload': {
    post: {
      tags: ['Videos'],
      summary: 'Upload a video',
      operationId: 'uploadVideo',
      requestBody: {
        required: true,
        content: {
          'multipart/form-data': {
            schema: {
              type: 'object',
              required: ['file', 'title'],
              properties: {
                file: {
                  type: 'string',
                  format: 'binary',
                  description:
                    'Video file (mp4, mov, avi, webm, mkv — max 500 MB)',
                },
                title: { type: 'string', maxLength: 255, example: 'My Video' },
                description: {
                  type: 'string',
                  example: 'Optional description',
                },
              },
            },
          },
        },
      },
      responses: {
        '201': {
          description: 'Upload accepted — processing queued',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/VideoUploadResponse' },
            },
          },
        },
        '400': errorResponses['400'],
        '500': errorResponses['500'],
      },
    },
  },

  '/api/videos': {
    get: {
      tags: ['Videos'],
      summary: 'List videos',
      operationId: 'listVideos',
      parameters: [
        ...PaginationParams,
        {
          name: 'status',
          in: 'query',
          required: false,
          schema: { $ref: '#/components/schemas/VideoStatus' },
        },
      ],
      responses: {
        '200': {
          description: 'Paginated list of videos',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/VideoListResponse' },
            },
          },
        },
        ...errorResponses,
      },
    },
  },

  '/api/videos/{id}': {
    get: {
      tags: ['Videos'],
      summary: 'Get a video by ID',
      operationId: 'getVideo',
      parameters: [UuidParam('id')],
      responses: {
        '200': {
          description: 'Video found',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/VideoResponse' },
            },
          },
        },
        ...errorResponses,
      },
    },
    delete: {
      tags: ['Videos'],
      summary: 'Delete a video',
      operationId: 'deleteVideo',
      parameters: [UuidParam('id')],
      responses: {
        '204': { description: 'Video deleted' },
        ...errorResponses,
      },
    },
  },

  '/api/videos/{id}/retry': {
    post: {
      tags: ['Videos'],
      summary: 'Retry failed video processing',
      operationId: 'retryVideo',
      parameters: [UuidParam('id')],
      responses: {
        '202': {
          description: 'Retry accepted',
          content: {
            'application/json': {
              schema: { $ref: '#/components/schemas/VideoUploadResponse' },
            },
          },
        },
        ...errorResponses,
      },
    },
  },
};

// ─── Assemble & write ─────────────────────────────────────────────────────────

const document: Omit<OpenAPIObject, 'paths'> & {
  paths: Record<string, object>;
} = {
  openapi: '3.0.3',
  info: {
    title: 'MVP HLS API',
    description: 'REST API for HLS video streaming platform',
    version: '1.0.0',
  },
  servers: [{ url: 'http://localhost:3000', description: 'Local development' }],
  tags: [
    { name: 'Users', description: 'User management' },
    { name: 'Videos', description: 'Video upload and HLS streaming' },
  ],
  paths,
  components: { schemas },
};

const outputPath = join(process.cwd(), 'openapi.yaml');
writeFileSync(
  outputPath,
  yaml.dump(document, { lineWidth: 120, noRefs: true }),
  'utf-8',
);
console.log(`✅  openapi.yaml generated → ${outputPath}`);
