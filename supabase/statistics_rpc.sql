-- ========================================================
-- Traffy Fondue Analytics - Dynamic Filtering RPC
-- ========================================================

-- This function dynamically aggregates 27k+ records based on interactive filters
-- and returns the complete dashboard payload in a single highly-optimized JSON.
CREATE OR REPLACE FUNCTION get_filtered_dashboard(
  p_district text DEFAULT NULL,
  p_problem_type text DEFAULT NULL,
  p_district_group text DEFAULT NULL
) RETURNS json AS $$
DECLARE
  result json;
BEGIN
  WITH filtered AS (
    SELECT * FROM traffy_complaints
    WHERE 
      (p_district IS NULL OR p_district = 'ทั้งหมด' OR district = p_district) AND
      (p_problem_type IS NULL OR p_problem_type = 'ทั้งหมด' OR problem_type = p_problem_type) AND
      (p_district_group IS NULL OR p_district_group = 'ทั้งหมด' OR district_group = p_district_group) AND
      (created_at >= NOW() - INTERVAL '1 month')
  )
  SELECT json_build_object(
    'summary', json_build_object(
      'totalApi', (SELECT count(*) FROM filtered),
      'byState', (
        SELECT COALESCE(json_agg(json_build_object('state', state, 'count', count)), '[]'::json) 
        FROM (SELECT state, count(*) as count FROM filtered GROUP BY state ORDER BY count DESC) s
      ),
      'byType', (
        SELECT COALESCE(json_agg(json_build_object('problem_type', problem_type, 'count', count)), '[]'::json) 
        FROM (SELECT problem_type, count(*) as count FROM filtered GROUP BY problem_type ORDER BY count DESC LIMIT 10) t
      ),
      'byDistrict', (
        SELECT COALESCE(json_agg(json_build_object('district', district, 'total', count)), '[]'::json) 
        FROM (SELECT district, count(*) as count FROM filtered GROUP BY district ORDER BY count DESC LIMIT 50) d
      ),
      'byGroup', (
        SELECT COALESCE(json_agg(json_build_object('district_group', district_group, 'total', count)), '[]'::json) 
        FROM (SELECT district_group, count(*) as count FROM filtered GROUP BY district_group ORDER BY count DESC) g
      ),
      'dailyTrend', (
        SELECT COALESCE(json_agg(json_build_object('day', day, 'count', count)), '[]'::json) 
        FROM (SELECT to_char(created_at, 'MM/DD') as day, count(*) as count FROM filtered GROUP BY 1 ORDER BY 1) dt
      )
    ),
    'points', (
      SELECT COALESCE(json_agg(json_build_object(
        'ticket_id', ticket_id,
        'district', district,
        'problem_type', problem_type,
        'state', state,
        'lon', lon,
        'lat', lat,
        'created_at', created_at
      )), '[]'::json)
      FROM (
        SELECT * FROM filtered ORDER BY created_at DESC LIMIT 3000
      ) p
    )
  ) INTO result;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql;
