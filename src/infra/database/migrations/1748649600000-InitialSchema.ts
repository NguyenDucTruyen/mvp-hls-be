import { MigrationInterface, QueryRunner } from 'typeorm';

export class InitialSchema1748649600000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // ── Enum types ─────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TYPE video_status_enum AS ENUM (
        'uploaded', 'queued', 'processing', 'ready', 'failed', 'deleted'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE job_type_enum AS ENUM (
        'transcode-hls', 'generate-thumbnail', 'cleanup-temp'
      )
    `);

    await queryRunner.query(`
      CREATE TYPE job_status_enum AS ENUM (
        'pending', 'active', 'completed', 'failed'
      )
    `);

    // ── Trigger function: set_updated_at ───────────────────────────────────
    await queryRunner.query(`
      CREATE OR REPLACE FUNCTION set_updated_at()
      RETURNS TRIGGER AS $$
      BEGIN
        NEW.updated_at = NOW();
        RETURN NEW;
      END;
      $$ LANGUAGE plpgsql
    `);

    // ── videos ─────────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE videos (
        id                UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        title             VARCHAR(255) NOT NULL,
        description       TEXT,
        original_filename TEXT        NOT NULL,
        mime_type         VARCHAR(100) NOT NULL,
        size_bytes        BIGINT      NOT NULL,
        raw_key           TEXT,
        raw_url           TEXT,
        hls_key           TEXT,
        playback_url      TEXT,
        thumbnail_key     TEXT,
        thumbnail_url     TEXT,
        duration_sec      FLOAT,
        width             INT,
        height            INT,
        status            video_status_enum NOT NULL DEFAULT 'uploaded',
        progress          SMALLINT    NOT NULL DEFAULT 0,
        error_message     TEXT,
        processed_at      TIMESTAMPTZ,
        deleted_at        TIMESTAMPTZ,
        created_at        TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        updated_at        TIMESTAMPTZ NOT NULL DEFAULT NOW()
      )
    `);

    // ── video_variants ─────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE video_variants (
        id            UUID        PRIMARY KEY DEFAULT gen_random_uuid(),
        video_id      UUID        NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        quality_label VARCHAR(10) NOT NULL,
        width         INT         NOT NULL,
        height        INT         NOT NULL,
        bitrate_kbps  INT         NOT NULL,
        playlist_key  TEXT,
        playlist_url  TEXT,
        created_at    TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_variants_video_quality UNIQUE (video_id, quality_label)
      )
    `);

    // ── jobs_log ───────────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE jobs_log (
        id           UUID           PRIMARY KEY DEFAULT gen_random_uuid(),
        video_id     UUID           NOT NULL REFERENCES videos(id) ON DELETE CASCADE,
        queue_job_id TEXT,
        type         job_type_enum  NOT NULL,
        status       job_status_enum NOT NULL DEFAULT 'pending',
        attempt      SMALLINT       NOT NULL DEFAULT 1,
        message      TEXT,
        error_stack  TEXT,
        started_at   TIMESTAMPTZ,
        finished_at  TIMESTAMPTZ,
        created_at   TIMESTAMPTZ    NOT NULL DEFAULT NOW()
      )
    `);

    // ── upload_chunks ──────────────────────────────────────────────────────
    await queryRunner.query(`
      CREATE TABLE upload_chunks (
        id          UUID    PRIMARY KEY DEFAULT gen_random_uuid(),
        upload_id   TEXT    NOT NULL,
        chunk_index INT     NOT NULL,
        size_bytes  BIGINT  NOT NULL,
        etag        TEXT,
        created_at  TIMESTAMPTZ NOT NULL DEFAULT NOW(),
        CONSTRAINT uq_chunks_upload_index UNIQUE (upload_id, chunk_index)
      )
    `);

    // ── Indexes ────────────────────────────────────────────────────────────
    await queryRunner.query(
      `CREATE INDEX idx_videos_status     ON videos(status)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_videos_created_at ON videos(created_at DESC)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_jobs_video_id     ON jobs_log(video_id)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_jobs_status       ON jobs_log(status)`,
    );
    await queryRunner.query(
      `CREATE INDEX idx_variants_video_id ON video_variants(video_id)`,
    );

    // ── Trigger: auto-update updated_at on videos ──────────────────────────
    await queryRunner.query(`
      CREATE TRIGGER trg_videos_updated_at
        BEFORE UPDATE ON videos
        FOR EACH ROW EXECUTE FUNCTION set_updated_at()
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `DROP TRIGGER IF EXISTS trg_videos_updated_at ON videos`,
    );

    await queryRunner.query(`DROP INDEX IF EXISTS idx_variants_video_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_jobs_status`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_jobs_video_id`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_videos_created_at`);
    await queryRunner.query(`DROP INDEX IF EXISTS idx_videos_status`);

    await queryRunner.query(`DROP TABLE IF EXISTS upload_chunks`);
    await queryRunner.query(`DROP TABLE IF EXISTS jobs_log`);
    await queryRunner.query(`DROP TABLE IF EXISTS video_variants`);
    await queryRunner.query(`DROP TABLE IF EXISTS videos`);

    await queryRunner.query(`DROP FUNCTION IF EXISTS set_updated_at`);
    await queryRunner.query(`DROP TYPE IF EXISTS job_status_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS job_type_enum`);
    await queryRunner.query(`DROP TYPE IF EXISTS video_status_enum`);
  }
}
