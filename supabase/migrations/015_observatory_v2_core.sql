-- Bangkok Urban Earth Observatory v2
-- Long-form, versioned evidence model. This migration does not copy legacy
-- district_statistics values and does not publish provisional data.

CREATE EXTENSION IF NOT EXISTS postgis;
CREATE EXTENSION IF NOT EXISTS pgcrypto;

CREATE TABLE IF NOT EXISTS observatory_datasets (
  dataset_id text PRIMARY KEY
    CHECK (dataset_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name text NOT NULL,
  owner_name text NOT NULL,
  source_url text NOT NULL CHECK (source_url ~ '^https://'),
  source_class text NOT NULL,
  measurement_type text NOT NULL
    CHECK (measurement_type IN ('observed', 'administrative', 'model-derived', 'proxy')),
  spatial_resolution text NOT NULL,
  temporal_cadence text NOT NULL,
  license_status text NOT NULL
    CHECK (license_status IN ('verified', 'unverified', 'restricted')),
  license_name text NOT NULL,
  license_url text NOT NULL CHECK (license_url ~ '^https://'),
  redistribution_status text NOT NULL
    CHECK (redistribution_status IN ('allowed', 'pending', 'restricted')),
  acceptance_status text NOT NULL DEFAULT 'provisional'
    CHECK (acceptance_status IN ('provisional', 'acceptance', 'research', 'validated', 'retired')),
  acceptance_checked_at timestamptz,
  acceptance_blockers jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(acceptance_blockers) = 'array'),
  metadata jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(metadata) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    acceptance_status <> 'validated'
    OR (
      license_status = 'verified'
      AND redistribution_status = 'allowed'
      AND acceptance_checked_at IS NOT NULL
      AND acceptance_blockers = '[]'::jsonb
    )
  )
);

CREATE TABLE IF NOT EXISTS observatory_dataset_versions (
  dataset_version_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_id text NOT NULL
    REFERENCES observatory_datasets(dataset_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  version_label text NOT NULL,
  checksum_sha256 text NOT NULL
    CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  retrieved_at timestamptz NOT NULL,
  observation_start timestamptz,
  observation_end timestamptz,
  schema_version text NOT NULL,
  source_snapshot_uri text NOT NULL,
  acceptance_status text NOT NULL DEFAULT 'provisional'
    CHECK (acceptance_status IN ('provisional', 'acceptance', 'research', 'validated', 'retired')),
  acceptance_checked_at timestamptz,
  notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (dataset_id, version_label, checksum_sha256),
  CHECK (observation_end IS NULL OR observation_start IS NULL OR observation_end >= observation_start),
  CHECK (acceptance_status <> 'validated' OR acceptance_checked_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS observatory_products (
  product_id text PRIMARY KEY
    CHECK (product_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  display_name_th text NOT NULL,
  display_name_en text NOT NULL,
  phase text NOT NULL CHECK (phase IN ('mvp', 'phase-2')),
  measurement_type text NOT NULL,
  unit text NOT NULL,
  method_version text NOT NULL
    CHECK (method_version ~ '^[a-z0-9-]+-v[0-9]+\.[0-9]+\.[0-9]+$'),
  recipe jsonb NOT NULL CHECK (jsonb_typeof(recipe) = 'object'),
  statistics jsonb NOT NULL CHECK (jsonb_typeof(statistics) = 'array'),
  limitations jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(limitations) = 'array'),
  min_valid_coverage double precision NOT NULL
    CHECK (min_valid_coverage BETWEEN 0 AND 1),
  min_scene_count integer NOT NULL DEFAULT 0
    CHECK (min_scene_count >= 0),
  requires_validated_datasets boolean NOT NULL DEFAULT true,
  acceptance_status text NOT NULL DEFAULT 'provisional'
    CHECK (acceptance_status IN ('provisional', 'acceptance', 'research', 'validated', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

CREATE TABLE IF NOT EXISTS observatory_product_datasets (
  product_id text NOT NULL
    REFERENCES observatory_products(product_id) ON UPDATE CASCADE ON DELETE CASCADE,
  dataset_id text NOT NULL
    REFERENCES observatory_datasets(dataset_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  input_role text NOT NULL DEFAULT 'primary',
  required boolean NOT NULL DEFAULT true,
  PRIMARY KEY (product_id, dataset_id)
);

CREATE TABLE IF NOT EXISTS observatory_areas (
  area_code text PRIMARY KEY
    CHECK (area_code ~ '^BKK-(CITY|D[0-9]{2}|S[0-9]{4})$'),
  level text NOT NULL CHECK (level IN ('city', 'district', 'subdistrict')),
  parent_area_code text
    REFERENCES observatory_areas(area_code) ON UPDATE CASCADE ON DELETE RESTRICT,
  name_th text NOT NULL,
  name_en text NOT NULL,
  boundary_dataset_version_id uuid NOT NULL
    REFERENCES observatory_dataset_versions(dataset_version_id) ON DELETE RESTRICT,
  boundary_version text NOT NULL,
  geom geometry(MultiPolygon, 4326) NOT NULL,
  area_square_meters double precision
    CHECK (area_square_meters IS NULL OR area_square_meters > 0),
  valid_from date,
  valid_to date,
  acceptance_status text NOT NULL DEFAULT 'provisional'
    CHECK (acceptance_status IN ('provisional', 'acceptance', 'research', 'validated', 'retired')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (valid_to IS NULL OR valid_from IS NULL OR valid_to >= valid_from),
  CHECK (
    (level = 'city' AND parent_area_code IS NULL)
    OR (level IN ('district', 'subdistrict') AND parent_area_code IS NOT NULL)
  )
);

CREATE TABLE IF NOT EXISTS observatory_processing_runs (
  processing_run_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id text NOT NULL
    REFERENCES observatory_products(product_id) ON UPDATE CASCADE ON DELETE RESTRICT,
  method_version text NOT NULL
    CHECK (method_version ~ '^[a-z0-9-]+-v[0-9]+\.[0-9]+\.[0-9]+$'),
  code_commit_sha text NOT NULL
    CHECK (code_commit_sha ~ '^[a-f0-9]{7,64}$'),
  parameters jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(parameters) = 'object'),
  qa_summary jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(qa_summary) = 'object'),
  status text NOT NULL DEFAULT 'queued'
    CHECK (status IN ('queued', 'running', 'succeeded', 'failed', 'rejected')),
  started_at timestamptz,
  finished_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (processing_run_id, product_id),
  CHECK (finished_at IS NULL OR started_at IS NULL OR finished_at >= started_at),
  CHECK (status NOT IN ('succeeded', 'failed', 'rejected') OR finished_at IS NOT NULL)
);

CREATE TABLE IF NOT EXISTS observatory_processing_run_inputs (
  processing_run_id uuid NOT NULL
    REFERENCES observatory_processing_runs(processing_run_id) ON DELETE CASCADE,
  dataset_version_id uuid NOT NULL
    REFERENCES observatory_dataset_versions(dataset_version_id) ON DELETE RESTRICT,
  input_role text NOT NULL DEFAULT 'primary',
  PRIMARY KEY (processing_run_id, dataset_version_id)
);

CREATE TABLE IF NOT EXISTS observatory_observations (
  observation_id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  area_code text NOT NULL
    REFERENCES observatory_areas(area_code) ON UPDATE CASCADE ON DELETE RESTRICT,
  product_id text NOT NULL,
  period_start timestamptz NOT NULL,
  period_end timestamptz NOT NULL,
  statistic text NOT NULL,
  value double precision NOT NULL
    CHECK (value NOT IN ('NaN'::double precision, 'Infinity'::double precision, '-Infinity'::double precision)),
  unit text NOT NULL,
  valid_coverage double precision
    CHECK (valid_coverage IS NULL OR valid_coverage BETWEEN 0 AND 1),
  scene_count integer CHECK (scene_count IS NULL OR scene_count >= 0),
  uncertainty_lower double precision,
  uncertainty_upper double precision,
  processing_run_id uuid NOT NULL,
  quality_status text NOT NULL DEFAULT 'draft'
    CHECK (quality_status IN ('draft', 'accepted', 'rejected')),
  published_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (processing_run_id, product_id)
    REFERENCES observatory_processing_runs(processing_run_id, product_id)
    ON DELETE RESTRICT,
  UNIQUE (
    area_code,
    product_id,
    period_start,
    period_end,
    statistic,
    processing_run_id
  ),
  CHECK (period_end >= period_start),
  CHECK (
    uncertainty_lower IS NULL
    OR uncertainty_upper IS NULL
    OR uncertainty_lower <= uncertainty_upper
  ),
  CHECK (
    uncertainty_lower IS NULL
    OR uncertainty_upper IS NULL
    OR value BETWEEN uncertainty_lower AND uncertainty_upper
  ),
  CHECK (
    quality_status <> 'accepted'
    OR (
      valid_coverage IS NOT NULL
      AND scene_count IS NOT NULL
      AND published_at IS NOT NULL
    )
  )
);

CREATE TABLE IF NOT EXISTS observatory_raster_assets (
  asset_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  processing_run_id uuid NOT NULL,
  product_id text NOT NULL,
  asset_kind text NOT NULL
    CHECK (asset_kind IN ('cog', 'pmtiles', 'thumbnail', 'stac-item', 'other')),
  uri text NOT NULL,
  media_type text NOT NULL,
  crs text NOT NULL,
  pixel_size_meters double precision
    CHECK (pixel_size_meters IS NULL OR pixel_size_meters > 0),
  nodata_value double precision,
  footprint geometry(MultiPolygon, 4326),
  checksum_sha256 text NOT NULL
    CHECK (checksum_sha256 ~ '^[a-f0-9]{64}$'),
  quality_status text NOT NULL DEFAULT 'draft'
    CHECK (quality_status IN ('draft', 'accepted', 'rejected')),
  created_at timestamptz NOT NULL DEFAULT now(),
  FOREIGN KEY (processing_run_id, product_id)
    REFERENCES observatory_processing_runs(processing_run_id, product_id)
    ON DELETE RESTRICT,
  UNIQUE (processing_run_id, uri)
);

CREATE TABLE IF NOT EXISTS observatory_quality_flags (
  quality_flag_id bigint GENERATED BY DEFAULT AS IDENTITY PRIMARY KEY,
  target_type text NOT NULL
    CHECK (target_type IN ('dataset', 'dataset-version', 'product', 'area', 'processing-run', 'observation', 'asset')),
  target_id text NOT NULL,
  flag_code text NOT NULL,
  severity text NOT NULL CHECK (severity IN ('info', 'warning', 'blocking')),
  message text NOT NULL,
  details jsonb NOT NULL DEFAULT '{}'::jsonb
    CHECK (jsonb_typeof(details) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  resolved_at timestamptz,
  resolved_by text
);

CREATE INDEX IF NOT EXISTS idx_observatory_dataset_versions_dataset
  ON observatory_dataset_versions (dataset_id, retrieved_at DESC);
CREATE INDEX IF NOT EXISTS idx_observatory_areas_parent
  ON observatory_areas (parent_area_code);
CREATE INDEX IF NOT EXISTS idx_observatory_areas_geom
  ON observatory_areas USING gist (geom);
CREATE INDEX IF NOT EXISTS idx_observatory_runs_product_status
  ON observatory_processing_runs (product_id, status, finished_at DESC);
CREATE INDEX IF NOT EXISTS idx_observatory_run_inputs_version
  ON observatory_processing_run_inputs (dataset_version_id);
CREATE INDEX IF NOT EXISTS idx_observatory_observations_query
  ON observatory_observations (product_id, period_start, period_end, area_code);
CREATE INDEX IF NOT EXISTS idx_observatory_observations_public
  ON observatory_observations (product_id, period_end DESC)
  WHERE quality_status = 'accepted';
CREATE INDEX IF NOT EXISTS idx_observatory_assets_run
  ON observatory_raster_assets (processing_run_id, product_id);
CREATE INDEX IF NOT EXISTS idx_observatory_assets_footprint
  ON observatory_raster_assets USING gist (footprint);
CREATE INDEX IF NOT EXISTS idx_observatory_flags_target
  ON observatory_quality_flags (target_type, target_id, resolved_at);

ALTER TABLE observatory_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE observatory_dataset_versions ENABLE ROW LEVEL SECURITY;
ALTER TABLE observatory_products ENABLE ROW LEVEL SECURITY;
ALTER TABLE observatory_product_datasets ENABLE ROW LEVEL SECURITY;
ALTER TABLE observatory_areas ENABLE ROW LEVEL SECURITY;
ALTER TABLE observatory_processing_runs ENABLE ROW LEVEL SECURITY;
ALTER TABLE observatory_processing_run_inputs ENABLE ROW LEVEL SECURITY;
ALTER TABLE observatory_observations ENABLE ROW LEVEL SECURITY;
ALTER TABLE observatory_raster_assets ENABLE ROW LEVEL SECURITY;
ALTER TABLE observatory_quality_flags ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "public read validated observatory datasets" ON observatory_datasets;
CREATE POLICY "public read validated observatory datasets"
  ON observatory_datasets FOR SELECT TO anon, authenticated
  USING (acceptance_status = 'validated');

DROP POLICY IF EXISTS "public read validated observatory dataset versions" ON observatory_dataset_versions;
CREATE POLICY "public read validated observatory dataset versions"
  ON observatory_dataset_versions FOR SELECT TO anon, authenticated
  USING (
    acceptance_status = 'validated'
    AND EXISTS (
      SELECT 1
      FROM observatory_datasets dataset
      WHERE dataset.dataset_id = observatory_dataset_versions.dataset_id
        AND dataset.acceptance_status = 'validated'
    )
  );

DROP POLICY IF EXISTS "public read validated observatory products" ON observatory_products;
CREATE POLICY "public read validated observatory products"
  ON observatory_products FOR SELECT TO anon, authenticated
  USING (acceptance_status = 'validated');

DROP POLICY IF EXISTS "public read validated observatory product sources" ON observatory_product_datasets;
CREATE POLICY "public read validated observatory product sources"
  ON observatory_product_datasets FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM observatory_products product
      WHERE product.product_id = observatory_product_datasets.product_id
        AND product.acceptance_status = 'validated'
    )
    AND EXISTS (
      SELECT 1
      FROM observatory_datasets dataset
      WHERE dataset.dataset_id = observatory_product_datasets.dataset_id
        AND dataset.acceptance_status = 'validated'
    )
  );

DROP POLICY IF EXISTS "public read validated observatory areas" ON observatory_areas;
CREATE POLICY "public read validated observatory areas"
  ON observatory_areas FOR SELECT TO anon, authenticated
  USING (
    acceptance_status = 'validated'
    AND EXISTS (
      SELECT 1
      FROM observatory_dataset_versions version
      WHERE version.dataset_version_id = observatory_areas.boundary_dataset_version_id
        AND version.acceptance_status = 'validated'
    )
  );

DROP POLICY IF EXISTS "public read successful observatory runs" ON observatory_processing_runs;
CREATE POLICY "public read successful observatory runs"
  ON observatory_processing_runs FOR SELECT TO anon, authenticated
  USING (
    status = 'succeeded'
    AND EXISTS (
      SELECT 1
      FROM observatory_products product
      WHERE product.product_id = observatory_processing_runs.product_id
        AND product.acceptance_status = 'validated'
    )
  );

DROP POLICY IF EXISTS "public read validated observatory run inputs" ON observatory_processing_run_inputs;
CREATE POLICY "public read validated observatory run inputs"
  ON observatory_processing_run_inputs FOR SELECT TO anon, authenticated
  USING (
    EXISTS (
      SELECT 1
      FROM observatory_processing_runs run
      WHERE run.processing_run_id = observatory_processing_run_inputs.processing_run_id
        AND run.status = 'succeeded'
    )
    AND EXISTS (
      SELECT 1
      FROM observatory_dataset_versions version
      WHERE version.dataset_version_id = observatory_processing_run_inputs.dataset_version_id
        AND version.acceptance_status = 'validated'
    )
  );

DROP POLICY IF EXISTS "public read accepted observatory observations" ON observatory_observations;
CREATE POLICY "public read accepted observatory observations"
  ON observatory_observations FOR SELECT TO anon, authenticated
  USING (
    quality_status = 'accepted'
    AND EXISTS (
      SELECT 1
      FROM observatory_products product
      WHERE product.product_id = observatory_observations.product_id
        AND product.acceptance_status = 'validated'
        AND observatory_observations.valid_coverage >= product.min_valid_coverage
        AND observatory_observations.scene_count >= product.min_scene_count
    )
    AND EXISTS (
      SELECT 1
      FROM observatory_processing_runs run
      WHERE run.processing_run_id = observatory_observations.processing_run_id
        AND run.product_id = observatory_observations.product_id
        AND run.status = 'succeeded'
    )
    AND NOT EXISTS (
      SELECT 1
      FROM observatory_product_datasets source
      JOIN observatory_datasets dataset ON dataset.dataset_id = source.dataset_id
      WHERE source.product_id = observatory_observations.product_id
        AND source.required
        AND dataset.acceptance_status <> 'validated'
    )
  );

DROP POLICY IF EXISTS "public read accepted observatory assets" ON observatory_raster_assets;
CREATE POLICY "public read accepted observatory assets"
  ON observatory_raster_assets FOR SELECT TO anon, authenticated
  USING (
    quality_status = 'accepted'
    AND EXISTS (
      SELECT 1
      FROM observatory_products product
      WHERE product.product_id = observatory_raster_assets.product_id
        AND product.acceptance_status = 'validated'
    )
    AND EXISTS (
      SELECT 1
      FROM observatory_processing_runs run
      WHERE run.processing_run_id = observatory_raster_assets.processing_run_id
        AND run.product_id = observatory_raster_assets.product_id
        AND run.status = 'succeeded'
    )
  );

DROP POLICY IF EXISTS "public read unresolved observatory quality flags" ON observatory_quality_flags;
CREATE POLICY "public read unresolved observatory quality flags"
  ON observatory_quality_flags FOR SELECT TO anon, authenticated
  USING (resolved_at IS NULL);

GRANT SELECT ON
  observatory_datasets,
  observatory_dataset_versions,
  observatory_products,
  observatory_product_datasets,
  observatory_areas,
  observatory_processing_runs,
  observatory_processing_run_inputs,
  observatory_observations,
  observatory_raster_assets,
  observatory_quality_flags
TO anon, authenticated;

COMMENT ON TABLE observatory_observations IS
  'Long-form published observations. Public reads require validated product, data sources, run, coverage and QA status.';
COMMENT ON TABLE observatory_raster_assets IS
  'Immutable derived raster references such as COG, PMTiles or STAC items, addressed by checksum.';
COMMENT ON COLUMN observatory_areas.boundary_dataset_version_id IS
  'Exact accepted source snapshot used to construct this boundary version.';
