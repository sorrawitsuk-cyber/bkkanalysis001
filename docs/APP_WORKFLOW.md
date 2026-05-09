# Bangkok Analytics App Workflow

เอกสารนี้สรุป workflow ปัจจุบันของแอพหลังจัดชื่อให้ตรงกับหน้าที่จริงของแต่ละส่วน

## Runtime Dashboard Flow

```mermaid
flowchart TD
  Home["/"] --> Traffy["/traffy"]
  Home --> Heat["/heat-island"]
  Home --> Green["/green-space"]
  Home --> BuiltUp["/urban-expansion"]
  Home --> Flood["/flood-risk"]
  Home --> Night["/nighttime-lights"]

  Traffy --> TraffyApi["/api/traffy"]
  TraffyApi --> BigQuery["BigQuery: traffy_complaints"]

  Heat --> DistrictMetrics["/api/district-metrics?metric=lst"]
  Green --> DistrictMetricsVegetation["/api/district-metrics?metric=vegetation"]
  BuiltUp --> DistrictMetricsBuiltUp["/api/district-metrics?metric=builtup"]
  DistrictMetrics --> SupabaseStats["Supabase: district_statistics"]
  DistrictMetricsVegetation --> SupabaseStats
  DistrictMetricsBuiltUp --> SupabaseStats
  DistrictMetrics --> LocalFallback["src/data/lst_data.json fallback"]

  Heat --> GeeTiles["/api/gee/tiles + /api/gee/point"]
  Green --> GeeTiles
  BuiltUp --> GeeTiles
  Night --> GeeTiles
  GeeTiles --> GEE["Google Earth Engine live tiles/pixels"]

  Flood --> FloodApi["/api/flood-risk"]
  FloodApi --> GEE
  FloodApi --> SupabaseStats

  Night --> CacheProxy["/api/satellite-cache/*"]
  CacheProxy --> R2["Cloudflare R2 cache"]
  Night --> NightApi["/api/nighttime-lights fallback"]
  NightApi --> GEE
```

## Naming Rules

| Concern | Current name to use | Legacy / specific name | Notes |
| --- | --- | --- | --- |
| District metric API | `/api/district-metrics` | `/api/lst` | `/api/lst` remains as a compatibility alias. New code should call `/api/district-metrics`. |
| Shared satellite map component | `DistrictMetricsMapView` | `LSTMapView` | The map renders heat, green space, built-up, and nightlights views. |
| LST-specific sidebar | `LSTSidebar` | - | Keep this name because it is only for `/heat-island`. |
| District statistics table | `district_statistics` | - | Shared table for LST, NDVI, NDBI, water, and nightlights metrics. |

## Module Responsibilities

### `/traffy`

Interactive complaint dashboard. It reads from BigQuery through `/api/traffy`, then renders point or heatmap layers in `MapView`.

### `/heat-island`

LST dashboard. It reads district summaries through `/api/district-metrics` and renders live GEE raster/pixel inspection through `DistrictMetricsMapView`.

### `/green-space`

NDVI and green-space dashboard. It uses `/api/district-metrics?metric=vegetation`, then derives KPIs such as green area ratio, green area rai, and low-green priority ranking.

### `/urban-expansion`

Built-up/NDBI dashboard. It uses `/api/district-metrics?metric=builtup` and shares the same map workflow as heat and green-space analysis.

### `/flood-risk`

Water and flood-risk dashboard. It has a dedicated `/api/flood-risk` because it can compute live Sentinel-2 NDWI/MNDWI district stats and combine them with cache data.

### `/nighttime-lights`

VIIRS dashboard. It prefers Cloudflare R2 cache metadata through `/api/satellite-cache/*`; if cache stats are missing it falls back to `/api/nighttime-lights`.

## Data Preparation Flow

```mermaid
flowchart LR
  TraffySource["Traffy source API"] --> TraffyJob["GitHub Action: traffy-daily-update"]
  TraffyJob --> BigQuery["BigQuery"]

  GEE["Google Earth Engine"] --> MonthlyJob["process-satellite-monthly"]
  GEE --> YearlyJob["process-satellite-yearly"]
  GEE --> NightJob["process-nightlights"]
  MonthlyJob --> R2["Cloudflare R2 satellite-cache"]
  YearlyJob --> R2
  NightJob --> R2

  GEE --> SupabaseJobs["ingest/seed/patch scripts"]
  SupabaseJobs --> Supabase["Supabase district_statistics"]
```

## Colab Status

`colab/bkk_gee_pipeline.ipynb` is a manual GEE to Supabase notebook. It is not called by the Next.js app or GitHub Actions. Current automated workflows use scripts under `scripts/` and `.github/workflows/`.
