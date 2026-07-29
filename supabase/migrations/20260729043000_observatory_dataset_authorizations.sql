-- Internal, auditable authorization evidence for source reuse decisions.
-- No authorization record is publicly readable. A pending or incomplete record
-- cannot open the promotion gate.

CREATE TABLE IF NOT EXISTS observatory_dataset_authorizations (
  authorization_id text PRIMARY KEY
    CHECK (authorization_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  dataset_id text NOT NULL
    REFERENCES observatory_datasets(dataset_id)
    ON UPDATE CASCADE ON DELETE RESTRICT,
  evidence_schema_version text NOT NULL
    CHECK (evidence_schema_version = 'observatory-boundary-authorization/v1'),
  resource_id text NOT NULL
    CHECK (resource_id ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  source_url text NOT NULL CHECK (source_url ~ '^https://'),
  source_checksum_sha256 text NOT NULL
    CHECK (source_checksum_sha256 ~ '^[a-f0-9]{64}$'),
  decision_status text NOT NULL
    CHECK (
      decision_status IN ('pending', 'approved', 'rejected', 'revoked', 'expired')
    ),
  gate_status text NOT NULL
    CHECK (gate_status IN ('blocked', 'open')),
  authority jsonb NOT NULL
    CHECK (jsonb_typeof(authority) = 'object'),
  request_metadata jsonb NOT NULL
    CHECK (jsonb_typeof(request_metadata) = 'object'),
  evidence jsonb NOT NULL
    CHECK (jsonb_typeof(evidence) = 'object'),
  permissions jsonb NOT NULL
    CHECK (jsonb_typeof(permissions) = 'object'),
  terms jsonb NOT NULL
    CHECK (jsonb_typeof(terms) = 'object'),
  blockers jsonb NOT NULL DEFAULT '[]'::jsonb
    CHECK (jsonb_typeof(blockers) = 'array'),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  CHECK (
    (decision_status = 'approved' AND gate_status = 'open')
    OR (decision_status <> 'approved' AND gate_status = 'blocked')
  ),
  CHECK (
    decision_status <> 'approved'
    OR (
      permissions @> '{
        "useForAnalysis": true,
        "transformGeometry": true,
        "retainSourceSnapshotPrivately": true,
        "redistributeDerivedGeometry": true,
        "publishDerivedTiles": true,
        "publishDistrictStatistics": true
      }'::jsonb
      AND jsonb_typeof(permissions -> 'redistributeSourceGeometry') = 'boolean'
      AND NULLIF(btrim(evidence ->> 'artifactReference'), '') IS NOT NULL
      AND evidence ->> 'artifactChecksumSha256' ~ '^[a-f0-9]{64}$'
      AND (evidence ->> 'issuedAt')::timestamptz IS NOT NULL
      AND (evidence ->> 'receivedAt')::timestamptz IS NOT NULL
      AND (evidence ->> 'verifiedAt')::timestamptz IS NOT NULL
      AND NULLIF(btrim(evidence ->> 'verifiedBy'), '') IS NOT NULL
      AND NULLIF(btrim(authority ->> 'responseSignerName'), '') IS NOT NULL
      AND NULLIF(btrim(authority ->> 'responseSignerRole'), '') IS NOT NULL
      AND (request_metadata ->> 'sentAt')::timestamptz IS NOT NULL
      AND NULLIF(btrim(request_metadata ->> 'externalReference'), '') IS NOT NULL
      AND NULLIF(btrim(terms ->> 'licenseName'), '') IS NOT NULL
      AND NULLIF(btrim(terms ->> 'attributionText'), '') IS NOT NULL
      AND NULLIF(btrim(terms ->> 'authoritativeVersionLabel'), '') IS NOT NULL
      AND NULLIF(btrim(terms ->> 'updateCadence'), '') IS NOT NULL
      AND (
        terms -> 'termsUrl' = 'null'::jsonb
        OR terms ->> 'termsUrl' ~ '^https://'
      )
      AND blockers = '[]'::jsonb
    )
  )
);

CREATE INDEX IF NOT EXISTS idx_observatory_dataset_authorizations_review
  ON observatory_dataset_authorizations (
    dataset_id,
    decision_status,
    updated_at DESC
  );

ALTER TABLE observatory_dataset_authorizations ENABLE ROW LEVEL SECURITY;

REVOKE ALL ON observatory_dataset_authorizations FROM anon, authenticated;
GRANT SELECT, INSERT, UPDATE ON observatory_dataset_authorizations
  TO service_role;

COMMENT ON TABLE observatory_dataset_authorizations IS
  'Internal source-reuse evidence. Approved rows require complete permission, attribution, signer and checksum provenance.';
COMMENT ON COLUMN observatory_dataset_authorizations.permissions IS
  'Explicit permission matrix. Raw-source redistribution may be false, but all derived-publication permissions must be true to approve.';
