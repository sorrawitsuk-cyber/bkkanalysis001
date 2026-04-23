/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import { supabase } from '@/lib/supabase/client';
import fs from 'fs';
import path from 'path';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get('year') || '2024', 10);

    // 1. Try fetching from Supabase first
    const { data, error } = await supabase.from('districts').select('*');
    
    if (error || !data || data.length === 0) {
      console.warn("⚠️ Supabase error or empty. Falling back to local GeoJSON.");
      return serveLocalGeoJSON(year);
    }

    // 2. Format database rows into GeoJSON
    const geojson = {
      type: "FeatureCollection" as const,
      features: data.map(row => ({
        type: "Feature" as const,
        properties: {
          id: row.id,
          name_th: row.name_th,
          name_en: row.name_en,
          population: row.population,
          growth_rate: row.growth_rate,
          density: row.density,
          accessibility_index: row.accessibility_index,
          blind_spots: row.blind_spots
        },
        geometry: typeof row.geom === 'string' ? JSON.parse(row.geom) : row.geom
      }))
    };

    // DEBUG: Check if first feature is a square
    const firstGeom: any = geojson.features[0]?.geometry;
    if (firstGeom && firstGeom.coordinates && firstGeom.coordinates[0].length <= 5) {
        console.warn("⚠️ Detected square geometry in Supabase. Overriding with local real GeoJSON.");
        return serveLocalGeoJSON(year);
    }

    // Merge Traffy data and adjust base stats for historical years
    return NextResponse.json(mergeHistoricalData(geojson, year));

  } catch (err) {
    console.error("🔴 API Exception:", err);
    return serveLocalGeoJSON(2024);
  }
}

function serveLocalGeoJSON(year: number) {
  const filePath = path.join(process.cwd(), 'src', 'data', 'bkk_districts.geojson');
  const fileContent = fs.readFileSync(filePath, 'utf8');
  const geojson = JSON.parse(fileContent);
  return NextResponse.json(mergeHistoricalData(geojson, year));
}

function mergeHistoricalData(geojson: any, targetYear: number) {
  // Read Traffy data
  const traffyPath = path.join(process.cwd(), 'src', 'data', 'traffy_data.json');
  let traffyData: any = {};
  if (fs.existsSync(traffyPath)) {
    traffyData = JSON.parse(fs.readFileSync(traffyPath, 'utf8'));
  }

  // Adjust properties based on year
  const updatedFeatures = geojson.features.map((feature: any) => {
    const props = feature.properties;
    const districtId = props.id;

    // Simulate historical population/density changes (approx 1-2% per year backward from 2024)
    const yearsDiff = 2024 - targetYear;
    if (yearsDiff > 0) {
        const factor = Math.pow(1 - (props.growth_rate / 100), yearsDiff);
        props.population = Math.floor(props.population * factor);
        props.density = Math.floor(props.density * factor);
    }

    // Merge Traffy Open Data for specific year
    if (traffyData[districtId]) {
       const yearData = traffyData[districtId].find((d: any) => d.year === targetYear);
       if (yearData) {
         props.traffy_issues = yearData.traffy_issues;
         props.traffy_resolved_rate = yearData.traffy_resolved_rate;
       } else {
         props.traffy_issues = 0;
         props.traffy_resolved_rate = 0;
       }
    }

    return feature;
  });

  return { ...geojson, features: updatedFeatures };
}
