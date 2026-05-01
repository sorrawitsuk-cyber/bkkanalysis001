-- ============================================================
-- Remove Traffy Fondue data from Supabase.
-- Traffy data has been migrated to Google BigQuery.
-- Run this in the Supabase SQL Editor AFTER confirming that
-- BigQuery contains all the data you need.
-- ============================================================

-- 1. Drop RPC function
DROP FUNCTION IF EXISTS get_filtered_dashboard(text, text, text);

-- 2. Drop views that depend on traffy_complaints
DROP VIEW IF EXISTS traffy_by_district;
DROP VIEW IF EXISTS traffy_by_problem_type;
DROP VIEW IF EXISTS traffy_by_state;
DROP VIEW IF EXISTS traffy_by_district_group;
DROP VIEW IF EXISTS traffy_daily_trend;
DROP VIEW IF EXISTS traffy_monthly_trend;
DROP VIEW IF EXISTS traffy_top_types_by_district;
DROP VIEW IF EXISTS traffy_recent;

-- 3. Drop the table and any remaining dependent views (CASCADE handles traffy_summary_* etc.)
DROP TABLE IF EXISTS traffy_complaints CASCADE;
