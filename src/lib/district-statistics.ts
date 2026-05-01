import { supabase } from "@/lib/supabase/client";
import type { BangkokNdviSummary, DistrictStatistic } from "@/types/district";
import { calculatePriorityScore, normalizeNdviScore, resolveNdviMean } from "@/lib/ndvi";

export async function getLatestDistrictStatistics(): Promise<DistrictStatistic[]> {
  const { data: years } = await supabase
    .from("district_statistics")
    .select("year")
    .order("year", { ascending: false })
    .limit(1);

  const latestYear = years?.[0]?.year;
  if (!latestYear) return [];
  return getDistrictStatisticsByYear(latestYear);
}

export async function getDistrictStatisticsByYear(year: number): Promise<DistrictStatistic[]> {
  const { data, error } = await supabase
    .from("district_statistics")
    .select("*")
    .eq("year", year)
    .order("district_id", { ascending: true });

  if (error) {
    console.warn("Failed to fetch district statistics", error.message);
    return [];
  }
  return (data || []) as DistrictStatistic[];
}

export async function getDistrictTrend(districtId: number): Promise<DistrictStatistic[]> {
  const { data, error } = await supabase
    .from("district_statistics")
    .select("*")
    .eq("district_id", districtId)
    .order("year", { ascending: true });

  if (error) {
    console.warn("Failed to fetch district trend", error.message);
    return [];
  }
  return (data || []) as DistrictStatistic[];
}

export function getBangkokNdviSummaryFromRows(rows: DistrictStatistic[], year: number): BangkokNdviSummary {
  const withNdvi = rows
    .map((row) => ({ ...row, resolved_ndvi: resolveNdviMean(row) }))
    .filter((row) => row.resolved_ndvi !== null);

  const avgNdvi = withNdvi.length
    ? withNdvi.reduce((sum, row) => sum + (row.resolved_ndvi || 0), 0) / withNdvi.length
    : null;
  const avgScore = withNdvi.length
    ? withNdvi.reduce((sum, row) => sum + (row.ndvi_score ?? normalizeNdviScore(row.resolved_ndvi) ?? 0), 0) / withNdvi.length
    : null;
  const greenRows = rows.filter((row) => typeof row.green_area_rai === "number");
  const ratioRows = rows.filter((row) => typeof row.green_area_ratio === "number");

  const ranked = [...rows].sort((a, b) => (resolveNdviMean(b) ?? -1) - (resolveNdviMean(a) ?? -1));
  const priorityRanked = [...rows].sort((a, b) => calculatePriorityScore(b) - calculatePriorityScore(a));
  const declining = rows.filter((row) => typeof (row as DistrictStatistic & { ndvi_delta?: number }).ndvi_delta === "number")
    .sort((a, b) => ((a as DistrictStatistic & { ndvi_delta?: number }).ndvi_delta || 0) - ((b as DistrictStatistic & { ndvi_delta?: number }).ndvi_delta || 0));

  return {
    year,
    avg_ndvi_mean: avgNdvi === null ? null : Math.round(avgNdvi * 1000) / 1000,
    avg_ndvi_score: avgScore === null ? null : Math.round(avgScore * 100) / 100,
    total_green_area_rai: greenRows.length ? greenRows.reduce((sum, row) => sum + (row.green_area_rai || 0), 0) : null,
    avg_green_area_ratio: ratioRows.length ? ratioRows.reduce((sum, row) => sum + (row.green_area_ratio || 0), 0) / ratioRows.length : null,
    best_district: ranked[0] || null,
    worst_district: priorityRanked[0] || ranked[ranked.length - 1] || null,
    most_declining_district: declining[0] || null,
  };
}

export async function getBangkokNdviSummary(year: number): Promise<BangkokNdviSummary> {
  const rows = await getDistrictStatisticsByYear(year);
  return getBangkokNdviSummaryFromRows(rows, year);
}
