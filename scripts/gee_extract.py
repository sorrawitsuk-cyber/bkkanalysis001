"""
Google Earth Engine (GEE) Data Extraction & Supabase Pipeline
ดึงข้อมูล NDVI (พื้นที่สีเขียว) และ NTL (แสงสว่างยามค่ำคืน/ความหนาแน่น) จาก GEE
เพื่อป้อนเข้าสู่ตาราง district_statistics ใน Supabase 
"""

import ee
import json
import os
import pandas as pd
from supabase import create_client, Client
from dotenv import load_dotenv

# Load environment variables
load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), '../.env.local'))

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing Supabase credentials in .env.local")

# Initialize Supabase
supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)

def init_gee():
    try:
        ee.Initialize()
        print("GEE Initialized successfully.")
    except Exception as e:
        print("GEE Not authenticated. Please run `earthengine authenticate` first.")
        ee.Authenticate()
        ee.Initialize()

def get_bkk_geojson():
    filepath = os.path.join(os.path.dirname(__file__), '../src/data/bkk_districts.geojson')
    with open(filepath, 'r', encoding='utf-8') as f:
        return json.load(f)

def extract_and_upload_stats(start_year=2020, end_year=2024):
    print(f"Starting GEE Extraction for years {start_year} to {end_year}...")
    bkk_geojson = get_bkk_geojson()
    features = bkk_geojson['features']
    
    # In a real scenario, we map the dummy geojson 'id' to the Supabase 'id'
    # We will assume they match 1:1 for this test since we seeded them in order.
    
    for year in range(start_year, end_year + 1):
        try:
            # 1. NDVI (Green Space Proxy) from Landsat 8
            landsat = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2') \
                .filterDate(f'{year}-01-01', f'{year}-12-31') \
                .map(lambda image: image.normalizedDifference(['SR_B5', 'SR_B4']).rename('NDVI'))
            median_ndvi = landsat.median()

            # 2. NTL (Density Proxy) from VIIRS Stray Light Corrected Nighttime Day/Night Band
            viirs = ee.ImageCollection('NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG') \
                .filterDate(f'{year}-01-01', f'{year}-12-31') \
                .select('avg_rad')
            mean_ntl = viirs.mean()

            records = []
            
            for feature in features:
                dist_id = feature['properties']['id']
                dist_name = feature['properties']['name_en']
                
                # Create GEE Geometry
                geom = ee.Geometry.Polygon(feature['geometry']['coordinates'])
                
                # Extract NDVI
                ndvi_stats = median_ndvi.reduceRegion(
                    reducer=ee.Reducer.mean(),
                    geometry=geom,
                    scale=30,
                    maxPixels=1e9
                )
                ndvi_val = ndvi_stats.get('NDVI').getInfo() or 0.0

                # Extract NTL
                ntl_stats = mean_ntl.reduceRegion(
                    reducer=ee.Reducer.mean(),
                    geometry=geom,
                    scale=500,
                    maxPixels=1e9
                )
                ntl_val = ntl_stats.get('avg_rad').getInfo() or 0.0
                
                # Mock Population based on NTL (higher light = higher pop proxy)
                mock_population = int(ntl_val * 5000)
                mock_density = int(ntl_val * 150)
                mock_growth = (ntl_val / 10) - 1.0
                mock_access = min(ntl_val / 2, 10.0)

                record = {
                    "district_id": dist_id,
                    "year": year,
                    "population": mock_population,
                    "growth_rate": round(mock_growth, 2),
                    "density": mock_density,
                    "accessibility_index": round(mock_access, 1),
                    "ndvi_score": round(ndvi_val * 10, 2) # scale NDVI to 0-10
                }
                records.append(record)
                print(f"[{year}] Extracted {dist_name}: NDVI={record['ndvi_score']}, NTL={ntl_val}")

            # Upload to Supabase
            print(f"Uploading {year} data to Supabase 'district_statistics'...")
            response = supabase.table('district_statistics').insert(records).execute()
            print(f"Year {year} uploaded successfully!")
            
        except Exception as e:
            print(f"Error processing year {year}: {e}")

if __name__ == '__main__':
    print("--- Bangkok Analytics GEE Pipeline ---")
    # Uncomment to run the actual extraction if GEE is configured
    init_gee()
    extract_and_upload_stats(2020, 2024)
    print("Script execution attempted.")
