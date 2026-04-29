-- =============================================
-- Traffy Fondue Data Warehouse Schema
-- =============================================

-- 1. Main complaints table
CREATE TABLE IF NOT EXISTS traffy_complaints (
    ticket_id TEXT PRIMARY KEY,
    district TEXT DEFAULT 'ไม่ระบุ',
    district_group TEXT DEFAULT 'ไม่ระบุ',
    problem_type TEXT DEFAULT 'อื่นๆ',
    state TEXT DEFAULT 'ไม่ระบุ',
    description TEXT,
    address TEXT,
    lon FLOAT,
    lat FLOAT,
    photo_url TEXT,
    org TEXT,
    created_at TIMESTAMPTZ
);

-- 2. Indexes for fast queries
CREATE INDEX IF NOT EXISTS idx_traffy_created ON traffy_complaints(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_traffy_district ON traffy_complaints(district);
CREATE INDEX IF NOT EXISTS idx_traffy_type ON traffy_complaints(problem_type);
CREATE INDEX IF NOT EXISTS idx_traffy_state ON traffy_complaints(state);

-- 3. Summary view: Monthly breakdown
CREATE OR REPLACE VIEW traffy_summary_monthly AS
SELECT 
    to_char(created_at, 'YYYY-MM') AS month,
    COUNT(*) AS count
FROM traffy_complaints
WHERE created_at IS NOT NULL
GROUP BY 1
ORDER BY 1;

-- 4. Summary view: By district
CREATE OR REPLACE VIEW traffy_summary_district AS
SELECT 
    district,
    district_group,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE state = 'เสร็จสิ้น') AS resolved,
    ROUND(100.0 * COUNT(*) FILTER (WHERE state = 'เสร็จสิ้น') / NULLIF(COUNT(*), 0), 1) AS resolve_rate
FROM traffy_complaints
WHERE district != 'ไม่ระบุ'
GROUP BY 1, 2
ORDER BY total DESC;

-- 5. Summary view: By problem type
CREATE OR REPLACE VIEW traffy_summary_type AS
SELECT 
    problem_type,
    COUNT(*) AS count
FROM traffy_complaints
GROUP BY 1
ORDER BY count DESC;

-- 6. Summary view: By state
CREATE OR REPLACE VIEW traffy_summary_state AS
SELECT 
    state,
    COUNT(*) AS count
FROM traffy_complaints
GROUP BY 1
ORDER BY count DESC;

-- 7. Summary view: By district group
CREATE OR REPLACE VIEW traffy_summary_district_group AS
SELECT 
    district_group,
    COUNT(*) AS total,
    COUNT(*) FILTER (WHERE state = 'เสร็จสิ้น') AS resolved
FROM traffy_complaints
WHERE district_group != 'ไม่ระบุ'
GROUP BY 1
ORDER BY total DESC;

-- 8. Summary view: Daily trend (last 30 days)
CREATE OR REPLACE VIEW traffy_summary_daily AS
SELECT 
    to_char(created_at, 'MM/DD') AS day,
    created_at::date AS date_val,
    COUNT(*) AS count
FROM traffy_complaints
WHERE created_at >= NOW() - INTERVAL '30 days'
GROUP BY 1, 2
ORDER BY 2;

-- 9. Summary view: Yearly
CREATE OR REPLACE VIEW traffy_summary_yearly AS
SELECT 
    EXTRACT(YEAR FROM created_at)::INT AS year,
    COUNT(*) AS count
FROM traffy_complaints
WHERE created_at IS NOT NULL
GROUP BY 1
ORDER BY 1;

-- 10. Disable RLS for dev (enable with policies for production)
ALTER TABLE traffy_complaints ENABLE ROW LEVEL SECURITY;
CREATE POLICY "Allow public read" ON traffy_complaints FOR SELECT USING (true);
CREATE POLICY "Allow service insert" ON traffy_complaints FOR INSERT WITH CHECK (true);
CREATE POLICY "Allow service update" ON traffy_complaints FOR UPDATE USING (true);
CREATE POLICY "Allow service delete" ON traffy_complaints FOR DELETE USING (true);
