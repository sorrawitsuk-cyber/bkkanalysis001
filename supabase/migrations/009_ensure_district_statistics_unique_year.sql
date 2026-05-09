-- Ensure district_statistics can be safely upserted by district/year.

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM pg_constraint
    WHERE conname = 'district_statistics_district_id_year_key'
      AND conrelid = 'public.district_statistics'::regclass
  ) THEN
    ALTER TABLE public.district_statistics
      ADD CONSTRAINT district_statistics_district_id_year_key UNIQUE (district_id, year);
  END IF;
END
$$;
