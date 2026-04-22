-- Enable PostGIS extension
CREATE EXTENSION IF NOT EXISTS postgis;

-- Create the districts table
CREATE TABLE districts (
    id SERIAL PRIMARY KEY,
    name_th VARCHAR(255) NOT NULL,
    name_en VARCHAR(255) NOT NULL,
    geom GEOMETRY(Polygon, 4326),
    population INT DEFAULT 0,
    growth_rate FLOAT DEFAULT 0.0,
    density FLOAT DEFAULT 0.0,
    accessibility_index FLOAT DEFAULT 0.0,
    blind_spots INT DEFAULT 0
);

-- Note: In a production App, you would upload the shapefile or GeoJSON
-- directly to this table using a tool like ogr2ogr, shp2pgsql, or Supabase's UI.
-- 
-- Example of inserting a dummy row with a PostGIS geometry:
-- INSERT INTO districts (name_th, name_en, population, growth_rate, density, accessibility_index, blind_spots, geom)
-- VALUES ('พระนคร', 'Phra Nakhon', 41369, -1.2, 7472, 8.5, 2, ST_GeomFromGeoJSON('{"type":"Polygon","coordinates":[[[100.490,13.750],[100.505,13.765],[100.510,13.745],[100.490,13.750]]]}'));
