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
    const metric = searchParams.get('metric') === 'vegetation' ? 'vegetation' : 'lst';
    const valueKey = metric === 'vegetation' ? 'vegetation_index' : 'mean_lst';
    const maxKey = metric === 'vegetation' ? 'vegetation_index' : 'max_lst';

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
        min_lst = Math.min(min_lst, lstStats[valueKey]);
        max_lst = Math.max(max_lst, lstStats[valueKey]);
        
        if (compareYear) {
          const compStats = compareMap.get(feature.properties.id);
          if (compStats) {
            delta = lstStats[valueKey] - compStats[valueKey];
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
          ndvi: lstStats ? lstStats.vegetation_index : null,
          vegetation_delta: delta,
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
      acc[curr.year].sum += curr[valueKey];
      acc[curr.year].count += 1;
      if (metric === 'lst' && curr.monthly_lst) {
        curr.monthly_lst.forEach((mTemp: number, idx: number) => {
          acc[curr.year].monthlyData[idx] += mTemp;
          acc[curr.year].monthlyCount[idx] += 1;
        });
      }
      return acc;
    }, {});
    
    const yearlyTrend = Object.keys(trendData).sort().map(y => {
      const avg = parseFloat((trendData[y].sum / trendData[y].count).toFixed(metric === 'vegetation' ? 3 : 2));
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
    const yearlyAverageMap = new Map<number, number>(yearlyTrend.map(([trendYear, avg]) => [Number(trendYear), Number(avg)]));
    const baselineTrendAvg = compareYear ? yearlyAverageMap.get(compareYear) : null;
    const yearlyDeltaTrend = compareYear && baselineTrendAvg !== null && baselineTrendAvg !== undefined
      ? yearlyTrend.map(([trendYear, avg, maxMonthIdx]) => [
          trendYear,
          parseFloat((Number(avg) - baselineTrendAvg).toFixed(metric === 'vegetation' ? 3 : 2)),
          maxMonthIdx,
        ])
      : [];

    // 2. Ranking & Summary Data
    const currentYearData = summaryData.filter((d: any) => d.year === year);
    let ranking: any[] = [];
    let currentAvg = 0;
    let maxTemp = 0;
    let baselineAvg = 0;
    let maxIncreaseDelta = 0;
    let minIncreaseDelta = 0;

    if (currentYearData.length > 0) {
      currentAvg = currentYearData.reduce((sum: number, curr: any) => sum + curr[valueKey], 0) / currentYearData.length;
      maxTemp = currentYearData.reduce((max: number, curr: any) => Math.max(max, curr[maxKey] || curr[valueKey]), -Infinity);

      if (compareYear) {
        // Calculate delta for each district
        const compYearData = summaryData.filter((d: any) => d.year === compareYear);
        baselineAvg = compYearData.length > 0
          ? compYearData.reduce((sum: number, curr: any) => sum + curr[valueKey], 0) / compYearData.length
          : 0;
        const compMap = new Map(compYearData.map((d: any) => [d.district_id, d[valueKey]]));
        
        ranking = currentYearData
          .map((d: any) => {
            const baseline = compMap.get(d.district_id);
            return {
              name: d.district_name,
              delta: baseline !== undefined ? d[valueKey] - baseline : 0
            };
          })
          .sort((a: any, b: any) => b.delta - a.delta)
          .map((d: any) => [d.name, d.delta]);
        if (ranking.length > 0) {
          maxIncreaseDelta = Math.max(...ranking.map(([, deltaValue]) => deltaValue));
          minIncreaseDelta = Math.min(...ranking.map(([, deltaValue]) => deltaValue));
        }
      } else {
        ranking = currentYearData
          .sort((a: any, b: any) => b[valueKey] - a[valueKey])
          .map((d: any) => [d.district_name, d[valueKey]]);
      }
    }

    // 4. Monthly Trend
    const monthlyData = new Array(12).fill(0);
    const monthlyCounts = new Array(12).fill(0);
    currentYearData.forEach((d: any) => {
      if (metric === 'lst' && d.monthly_lst) {
        d.monthly_lst.forEach((temp: number, monthIdx: number) => {
          monthlyData[monthIdx] += temp;
          monthlyCounts[monthIdx] += 1;
        });
      }
    });
    const monthlyTrend = monthlyData.map((sum, idx) => 
      monthlyCounts[idx] > 0 ? parseFloat((sum / monthlyCounts[idx]).toFixed(2)) : 0
    );

    let baselineMonthlyTrend: number[] = [];
    const monthlyDeltaTrend = compareYear ? (() => {
      const baselineMonthlyData = new Array(12).fill(0);
      const baselineMonthlyCounts = new Array(12).fill(0);
      summaryData
        .filter((d: any) => d.year === compareYear)
        .forEach((d: any) => {
          if (d.monthly_lst) {
            d.monthly_lst.forEach((temp: number, monthIdx: number) => {
              baselineMonthlyData[monthIdx] += temp;
              baselineMonthlyCounts[monthIdx] += 1;
            });
          }
        });

      baselineMonthlyTrend = baselineMonthlyData.map((sum, idx) =>
        baselineMonthlyCounts[idx] > 0 ? parseFloat((sum / baselineMonthlyCounts[idx]).toFixed(2)) : 0
      );

      return monthlyTrend.map((temp, idx) => {
        if (monthlyCounts[idx] === 0 || baselineMonthlyCounts[idx] === 0) return 0;
        const baselineMonthAvg = baselineMonthlyTrend[idx];
        return parseFloat((temp - baselineMonthAvg).toFixed(2));
      });
    })() : [];

    return NextResponse.json({
      geojson: { type: "FeatureCollection", features },
      invertedMask: invertedMask,
      summary: {
        metric,
        selectedYear: year,
        compareYear: compareYear,
        averageTemp: parseFloat(currentAvg.toFixed(metric === 'vegetation' ? 3 : 2)),
        baselineAverageTemp: baselineAvg ? parseFloat(baselineAvg.toFixed(metric === 'vegetation' ? 3 : 2)) : null,
        avgDelta: compareYear && baselineAvg ? parseFloat((currentAvg - baselineAvg).toFixed(metric === 'vegetation' ? 3 : 2)) : 0,
        maxTemp: maxTemp > -Infinity ? parseFloat(maxTemp.toFixed(metric === 'vegetation' ? 3 : 2)) : null,
        yearlyTrend,
        yearlyDeltaTrend,
        monthlyTrend,
        baselineMonthlyTrend,
        monthlyDeltaTrend,
        ranking,
        min_lst: min_lst !== Infinity ? min_lst : 30,
        max_lst: max_lst !== -Infinity ? max_lst : 40,
        min_delta: min_delta !== Infinity ? min_delta : -2,
        max_delta: max_delta !== -Infinity ? max_delta : 2,
        maxIncreaseDelta: parseFloat(maxIncreaseDelta.toFixed(metric === 'vegetation' ? 3 : 2)),
        minIncreaseDelta: parseFloat(minIncreaseDelta.toFixed(metric === 'vegetation' ? 3 : 2)),
      }
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=86400, stale-while-revalidate=43200'
      }
    });

  } catch (error: any) {
    console.error('LST API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
