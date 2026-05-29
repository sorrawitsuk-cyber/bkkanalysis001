/* eslint-disable @typescript-eslint/no-explicit-any */
/**
 * GET /api/district/[id]/report
 *
 * Returns a complete, self-contained analytics payload for one Bangkok district:
 *   - All yearly metrics (9 years × all modules)
 *   - BKK-wide averages per year (from materialized view, NOT a full-table scan)
 *   - Composite urban-health score per year
 *   - District-level ranking per metric for the latest year
 *   - GeoJSON feature for the district (for embedded map rendering)
 *   - Export-ready metadata (source, vintage, generated_at)
 *
 * DB: 3 round-trips total:
 *   1. get_district_profile RPC  → district rows + BKK averages
 *   2. get_district_ranking RPC  × N metrics (batched in Promise.all)
 *   3. (none — GeoJSON comes from static import, no DB needed)
 *
 * Previous pattern: 2 full-table queries (450 rows each) → ~900 rows transferred.
 * New pattern: RPC returns ≤18 rows total (9 district + 9 BKK avg).
 */
import { NextResponse } from "next/server";
import { supabaseServer as supabase } from "@/lib/supabase/server";
import geojson from "@/data/bkk_districts.json";
import * as turf from "@turf/turf";

const districtAreaRaiMap = new Map<number, number>(
  (geojson.features as any[]).map((f: any) => [
    f.properties.id,
    Math.round(turf.area(f) / 1600),
  ])
);

const featureById = new Map<number, any>(
  (geojson.features as any[]).map((f: any) => [f.properties.id as number, f])
);

const LATEST_YEAR = new Date().getFullYear();
const RANKING_METRICS = ["vegetation", "lst", "builtup", "no2", "co", "so2", "nightlights", "green_area"] as const;
type RankingMetric = typeof RANKING_METRICS[number];

function computeCompositeScore(m: any): number | null {
  const ndviScore  = m.ndvi_mean   != null ? Math.min(100, (m.ndvi_mean / 0.5) * 100) : null;
  const lstScore   = m.mean_lst    != null ? Math.max(0, 100 - ((m.mean_lst - 28) / 20) * 100) : null;
  const airScore   = m.no2_mean    != null ? Math.max(0, 100 - (m.no2_mean / 0.0003) * 100) : null;
  const ntlScore   = m.ntl_mean    != null ? Math.max(0, 100 - Math.abs(m.ntl_mean - 30) / 30 * 50) : null;
  const greenScore = m.green_area_ratio != null ? Math.min(100, m.green_area_ratio * 400) : null;
  const pairs: [number | null, number][] = [
    [ndviScore, 0.30], [lstScore, 0.25], [airScore, 0.20], [ntlScore, 0.15], [greenScore, 0.10],
  ];
  const totalW = pairs.filter(([v]) => v != null).reduce((s, [, w]) => s + w, 0);
  if (totalW < 0.3) return null;
  return Math.round(
    pairs.filter(([v]) => v != null).reduce((s, [v, w]) => s + (v as number) * w, 0) / totalW * 10
  ) / 10;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const { id } = await params;
  const districtId = parseInt(id, 10);
  if (isNaN(districtId) || districtId < 1) {
    return NextResponse.json({ error: "district id ไม่ถูกต้อง" }, { status: 400 });
  }

  const feature = featureById.get(districtId);
  if (!feature) {
    return NextResponse.json({ error: `ไม่พบเขต id=${districtId}` }, { status: 404 });
  }

  const areaRai = districtAreaRaiMap.get(districtId) ?? 0;
  const districtNameTh: string = feature.properties.name_th;
  const districtNameEn: string = feature.properties.name_en ?? "";

  try {
    // ── 1. Profile RPC: district rows + BKK averages (≤18 rows, 1 round-trip) ──
    const profileRpc = supabase.rpc("get_district_profile", { p_district_id: districtId });

    // ── 2. Rankings for latest year — one RPC call per metric, all in parallel ──
    const rankingRpcs = RANKING_METRICS.map((metric) =>
      supabase
        .rpc("get_district_ranking", { p_year: LATEST_YEAR, p_metric: metric })
        .then(({ data, error }) => ({
          metric,
          rows: error ? [] : (data ?? []) as any[],
        }))
    );

    const [profileResult, ...rankingResults] = await Promise.all([profileRpc, ...rankingRpcs]);

    if (profileResult.error) throw new Error(profileResult.error.message);

    const profileRows: any[] = profileResult.data ?? [];
    const districtRows = profileRows.filter((r) => r.row_type === "district");
    const bkkAvgRows   = profileRows.filter((r) => r.row_type === "bkk_avg");

    // ── Build per-year metrics ────────────────────────────────────────────────
    const metrics: Record<number, any> = {};
    for (const row of districtRows) {
      const ndbi = typeof row.ndbi_mean === "number" ? row.ndbi_mean : null;
      const builtup_area_rai =
        ndbi !== null && areaRai > 0
          ? Math.round(Math.max(0, Math.min(1, (ndbi + 0.2) / 0.6)) * areaRai)
          : null;
      const waterAreaRai =
        row.water_area_rai != null ? Math.round(row.water_area_rai)
        : row.water_ratio  != null && areaRai > 0 ? Math.round(row.water_ratio * areaRai)
        : null;
      metrics[row.year] = {
        mean_lst:           row.mean_lst           ?? null,
        max_lst:            row.max_lst            ?? null,
        ndvi_mean:          row.ndvi_mean          ?? null,
        ndvi_score:         row.ndvi_score         ?? null,
        green_area_rai:     row.green_area_rai     != null ? Math.round(row.green_area_rai) : null,
        green_area_ratio:   row.green_area_ratio   ?? null,
        low_green_ratio:    row.low_green_ratio    ?? null,
        ndbi_mean:          row.ndbi_mean          ?? null,
        ndbi_max:           row.ndbi_max           ?? null,
        builtup_area_rai,
        no2_mean:           row.no2_mean           ?? null,
        no2_max:            row.no2_max            ?? null,
        co_mean:            row.co_mean            ?? null,
        co_max:             row.co_max             ?? null,
        so2_mean:           row.so2_mean           ?? null,
        so2_max:            row.so2_max            ?? null,
        aerosol_index_mean: row.aerosol_index_mean ?? null,
        aerosol_index_max:  row.aerosol_index_max  ?? null,
        pollution_score:    row.pollution_score    ?? null,
        water_ratio:        row.water_ratio        ?? null,
        water_area_rai:     waterAreaRai,
        ndwi_mean:          row.ndwi_mean          ?? null,
        ntl_mean:           row.ntl_mean           ?? null,
        ntl_max:            row.ntl_max            ?? null,
      };
    }

    // ── BKK averages ─────────────────────────────────────────────────────────
    const bkkAverages: Record<number, any> = {};
    for (const row of bkkAvgRows) {
      const ndbi = typeof row.ndbi_mean === "number" ? row.ndbi_mean : null;
      bkkAverages[row.year] = {
        mean_lst:           row.mean_lst           ?? null,
        max_lst:            row.max_lst            ?? null,
        ndvi_mean:          row.ndvi_mean          ?? null,
        ndvi_score:         row.ndvi_score         ?? null,
        green_area_rai:     row.green_area_rai     != null ? Math.round(row.green_area_rai) : null,
        green_area_ratio:   row.green_area_ratio   ?? null,
        ndbi_mean:          row.ndbi_mean          ?? null,
        builtup_area_rai:
          ndbi !== null && areaRai > 0
            ? Math.round(Math.max(0, Math.min(1, (ndbi + 0.2) / 0.6)) * areaRai)
            : null,
        no2_mean:           row.no2_mean           ?? null,
        co_mean:            row.co_mean            ?? null,
        so2_mean:           row.so2_mean           ?? null,
        pollution_score:    row.pollution_score    ?? null,
        water_ratio:        row.water_ratio        ?? null,
        ndwi_mean:          row.ndwi_mean          ?? null,
        ntl_mean:           row.ntl_mean           ?? null,
        ntl_max:            row.ntl_max            ?? null,
      };
    }

    // ── Composite scores ──────────────────────────────────────────────────────
    const years = Object.keys(metrics).map(Number).sort();
    const compositeScores: Record<number, number | null> = {};
    for (const yr of years) {
      compositeScores[yr] = metrics[yr] ? computeCompositeScore(metrics[yr]) : null;
    }

    // ── Rankings for latest year ──────────────────────────────────────────────
    const rankings: Record<string, { rank_desc: number; rank_asc: number; metric_value: number | null; total: number }> = {};
    for (const { metric, rows } of rankingResults) {
      const entry = rows.find((r: any) => r.district_id === districtId);
      rankings[metric] = {
        rank_desc:    entry?.rank_desc    ?? null,
        rank_asc:     entry?.rank_asc     ?? null,
        metric_value: entry?.metric_value ?? null,
        total:        rows.length,
      };
    }

    // ── GeoJSON feature (geometry stripped for compact payload) ───────────────
    const { geometry: _geom, ...featureWithoutGeom } = feature;

    return NextResponse.json(
      {
        district: {
          id:       districtId,
          name_th:  districtNameTh,
          name_en:  districtNameEn,
          area_rai: areaRai,
        },
        years,
        metrics,
        bkkAverages,
        compositeScores,
        rankings,
        feature: featureWithoutGeom,
        meta: {
          generated_at:  new Date().toISOString(),
          latest_year:   LATEST_YEAR,
          data_source:   "Supabase district_statistics + bkk_yearly_averages MV",
          resolution:    "Sentinel-2 10m (NDVI/NDBI), Landsat 30m (LST), S5P 1000m (air), VIIRS 500m (NTL)",
          db_round_trips: 1 + RANKING_METRICS.length,
        },
      },
      {
        headers: {
          "Cache-Control": "public, s-maxage=3600, stale-while-revalidate=1800",
        },
      }
    );
  } catch (err: any) {
    console.error("district report error:", err);
    return NextResponse.json({ error: err.message }, { status: 500 });
  }
}
