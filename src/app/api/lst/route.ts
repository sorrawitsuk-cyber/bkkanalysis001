/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import * as turf from "@turf/turf";
import geojson from "@/data/bkk_districts.json";
import lstData from "@/data/lst_data.json";
import { supabase } from "@/lib/supabase/client";
import {
  calculatePriorityScore,
  getNdviClass,
  getPriorityReasons,
  normalizeNdviScore,
  resolveNdviMean,
} from "@/lib/ndvi";
import { getBangkokNdviSummaryFromRows } from "@/lib/district-statistics";
import type { DistrictStatistic } from "@/types/district";

export const dynamic = "force-dynamic";

const ALL_DISTRICTS = "ทั้งหมด";

// Actual district areas in rai (1 rai = 1,600 m²), computed once from GeoJSON geometry
const districtAreaRaiMap = new Map<number, number>(
  (geojson.features as any[]).map((f: any) => [
    f.properties.id,
    Math.round(turf.area(f) / 1600),
  ])
);

function valueFor(row: any, metric: "lst" | "vegetation"): number | null {
  if (!row) return null;
  if (metric === "vegetation") return resolveNdviMean(row);
  return typeof row.mean_lst === "number" ? row.mean_lst : null;
}

function toVegetationFallbackRow(row: any): DistrictStatistic {
  const ndviMean = typeof row.vegetation_index === "number" ? row.vegetation_index : null;
  const greenAreaRatio = ndviMean === null ? null : Math.max(0.03, Math.min(0.65, ndviMean - 0.08));
  const districtAreaRai = districtAreaRaiMap.get(row.district_id) ?? 19600; // ~BKK avg if unknown
  return {
    district_id: row.district_id,
    district_name: row.district_name,
    year: row.year,
    ndvi_mean: ndviMean,
    ndvi_median: ndviMean,
    ndvi_min: ndviMean === null ? null : Math.max(-0.1, ndviMean - 0.18),
    ndvi_max: ndviMean === null ? null : Math.min(0.85, ndviMean + 0.22),
    ndvi_score: normalizeNdviScore(ndviMean),
    ndvi_class: getNdviClass(ndviMean),
    green_area_ratio: greenAreaRatio,
    green_area_rai: greenAreaRatio === null ? null : Math.round(greenAreaRatio * districtAreaRai),
    low_green_ratio: greenAreaRatio === null ? null : Math.max(0.05, 0.62 - greenAreaRatio),
    water_ratio: 0,
    ntl_mean: null,
    processing_note: "Local fallback from demo vegetation_index; green area is approximate.",
  };
}

async function loadDbRows(year: number, districtNameById: Map<number, string>): Promise<DistrictStatistic[]> {
  const { data, error } = await supabase.from("district_statistics").select("*").eq("year", year);
  if (error || !data || data.length === 0) {
    if (error) console.warn("district_statistics fetch failed:", error.message);
    return [];
  }
  return (data as DistrictStatistic[]).map((row) => ({
    ...row,
    district_name: districtNameById.get(row.district_id) || row.district_name || null,
  }));
}

async function loadAllDbRows(districtNameById: Map<number, string>): Promise<DistrictStatistic[]> {
  const { data, error } = await supabase
    .from("district_statistics")
    .select("*")
    .order("year", { ascending: true });
  if (error || !data || data.length === 0) return [];
  return (data as DistrictStatistic[]).map((row) => ({
    ...row,
    district_name: districtNameById.get(row.district_id) || row.district_name || null,
  }));
}

function hasLstData(rows: DistrictStatistic[]): boolean {
  return rows.some((r) => typeof r.mean_lst === "number");
}

function hasNdviData(rows: DistrictStatistic[]): boolean {
  return rows.some((r) => typeof r.ndvi_mean === "number");
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const year = parseInt(searchParams.get("year") || "2024", 10);
    const districtFilter = searchParams.get("district");
    const metric = searchParams.get("metric") === "vegetation" ? "vegetation" : "lst";
    const compareYearStr = searchParams.get("compareYear");
    const compareYear = compareYearStr ? parseInt(compareYearStr, 10) : null;

    let invertedMask = null;
    try {
      let bkkPolygon: any = geojson.features[0];
      for (let i = 1; i < geojson.features.length; i++) {
        bkkPolygon = turf.union(turf.featureCollection([bkkPolygon, geojson.features[i]]));
      }
      invertedMask = turf.mask(bkkPolygon);
    } catch (error) {
      console.error("Mask generation failed:", error);
    }

    const districtNameById = new Map<number, string>();
    geojson.features.forEach((feature: any) => {
      districtNameById.set(feature.properties.id, feature.properties.name_th);
    });

    const dbYearRows = await loadDbRows(year, districtNameById);
    const dbCompareRows = compareYear ? await loadDbRows(compareYear, districtNameById) : [];
    const dbAllRows = dbYearRows.length > 0 ? await loadAllDbRows(districtNameById) : [];
    const localYearRows = lstData.filter((row: any) => row.year === year);
    const localCompareRows = compareYear ? lstData.filter((row: any) => row.year === compareYear) : [];

    const useDbYear = metric === "vegetation" ? hasNdviData(dbYearRows) : hasLstData(dbYearRows);
    const useDbCompare = metric === "vegetation" ? hasNdviData(dbCompareRows) : hasLstData(dbCompareRows);
    const useDbAll = metric === "vegetation" ? dbAllRows.some(hasNdviData as any) : dbAllRows.some((r) => typeof r.mean_lst === "number");

    const yearData: any[] = metric === "vegetation"
      ? (useDbYear ? dbYearRows : localYearRows.map((r: any) => toVegetationFallbackRow(r)))
      : (useDbYear ? dbYearRows : localYearRows);
    const compareData: any[] = metric === "vegetation"
      ? (useDbCompare ? dbCompareRows : localCompareRows.map((r: any) => toVegetationFallbackRow(r)))
      : localCompareRows;

    const lstMap = new Map<number, any>();
    yearData.forEach((row) => lstMap.set(row.district_id, row));
    const compareMap = new Map<number, any>();
    compareData.forEach((row) => compareMap.set(row.district_id, row));

    let minValue = Infinity;
    let maxValue = -Infinity;
    let minDelta = Infinity;
    let maxDelta = -Infinity;

    const features = geojson.features.map((feature: any) => {
      const row = lstMap.get(feature.properties.id) || null;
      const currentValue = valueFor(row, metric);
      const compareValue = compareYear ? valueFor(compareMap.get(feature.properties.id), metric) : null;
      const delta = currentValue !== null && compareValue !== null ? currentValue - compareValue : null;
      if (currentValue !== null) {
        minValue = Math.min(minValue, currentValue);
        maxValue = Math.max(maxValue, currentValue);
      }
      if (delta !== null) {
        minDelta = Math.min(minDelta, delta);
        maxDelta = Math.max(maxDelta, delta);
      }

      const ndviMean = metric === "vegetation" ? currentValue : null;
      const ndviScore = metric === "vegetation" ? (row?.ndvi_score ?? normalizeNdviScore(ndviMean)) : null;

      return {
        ...feature,
        properties: {
          ...feature.properties,
          mean_lst: row?.mean_lst ?? null,
          max_lst: row?.max_lst ?? null,
          delta,
          vegetation_index: ndviMean,
          ndvi: ndviMean,
          ndvi_mean: ndviMean,
          ndvi_score: ndviScore,
          ndvi_class: metric === "vegetation" ? (row?.ndvi_class || getNdviClass(ndviMean)) : null,
          green_area_ratio: row?.green_area_ratio ?? null,
          green_area_rai: row?.green_area_rai ?? null,
          low_green_ratio: row?.low_green_ratio ?? null,
          water_ratio: row?.water_ratio ?? null,
          ntl_mean: row?.ntl_mean ?? null,
          priority_score: metric === "vegetation" && row ? calculatePriorityScore(row) : null,
          priority_reasons: metric === "vegetation" && row ? getPriorityReasons(row) : [],
          vegetation_delta: delta,
        },
      };
    });

    const hasAnyDbLst = dbAllRows.some((r) => typeof r.mean_lst === "number");
    let summaryData: any[] = metric === "vegetation"
      ? (dbAllRows.length ? dbAllRows : lstData.map((r: any) => toVegetationFallbackRow(r)))
      : (hasAnyDbLst ? dbAllRows : lstData);
    if (districtFilter && districtFilter !== ALL_DISTRICTS) {
      summaryData = summaryData.filter((row: any) => row.district_name === districtFilter || `เขต${row.district_name}` === districtFilter);
    }

    const trendData = summaryData.reduce((acc: any, row: any) => {
      const trendValue = valueFor(row, metric);
      if (trendValue === null) return acc;
      if (!acc[row.year]) {
        acc[row.year] = { sum: 0, count: 0, monthlyData: new Array(12).fill(0), monthlyCount: new Array(12).fill(0) };
      }
      acc[row.year].sum += trendValue;
      acc[row.year].count += 1;
      if (metric === "lst" && row.monthly_lst) {
        row.monthly_lst.forEach((temp: number, idx: number) => {
          acc[row.year].monthlyData[idx] += temp;
          acc[row.year].monthlyCount[idx] += 1;
        });
      }
      return acc;
    }, {});

    const yearlyTrend = Object.keys(trendData).sort().map((trendYear) => {
      const avg = parseFloat((trendData[trendYear].sum / trendData[trendYear].count).toFixed(metric === "vegetation" ? 3 : 2));
      let maxMonthIdx = -1;
      let maxMonthTemp = -Infinity;
      trendData[trendYear].monthlyData.forEach((sum: number, idx: number) => {
        if (trendData[trendYear].monthlyCount[idx] > 0) {
          const monthAvg = sum / trendData[trendYear].monthlyCount[idx];
          if (monthAvg > maxMonthTemp) {
            maxMonthTemp = monthAvg;
            maxMonthIdx = idx;
          }
        }
      });
      return [trendYear, avg, maxMonthIdx];
    });
    const greenAreaTrend = metric === "vegetation"
      ? Object.entries(summaryData.reduce((acc: any, row: any) => {
          const greenAreaRai = typeof row.green_area_rai === "number" ? row.green_area_rai : null;
          if (greenAreaRai === null || row.year === null || row.year === undefined) return acc;
          acc[row.year] = (acc[row.year] || 0) + greenAreaRai;
          return acc;
        }, {}))
          .sort(([yearA], [yearB]) => Number(yearA) - Number(yearB))
          .map(([trendYear, totalRai]) => [trendYear, Math.round(Number(totalRai))])
      : [];

    const yearlyAverageMap = new Map<number, number>(yearlyTrend.map(([trendYear, avg]) => [Number(trendYear), Number(avg)]));
    const baselineTrendAvg = compareYear ? yearlyAverageMap.get(compareYear) : null;
    const yearlyDeltaTrend = compareYear && baselineTrendAvg !== null && baselineTrendAvg !== undefined
      ? yearlyTrend.map(([trendYear, avg, maxMonthIdx]) => [
          trendYear,
          parseFloat((Number(avg) - baselineTrendAvg).toFixed(metric === "vegetation" ? 3 : 2)),
          maxMonthIdx,
        ])
      : [];

    const currentYearData = summaryData.filter((row: any) => row.year === year);
    let ranking: any[] = [];
    let currentAvg = 0;
    let maxCurrentValue = -Infinity;
    let baselineAvg = 0;
    let maxIncreaseDelta = 0;
    let minIncreaseDelta = 0;

    if (currentYearData.length > 0) {
      currentAvg = currentYearData.reduce((sum: number, row: any) => sum + (valueFor(row, metric) || 0), 0) / currentYearData.length;
      maxCurrentValue = currentYearData.reduce((max: number, row: any) => Math.max(max, valueFor(row, metric) ?? -Infinity), -Infinity);

      if (compareYear) {
        const compYearData = summaryData.filter((row: any) => row.year === compareYear);
        baselineAvg = compYearData.length > 0
          ? compYearData.reduce((sum: number, row: any) => sum + (valueFor(row, metric) || 0), 0) / compYearData.length
          : 0;
        const compMap = new Map(compYearData.map((row: any) => [row.district_id, valueFor(row, metric)]));
        ranking = currentYearData
          .map((row: any) => {
            const baseline = compMap.get(row.district_id);
            const current = valueFor(row, metric);
            return { name: row.district_name, delta: baseline !== null && baseline !== undefined && current !== null ? current - Number(baseline) : 0 };
          })
          .sort((a: any, b: any) => b.delta - a.delta)
          .map((row: any) => [row.name, row.delta]);
        if (ranking.length > 0) {
          maxIncreaseDelta = Math.max(...ranking.map(([, deltaValue]) => deltaValue));
          minIncreaseDelta = Math.min(...ranking.map(([, deltaValue]) => deltaValue));
        }
      } else {
        ranking = currentYearData
          .sort((a: any, b: any) => (valueFor(b, metric) ?? -Infinity) - (valueFor(a, metric) ?? -Infinity))
          .map((row: any) => [row.district_name, valueFor(row, metric)]);
      }
    }

    const monthlyData = new Array(12).fill(0);
    const monthlyCounts = new Array(12).fill(0);
    currentYearData.forEach((row: any) => {
      if (metric === "lst" && row.monthly_lst) {
        row.monthly_lst.forEach((temp: number, monthIdx: number) => {
          monthlyData[monthIdx] += temp;
          monthlyCounts[monthIdx] += 1;
        });
      }
    });
    const monthlyTrend = monthlyData.map((sum, idx) =>
      monthlyCounts[idx] > 0 ? parseFloat((sum / monthlyCounts[idx]).toFixed(2)) : 0,
    );

    let baselineMonthlyTrend: number[] = [];
    const monthlyDeltaTrend = compareYear ? (() => {
      const baselineMonthlyData = new Array(12).fill(0);
      const baselineMonthlyCounts = new Array(12).fill(0);
      summaryData
        .filter((row: any) => row.year === compareYear)
        .forEach((row: any) => {
          if (row.monthly_lst) {
            row.monthly_lst.forEach((temp: number, monthIdx: number) => {
              baselineMonthlyData[monthIdx] += temp;
              baselineMonthlyCounts[monthIdx] += 1;
            });
          }
        });

      baselineMonthlyTrend = baselineMonthlyData.map((sum, idx) =>
        baselineMonthlyCounts[idx] > 0 ? parseFloat((sum / baselineMonthlyCounts[idx]).toFixed(2)) : 0,
      );

      return monthlyTrend.map((temp, idx) => {
        if (monthlyCounts[idx] === 0 || baselineMonthlyCounts[idx] === 0) return 0;
        return parseFloat((temp - baselineMonthlyTrend[idx]).toFixed(2));
      });
    })() : [];

    const ndviSummary = metric === "vegetation"
      ? getBangkokNdviSummaryFromRows(currentYearData as DistrictStatistic[], year)
      : null;
    const lowestNdviRanking = metric === "vegetation"
      ? [...currentYearData]
          .sort((a: any, b: any) => (valueFor(a, metric) ?? 1) - (valueFor(b, metric) ?? 1))
          .slice(0, 10)
          .map((row: any) => ({
            district_id: row.district_id,
            district_name: row.district_name,
            ndvi_mean: valueFor(row, metric),
            ndvi_score: row.ndvi_score ?? normalizeNdviScore(valueFor(row, metric)),
            green_area_ratio: row.green_area_ratio ?? null,
            green_area_rai: row.green_area_rai ?? null,
            priority_score: calculatePriorityScore(row),
            reasons: getPriorityReasons(row),
          }))
      : [];
    const priorityRanking = metric === "vegetation"
      ? [...currentYearData]
          .sort((a: any, b: any) => calculatePriorityScore(b) - calculatePriorityScore(a))
          .slice(0, 10)
          .map((row: any) => ({
            district_id: row.district_id,
            district_name: row.district_name,
            priority_score: calculatePriorityScore(row),
            ndvi_mean: valueFor(row, metric),
            green_area_ratio: row.green_area_ratio ?? null,
            low_green_ratio: row.low_green_ratio ?? null,
            ntl_mean: row.ntl_mean ?? null,
            reasons: getPriorityReasons(row),
          }))
      : [];

    return NextResponse.json({
      geojson: { type: "FeatureCollection", features },
      invertedMask,
      summary: {
        metric,
        selectedYear: year,
        compareYear,
        averageTemp: parseFloat(currentAvg.toFixed(metric === "vegetation" ? 3 : 2)),
        baselineAverageTemp: baselineAvg ? parseFloat(baselineAvg.toFixed(metric === "vegetation" ? 3 : 2)) : null,
        avgDelta: compareYear && baselineAvg ? parseFloat((currentAvg - baselineAvg).toFixed(metric === "vegetation" ? 3 : 2)) : 0,
        maxTemp: maxCurrentValue > -Infinity ? parseFloat(maxCurrentValue.toFixed(metric === "vegetation" ? 3 : 2)) : null,
        yearlyTrend,
        greenAreaTrend,
        yearlyDeltaTrend,
        monthlyTrend,
        baselineMonthlyTrend,
        monthlyDeltaTrend,
        ranking,
        min_lst: minValue !== Infinity ? minValue : metric === "vegetation" ? 0 : 30,
        max_lst: maxValue !== -Infinity ? maxValue : metric === "vegetation" ? 0.8 : 40,
        min_delta: minDelta !== Infinity ? minDelta : metric === "vegetation" ? -0.2 : -2,
        max_delta: maxDelta !== -Infinity ? maxDelta : metric === "vegetation" ? 0.2 : 2,
        maxIncreaseDelta: parseFloat(maxIncreaseDelta.toFixed(metric === "vegetation" ? 3 : 2)),
        minIncreaseDelta: parseFloat(minIncreaseDelta.toFixed(metric === "vegetation" ? 3 : 2)),
        ndviSummary,
        lowestNdviRanking,
        priorityRanking,
        dataSource: useDbYear ? "supabase district_statistics" : "local fallback (mock)",
      },
    }, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
      },
    });
  } catch (error: any) {
    console.error("LST API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
