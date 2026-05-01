/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import * as turf from '@turf/turf';
import { supabase } from '@/lib/supabase/client';
import { normalizeNdviScore, getNdviClass } from '@/lib/ndvi';
import geojson from '@/data/bkk_districts.json';
import fs from 'fs';
import path from 'path';

// Actual district areas in rai, computed once from GeoJSON geometry
const districtAreaRaiMap = new Map<number, number>(
  (geojson.features as any[]).map((f: any) => [
    f.properties.id,
    Math.round(turf.area(f) / 1600),
  ])
);

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const districtId = searchParams.get('district_id');

  if (!districtId) {
    return NextResponse.json({ error: 'Missing district_id' }, { status: 400 });
  }

  // 1. Fetch from Supabase
  const { data: dbData, error } = await supabase
    .from('district_statistics')
    .select('*')
    .eq('district_id', districtId)
    .order('year', { ascending: true });

  let finalData: any[] = dbData || [];

  // 2. Fallback to mock data if DB fails or empty
  if (error || !dbData || dbData.length === 0) {
    console.warn("⚠️ Falling back to dummy statistics for district", districtId);
    finalData = generateDummyStats(parseInt(districtId, 10));
  }

  // 3. Merge Traffy Open Data history
  const traffyPath = path.join(process.cwd(), 'src', 'data', 'traffy_data.json');
  if (fs.existsSync(traffyPath)) {
    const traffyAll = JSON.parse(fs.readFileSync(traffyPath, 'utf8'));
    const districtTraffy = traffyAll[districtId] || [];
    
    // Merge into data
    finalData = finalData.map((row: any) => {
      const tData = districtTraffy.find((t: any) => t.year === row.year);
      if (tData) {
         return {
           ...row,
           traffy_issues: tData.traffy_issues,
           traffy_resolved_rate: tData.traffy_resolved_rate
         };
      }
      return row;
    });
  }

  return NextResponse.json(finalData);
}

function generateDummyStats(districtId: number) {
  const currentYear = new Date().getFullYear();
  const years = [currentYear - 4, currentYear - 3, currentYear - 2, currentYear - 1, currentYear];
  
  // Base values (deterministic based on ID)
  const basePop = 50000 + (districtId * 2000);
  const baseGrowth = -1.5 + (districtId * 0.1);
  const baseDensity = 3000 + (districtId * 50);
  const baseAccess = 4.0 + (districtId * 0.1);
  const baseBlind = (districtId % 5) + 1;
  const baseNdvi = 0.2 + (districtId * 0.01);
  const baseNtl = 15.0 + (districtId * 0.5);

  return years.map((year, index) => {
    const factor = 1 + (index * 0.05); // slight increase over time
    const ndviMean = parseFloat((baseNdvi * (1 - (index * 0.02))).toFixed(3));
    const greenAreaRatio = Math.max(0.03, Math.min(0.65, ndviMean - 0.05));
    return {
      id: districtId * 100 + index,
      district_id: districtId,
      year: year,
      population: Math.floor(basePop * factor),
      growth_rate: parseFloat((baseGrowth * factor).toFixed(2)),
      density: Math.floor(baseDensity * factor),
      accessibility_index: parseFloat((baseAccess * factor).toFixed(2)),
      blind_spots: Math.max(0, Math.floor(baseBlind - (index * 0.2))),
      ndvi: ndviMean,
      ndvi_mean: ndviMean,
      ndvi_median: ndviMean,
      ndvi_min: parseFloat(Math.max(-0.1, ndviMean - 0.18).toFixed(3)),
      ndvi_max: parseFloat(Math.min(0.85, ndviMean + 0.24).toFixed(3)),
      ndvi_score: normalizeNdviScore(ndviMean),
      ndvi_class: getNdviClass(ndviMean),
      green_area_ratio: parseFloat(greenAreaRatio.toFixed(3)),
      green_area_rai: Math.round(greenAreaRatio * (districtAreaRaiMap.get(districtId) ?? 19600)),
      low_green_ratio: parseFloat(Math.max(0.05, 0.6 - greenAreaRatio).toFixed(3)),
      water_ratio: 0,
      ntl_mean: parseFloat((baseNtl * factor).toFixed(2)),
      processing_note: 'Fallback demo statistics; population and density are not official values.'
    };
  });
}
