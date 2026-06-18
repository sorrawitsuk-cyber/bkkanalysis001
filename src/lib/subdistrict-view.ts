/**
 * Utility for building subdistrict-level GeoJSON views by inheriting stats
 * from parent district features.  Works for all analysis types (LST, NDVI,
 * NDBI, Nighttime Lights, Flood Risk) because it copies all known metric
 * properties from the parent district.
 */

export type Granularity = "district" | "subdistrict";

type FeatureCollection = { type: string; features: any[] };

let subdistrictFeaturesPromise: Promise<any[]> | null = null;

export function loadSubdistrictFeatures(): Promise<any[]> {
  if (!subdistrictFeaturesPromise) {
    subdistrictFeaturesPromise = import("@/data/bkk_subdistricts.json").then(
      (module) => ((module.default as FeatureCollection).features ?? []) as any[],
    );
  }
  return subdistrictFeaturesPromise;
}

/**
 * Given district-level geojsonData, return subdistrict-level GeoJSON where
 * each sub-district feature inherits all metric properties from its parent
 * district (matched by district_id).
 *
 * Falls back gracefully: if a sub-district has no parent match, all metric
 * props are null so the polygon renders as "no data".
 */
export function buildSubdistrictGeoJson(
  districtGeoJson: { type: string; features: any[] } | null | undefined,
  subdistrictFeatures: any[],
): { type: string; features: any[] } {
  const sourceFeatures = subdistrictFeatures ?? [];

  if (!districtGeoJson?.features) {
    return { type: "FeatureCollection", features: sourceFeatures };
  }

  // Map district id → all properties of that district feature
  const byDistrictId = new Map<number, Record<string, unknown>>();
  for (const f of districtGeoJson.features) {
    const id = Number(f.properties?.id);
    if (!Number.isNaN(id)) byDistrictId.set(id, f.properties as Record<string, unknown>);
  }

  const features = sourceFeatures.map((f) => {
    const p = byDistrictId.get(Number(f.properties.district_id)) ?? {};
    return {
      ...f,
      properties: {
        ...f.properties,
        // ── Nighttime Lights ────────────────────────────────────────────────
        ntl_mean:          p.ntl_mean          ?? null,
        ntl_max:           p.ntl_max           ?? null,
        ntl_delta:         p.ntl_delta         ?? null,
        pixel_count:        p.pixel_count        ?? null,
        // ── Land Surface Temperature ─────────────────────────────────────────
        mean_lst:          p.mean_lst          ?? null,
        max_lst:           p.max_lst           ?? null,
        delta:             p.delta             ?? null,
        // ── NDVI / Green Space ────────────────────────────────────────────────
        ndvi_mean:         p.ndvi_mean         ?? null,
        ndvi_max:          p.ndvi_max          ?? null,
        ndvi_score:        p.ndvi_score        ?? null,
        ndvi_class:        p.ndvi_class        ?? null,
        green_area_rai:    p.green_area_rai    ?? null,
        green_area_ratio:  p.green_area_ratio  ?? null,
        vegetation_delta:  p.vegetation_delta  ?? null,
        // ── NDBI / Built-up ───────────────────────────────────────────────────
        ndbi_mean:         p.ndbi_mean         ?? null,
        ndbi_max:          p.ndbi_max          ?? null,
        // ── Flood Risk / Water ────────────────────────────────────────────────
        water_ratio:             p.water_ratio             ?? null,
        water_area_rai:          p.water_area_rai          ?? null,
        district_area_rai:       p.district_area_rai       ?? null,
        water_delta:             p.water_delta             ?? null,
        compare_water_ratio:     p.compare_water_ratio     ?? null,
        ndwi_mean:               p.ndwi_mean               ?? null,
        ndwi_max:                p.ndwi_max                ?? null,
        mndwi_mean:              p.mndwi_mean              ?? null,
        display_value:           p.display_value           ?? null,
        display_area_rai:        p.display_area_rai        ?? null,
        display_layer:           p.display_layer           ?? null,
        display_label:           p.display_label           ?? null,
        flood_risk_score:        p.flood_risk_score        ?? null,
        traffy_count:            p.traffy_count            ?? null,
        // ── Air Quality (Sentinel-5P) ─────────────────────────────────────────
        no2_mean:            p.no2_mean            ?? null,
        no2_delta:           p.no2_delta           ?? null,
        co_mean:             p.co_mean             ?? null,
        co_delta:            p.co_delta            ?? null,
        so2_mean:            p.so2_mean            ?? null,
        so2_delta:           p.so2_delta           ?? null,
        aerosol_index_mean:  p.aerosol_index_mean  ?? null,
        aerosol_index_delta: p.aerosol_index_delta ?? null,
        pollution_score:     p.pollution_score     ?? null,
        pollution_score_delta: p.pollution_score_delta ?? null,
        // ── Computed flood-proxy (augmented in flood-risk page) ──────────────
        traffy_total:            p.traffy_total            ?? null,
        traffy_recent:           p.traffy_recent           ?? null,
        traffy_unresolved:       p.traffy_unresolved       ?? null,
        traffy_reports_per_sqkm: p.traffy_reports_per_sqkm ?? null,
        traffy_recent_per_sqkm:  p.traffy_recent_per_sqkm  ?? null,
        traffy_unresolved_ratio: p.traffy_unresolved_ratio ?? null,
        traffy_score:            p.traffy_score            ?? null,
        water_observation_score: p.water_observation_score ?? null,
        combined_flood_proxy:    p.combined_flood_proxy    ?? null,
        flood_proxy_confidence:  p.flood_proxy_confidence  ?? null,
      },
    };
  });

  return { type: "FeatureCollection", features };
}
