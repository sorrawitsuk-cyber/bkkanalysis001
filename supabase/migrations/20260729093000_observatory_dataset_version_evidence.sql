-- Internal evidence attached to a specific Observatory dataset version.
-- This table stores aggregate QA provenance only and has no public policy.

CREATE TABLE IF NOT EXISTS observatory_dataset_version_evidence (
  evidence_id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  dataset_version_id uuid NOT NULL
    REFERENCES observatory_dataset_versions(dataset_version_id)
    ON DELETE CASCADE,
  evidence_type text NOT NULL
    CHECK (evidence_type IN ('boundary-technical-qa', 'source-intake')),
  method_version text NOT NULL
    CHECK (method_version ~ '^[a-z0-9-]+-v[0-9]+\.[0-9]+\.[0-9]+$'),
  report_schema_version text NOT NULL,
  report_checksum_sha256 text NOT NULL
    CHECK (report_checksum_sha256 ~ '^[a-f0-9]{64}$'),
  source_response_checksum_sha256 text NOT NULL
    CHECK (source_response_checksum_sha256 ~ '^[a-f0-9]{64}$'),
  evidence_status text NOT NULL
    CHECK (evidence_status IN ('passed', 'failed')),
  evidence_scope text NOT NULL
    CHECK (evidence_scope IN ('internal-processing', 'public-release')),
  summary jsonb NOT NULL
    CHECK (jsonb_typeof(summary) = 'object'),
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE (
    dataset_version_id,
    evidence_type,
    method_version,
    report_checksum_sha256
  )
);

CREATE INDEX IF NOT EXISTS idx_observatory_dataset_version_evidence_version
  ON observatory_dataset_version_evidence (
    dataset_version_id,
    evidence_type,
    created_at DESC
  );

ALTER TABLE observatory_dataset_version_evidence ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON observatory_dataset_version_evidence
  FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON observatory_dataset_version_evidence
  TO service_role;

COMMENT ON TABLE observatory_dataset_version_evidence IS
  'Internal aggregate QA evidence. Source geometry and raw service responses are not stored here.';
