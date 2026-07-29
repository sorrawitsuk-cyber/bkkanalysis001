-- Preserve the audit record when an authorization request workflow is
-- intentionally withdrawn in favor of direct public-service consumption.

ALTER TABLE observatory_dataset_authorizations
  DROP CONSTRAINT IF EXISTS
    observatory_dataset_authorizations_decision_status_check;

ALTER TABLE observatory_dataset_authorizations
  ADD CONSTRAINT observatory_dataset_authorizations_decision_status_check
  CHECK (
    decision_status IN (
      'pending',
      'approved',
      'rejected',
      'revoked',
      'expired',
      'withdrawn'
    )
  );

COMMENT ON COLUMN observatory_dataset_authorizations.decision_status IS
  'Review lifecycle. Withdrawn means the request will not be sent and its promotion gate remains blocked.';
