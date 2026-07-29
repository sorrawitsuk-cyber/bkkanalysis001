-- Durable, internal checkpoints for tiled Observatory processing.
-- This migration adds no public data and grants no read access to tile jobs.

CREATE TABLE IF NOT EXISTS observatory_processing_tiles (
  processing_tile_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processing_run_id uuid NOT NULL
    REFERENCES observatory_processing_runs(processing_run_id) ON DELETE CASCADE,
  tile_id text NOT NULL
    CHECK (tile_id ~ '^r[0-9]{2}-c[0-9]{2}$'),
  season_id text NOT NULL
    CHECK (season_id IN ('hot', 'wet', 'cool')),
  bounds jsonb NOT NULL
    CHECK (
      jsonb_typeof(bounds) = 'array'
      AND jsonb_array_length(bounds) = 4
    ),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed')),
  attempt_count integer NOT NULL DEFAULT 0 CHECK (attempt_count >= 0),
  max_attempts integer NOT NULL DEFAULT 3 CHECK (max_attempts BETWEEN 1 AND 10),
  worker_id text,
  metrics jsonb
    CHECK (metrics IS NULL OR jsonb_typeof(metrics) = 'object'),
  result_checksum_sha256 text
    CHECK (
      result_checksum_sha256 IS NULL
      OR result_checksum_sha256 ~ '^[a-f0-9]{64}$'
    ),
  last_error text,
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (processing_run_id, tile_id, season_id),
  CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at),
  CHECK (attempt_count <= max_attempts),
  CHECK (status <> 'running' OR (worker_id IS NOT NULL AND started_at IS NOT NULL)),
  CHECK (
    status <> 'succeeded'
    OR (
      metrics IS NOT NULL
      AND result_checksum_sha256 IS NOT NULL
      AND finished_at IS NOT NULL
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_observatory_processing_tiles_claim
  ON observatory_processing_tiles (
    processing_run_id,
    status,
    attempt_count,
    season_id,
    tile_id
  );

ALTER TABLE observatory_processing_tiles ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON observatory_processing_tiles FROM anon, authenticated;

CREATE OR REPLACE FUNCTION observatory_claim_processing_tile(
  p_processing_run_id uuid,
  p_worker_id text
)
RETURNS SETOF observatory_processing_tiles
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF p_worker_id IS NULL OR btrim(p_worker_id) = '' THEN
    RAISE EXCEPTION 'worker id is required';
  END IF;

  RETURN QUERY
  WITH candidate AS (
    SELECT tile.processing_tile_id
    FROM observatory_processing_tiles tile
    WHERE tile.processing_run_id = p_processing_run_id
      AND tile.status = 'queued'
      AND tile.attempt_count < tile.max_attempts
    ORDER BY tile.season_id, tile.tile_id
    FOR UPDATE SKIP LOCKED
    LIMIT 1
  )
  UPDATE observatory_processing_tiles tile
  SET
    status = 'running',
    attempt_count = tile.attempt_count + 1,
    worker_id = p_worker_id,
    started_at = now(),
    finished_at = NULL,
    last_error = NULL,
    updated_at = now()
  FROM candidate
  WHERE tile.processing_tile_id = candidate.processing_tile_id
  RETURNING tile.*;
END;
$$;

REVOKE ALL ON FUNCTION observatory_claim_processing_tile(uuid, text)
  FROM PUBLIC, anon, authenticated;
GRANT EXECUTE ON FUNCTION observatory_claim_processing_tile(uuid, text)
  TO service_role;

COMMENT ON TABLE observatory_processing_tiles IS
  'Internal retryable tile checkpoints. No public grant is provided.';
COMMENT ON FUNCTION observatory_claim_processing_tile(uuid, text) IS
  'Atomically claims one queued tile using SKIP LOCKED; service role only.';
