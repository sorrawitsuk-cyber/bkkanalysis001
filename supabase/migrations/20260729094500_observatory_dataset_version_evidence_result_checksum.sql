-- Clarify that the stable checksum identifies the QA result payload, not the
-- serialized report file (which also contains a run timestamp).

ALTER TABLE observatory_dataset_version_evidence
  RENAME COLUMN report_checksum_sha256 TO result_checksum_sha256;

COMMENT ON COLUMN observatory_dataset_version_evidence.result_checksum_sha256 IS
  'Stable checksum of the QA method, config, source response, aggregate metrics, and per-area metrics.';
