/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from 'next/server';
import * as turf from '@turf/turf';
import geojson from '@/data/bkk_districts.json';
import lstData from '@/data/lst_data.json';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const yearStr = searchParams.get('year') || '2024';
    const year = parseInt(yearStr, 10);
    const districtFilter = searchParams.get('district');

    // Read Data
    // Data is now imported statically

    // Create inverted mask for BKK
    let invertedMask = null;
    try {
      // First, we need to dissolve/union all districts into one big polygon
      let bkkPolygon: any = geojson.features[0];
      for (let i = 1; i < geojson.features.length; i++) {
        bkkPolygon = turf.union(turf.featureCollection([bkkPolygon, geojson.features[i]]));
      }
      // Create inverted mask (world bounds minus BKK polygon)
      // turf.mask takes a polygon and returns a world-sized polygon with the input polygon cut out
      invertedMask = turf.mask(bkkPolygon);
    } catch (e) {
      console.error("Mask generation failed:", e);
    }

    const compareYearStr = searchParams.get('compareYear');
    const compareYear = compareYearStr ? parseInt(compareYearStr, 10) : null;

    // Filter LST Data for the selected year
    const yearData = lstData.filter((d: any) => d.year === year);
    
    // Create a map for quick lookup
    const lstMap = new Map();
    yearData.forEach((d: any) => {
      lstMap.set(d.district_id, d);
    });

    // If compare mode is active
    let compareMap = new Map();
    if (compareYear) {
      const compData = lstData.filter((d: any) => d.year === compareYear);
      compData.forEach((d: any) => {
        compareMap.set(d.district_id, d);
      });
    }

    let min_lst = Infinity;
    let max_lst = -Infinity;
    let min_delta = Infinity;
    let max_delta = -Infinity;

    // Merge LST data into GeoJSON properties
    const features = geojson.features.map((feature: any) => {
      const lstStats = lstMap.get(feature.properties.id) || null;
      let delta = null;

      if (lstStats) {
        min_lst = Math.min(min_lst, lstStats.mean_lst);
        max_lst = Math.max(max_lst, lstStats.mean_lst);
        
        if (compareYear) {
          const compStats = compareMap.get(feature.properties.id);
          if (compStats) {
            delta = lstStats.mean_lst - compStats.mean_lst;
            min_delta = Math.min(min_delta, delta);
            max_delta = Math.max(max_delta, delta);
          }
        }
      }

      return {
        ...feature,
        properties: {
          ...feature.properties,
          mean_lst: lstStats ? lstStats.mean_lst : null,
          max_lst: lstStats ? lstStats.max_lst : null,
          delta: delta,
          vegetation_index: lstStats ? lstStats.vegetation_index : null,
        }
      };
    });

    // Generate Summary Statistics
    let summaryData = lstData;
    if (districtFilter && districtFilter !== 'ทั้งหมด') {
      summaryData = lstData.filter((d: any) => d.district_name === districtFilter || `เขต${d.district_name}` === districtFilter);
    }

    // 1. Overall Average & Yearly Trend
    const trendData = summaryData.reduce((acc: any, curr: any) => {
      if (!acc[curr.year]) {
        acc[curr.year] = { sum: 0, count: 0, monthlyData: new Array(12).fill(0), monthlyCount: new Array(12).fill(0) };
      }
      acc[curr.year].sum += curr.mean_lst;
      acc[curr.year].count += 1;
      if (curr.monthly_lst) {
        curr.monthly_lst.forEach((mTemp: number, idx: number) => {
          acc[curr.year].monthlyData[idx] += mTemp;
          acc[curr.year].monthlyCount[idx] += 1;
        });
      }
      return acc;
    }, {});
    
    const yearlyTrend = Object.keys(trendData).sort().map(y => {
      const avg = parseFloat((trendData[y].sum / trendData[y].count).toFixed(2));
      let maxMonthIdx = -1;
      let maxMonthTemp = -Infinity;
      trendData[y].monthlyData.forEach((sum: number, idx: number) => {
        if (trendData[y].monthlyCount[idx] > 0) {
          const mAvg = sum / trendData[y].monthlyCount[idx];
          if (mAvg > maxMonthTemp) {
            maxMonthTemp = mAvg;
            maxMonthIdx = idx;
          }
        }
      });
      return [y, avg, maxMonthIdx];
    });

    // 2. Ranking
    let ranking;
    if (compareYear) {
    // 2. Ranking (Top Hottest Districts for selected year, or Top Increases if comparing)
    let ranking = [];
    const currentYearData = summaryData.filter((d: any) => d.year === year);
    if (compareYear) {
      // Calculate delta for each district
      const compYearData = summaryData.filter((d: any) => d.year === compareYear);
      const compMap = new Map(compYearData.map((d: any) => [d.district_id, d.mean_lst]));
      
      ranking = currentYearData
        .map((d: any) => {
          const baseline = compMap.get(d.district_id);
          return {
            name: d.district_name,
            delta: baseline !== undefined ? d.mean_lst - baseline : 0
          };
        })
        .sort((a: any, b: any) => b.delta - a.delta)
        .map((d: any) => [d.name, d.delta]);
    } else {
      ranking = currentYearData
        .sort((a: any, b: any) => b.mean_lst - a.mean_lst)
        .map((d: any) => [d.district_name, d.mean_lst]);
    }

    // 3. Current average & max
    let currentAvg = 0;
    let maxTemp = 0;
    const currentYearData = summaryData.filter((d: any) => d.year === year);
    if (currentYearData.length > 0) {
      currentAvg = currentYearData.reduce((sum: number, curr: any) => sum + curr.mean_lst, 0) / currentYearData.length;
      maxTemp = currentYearData.reduce((max: number, curr: any) => Math.max(max, curr.max_lst || curr.mean_lst), -Infinity);
    }

    // 4. Monthly Trend
    const monthlyData = new Array(12).fill(0);
    const monthlyCounts = new Array(12).fill(0);
    currentYearData.forEach((d: any) => {
      if (d.monthly_lst) {
        d.monthly_lst.forEach((temp: number, monthIdx: number) => {
          monthlyData[monthIdx] += temp;
          monthlyCounts[monthIdx] += 1;
        });
      }
    });
    const monthlyTrend = monthlyData.map((sum, idx) => 
      monthlyCounts[idx] > 0 ? parseFloat((sum / monthlyCounts[idx]).toFixed(2)) : 0
    );

    return NextResponse.json({
      geojson: { type: "FeatureCollection", features },
      invertedMask: invertedMask,
      summary: {
        selectedYear: year,
        compareYear: compareYear,
        averageTemp: parseFloat(currentAvg.toFixed(2)),
        avgDelta: compareYear ? (() => {
          const baselineData = summaryData.filter((d: any) => d.year === compareYear);
          if (baselineData.length === 0) return 0;
          const baselineAvg = baselineData.reduce((sum: number, curr: any) => sum + curr.mean_lst, 0) / baselineData.length;
          return parseFloat((currentAvg - baselineAvg).toFixed(2));
        })() : 0,
        maxTemp: maxTemp > -Infinity ? parseFloat(maxTemp.toFixed(2)) : null,
        yearlyTrend,
        monthlyTrend,
        ranking,
        min_lst: min_lst !== Infinity ? min_lst : 30,
        max_lst: max_lst !== -Infinity ? max_lst : 40,
        min_delta: min_delta !== Infinity ? min_delta : -2,
        max_delta: max_delta !== -Infinity ? max_delta : 2,
      }
    });

  } catch (error: any) {
    console.error('LST API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
