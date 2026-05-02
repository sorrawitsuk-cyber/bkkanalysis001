// Types and fetch helpers for the satellite data product cache (R2-backed).
// The cache is populated by scripts/gee/process-monthly.py and process-yearly.py.

export interface SatelliteCacheLayer {
  /** Public URL to the GeoTIFF (100 m resolution). Null if export failed. */
  url: string | null;
  /** Public URL to the WebP preview image (512 px). Null if export failed. */
  preview_url: string | null;
  min: number;
  max: number;
}

export type SatelliteCacheStatus = "ok" | "pending" | "insufficient_data" | "error";

export interface SatelliteCacheMetadata {
  period: string;
  type: "monthly" | "yearly";
  source: string;
  date_start: string;
  date_end: string;
  generated_at: string;
  image_count: number;
  cloud_filter: number;
  fallback_used: boolean;
  /** [[south, west], [north, east]] in WGS-84 */
  bounds: [[number, number], [number, number]];
  status: SatelliteCacheStatus;
  layers: Record<string, SatelliteCacheLayer>;
}

export interface SatelliteCacheIndex {
  latest_month: string | null;
  latest_year: string | null;
  monthly: string[];
  yearly: string[];
}

const EMPTY_INDEX: SatelliteCacheIndex = {
  latest_month: null,
  latest_year: null,
  monthly: [],
  yearly: [],
};

/** Fetch the top-level cache index from the Next.js proxy route. */
export async function fetchCacheIndex(): Promise<SatelliteCacheIndex> {
  try {
    const res = await fetch("/api/satellite-cache/index", {
      next: { revalidate: 300 },
    });
    if (!res.ok) return EMPTY_INDEX;
    return (await res.json()) as SatelliteCacheIndex;
  } catch {
    return EMPTY_INDEX;
  }
}

/**
 * Fetch metadata for a specific period.
 * @param type  "monthly" | "yearly"
 * @param period  "YYYY-MM" for monthly, "YYYY" for yearly
 */
export async function fetchCacheMetadata(
  type: "monthly" | "yearly",
  period: string,
): Promise<SatelliteCacheMetadata | null> {
  try {
    const res = await fetch(
      `/api/satellite-cache/metadata?type=${type}&period=${encodeURIComponent(period)}`,
      { next: { revalidate: 300 } },
    );
    if (!res.ok) return null;
    return (await res.json()) as SatelliteCacheMetadata;
  } catch {
    return null;
  }
}

/** Return the preview_url for a specific layer of a metadata object, or null. */
export function getCacheLayerPreviewUrl(
  meta: SatelliteCacheMetadata | null,
  layerKey: string,
): string | null {
  return meta?.layers?.[layerKey]?.preview_url ?? null;
}

/** @deprecated Use getCacheLayerPreviewUrl instead. */
export function getNdviPreviewUrl(meta: SatelliteCacheMetadata | null): string | null {
  return getCacheLayerPreviewUrl(meta, "ndvi_mean");
}

export const CACHE_LAYER_LABELS: Record<string, string> = {
  ndvi_mean:   "NDVI mean",
  ndvi_max:    "NDVI max",
  ndwi_mean:   "NDWI mean",
  ndwi_max:    "NDWI max",
  mndwi_mean:  "MNDWI mean",
  ndbi_mean:   "NDBI mean",
};

/** Format a YYYY-MM period string to a human-readable Thai month label. */
export function formatPeriodThai(period: string): string {
  const thaiMonths = [
    "ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.",
    "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค.",
  ];
  const [year, month] = period.split("-").map(Number);
  if (!year || !month || month < 1 || month > 12) return period;
  return `${thaiMonths[month - 1]} ${year}`;
}
