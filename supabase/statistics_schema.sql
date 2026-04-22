-- Create the time-series statistics table
CREATE TABLE district_statistics (
    id SERIAL PRIMARY KEY,
    district_id INT NOT NULL,
    year INT NOT NULL,
    population INT,
    growth_rate FLOAT,
    density FLOAT,
    accessibility_index FLOAT,
    ndvi_score FLOAT,
    FOREIGN KEY (district_id) REFERENCES districts(id) ON DELETE CASCADE
);

-- Index for faster time-series queries
CREATE INDEX idx_district_statistics_district_year ON district_statistics(district_id, year);

-- Disable RLS to allow easy seeding (Enable it later in production)
ALTER TABLE district_statistics DISABLE ROW LEVEL SECURITY;
