-- Legacy migration retained for audit; not part of linked CLI history.
-- Migration 010: water_area_rai generated column + RLS hardening + FK constraint
-- Created: 2026-05-29

-- 1. Add water_area_rai as a persisted generated column from water_ratio × district area.
--    Since district area is stored in GeoJSON (not a DB column), we use an approximate
--    BKK-average area of 19,600 rai as a fallback and rely on app-layer enrichment for exact values.
--    Adding the column as regular nullable; the app route already computes it correctly.
ALTER TABLE district_statistics
  ADD COLUMN IF NOT EXISTS water_area_rai INTEGER;

-- Backfill approximate values where water_ratio exists but water_area_rai is NULL.
-- Uses 19,600 rai (≈ average BKK district size) as approximation for districts without exact area.
UPDATE district_statistics
SET water_area_rai = ROUND(water_ratio * 19600)
WHERE water_ratio IS NOT NULL
  AND water_area_rai IS NULL;

-- 2. Add comment explaining the column
COMMENT ON COLUMN district_statistics.water_area_rai IS
  'Estimated water area in rai (water_ratio × district area). Exact values computed in app layer using GeoJSON areas.';

-- 3. Add FK constraint from district_statistics.district_id → districts.id (if not already present)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.table_constraints
    WHERE constraint_name = 'fk_district_statistics_district_id'
      AND table_name = 'district_statistics'
  ) THEN
    ALTER TABLE district_statistics
      ADD CONSTRAINT fk_district_statistics_district_id
      FOREIGN KEY (district_id)
      REFERENCES districts(id)
      ON DELETE CASCADE;
  END IF;
END $$;

-- 4. RLS hardening: deny INSERT/UPDATE/DELETE for anon and authenticated roles.
--    Only service_role (which bypasses RLS) can write.
--    This prevents accidental writes if the anon key is exposed.

-- Drop any existing write policies first
DROP POLICY IF EXISTS "allow_anon_write" ON district_statistics;
DROP POLICY IF EXISTS "allow_authenticated_write" ON district_statistics;

-- Explicitly deny write operations for non-service roles
-- (No INSERT/UPDATE/DELETE policies = denied by RLS when enabled)
-- Confirm RLS is still enabled
ALTER TABLE district_statistics ENABLE ROW LEVEL SECURITY;

-- 5. Add index for water_area_rai queries
CREATE INDEX IF NOT EXISTS idx_district_statistics_water_area_rai
  ON district_statistics (water_area_rai)
  WHERE water_area_rai IS NOT NULL;
