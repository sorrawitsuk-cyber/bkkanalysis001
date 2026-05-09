---
name: Satellite Cache System
description: R2-backed satellite data product cache added to bkkanalysis001 — architecture, env vars, and key file locations
type: project
originSessionId: 7321add4-f1c7-4e86-8465-5e0574aad527
---
Implemented a full Satellite Data Product Cache system (GEE → R2 → frontend).

**Why:** Frontend was calling GEE live on every page load; cache avoids repeated computation and serves static files from R2.

**How to apply:** When discussing satellite data, map layers, or GEE processing in this repo, refer to this architecture.

## Key files added

- `scripts/gee/process-monthly.py` — Python: GEE Sentinel-2 monthly composite → R2
- `scripts/gee/process-yearly.py`  — Python: GEE yearly composite → R2
- `scripts/gee/requirements.txt`   — earthengine-api, boto3, Pillow, python-dateutil
- `scripts/storage/upload-r2.mjs` — Node.js manual R2 upload helper
- `scripts/storage/update-index.mjs` — Node.js: rebuild index.json from R2 listing
- `src/lib/satellite-cache.ts`     — TS types + fetch helpers for frontend
- `src/app/api/satellite-cache/index/route.ts`    — proxy → R2 index.json
- `src/app/api/satellite-cache/metadata/route.ts` — proxy → R2 metadata.json
- `.github/workflows/process-satellite-monthly.yml` — cron 5th/10th of month
- `.github/workflows/process-satellite-yearly.yml`  — cron Jan 15

## Modified files

- `src/components/gee/LSTMapView.tsx` — added `"satellite-cache"` mapMode + `satelliteCachePreviewUrl` prop (L.imageOverlay)
- `src/app/green-space/page.tsx`      — added 3rd mode button "Cache", cache state/effects
- `.env.local.example`                — added R2 + GEE_SERVICE_ACCOUNT_JSON vars
- `package.json`                      — added `@aws-sdk/client-s3` devDependency
- `README.md`                         — added Satellite Cache section

## Environment variables

GEE: `GEE_SERVICE_ACCOUNT_JSON` (full SA JSON string, used by Python scripts)
R2: `R2_ACCOUNT_ID`, `R2_ACCESS_KEY_ID`, `R2_SECRET_ACCESS_KEY`, `R2_BUCKET`, `R2_PUBLIC_BASE_URL`
App: `SATELLITE_CACHE_PREFIX` (default: satellite-cache), `FORCE_REPROCESS`, `ENABLE_GEE_LIVE_FALLBACK`

## R2 path structure

satellite-cache/index.json
satellite-cache/monthly/YYYY-MM/metadata.json + {layer}.tif + {layer}.webp
satellite-cache/yearly/YYYY/metadata.json + {layer}.tif + {layer}.webp

Layers: ndvi_mean, ndvi_max, ndwi_mean, ndwi_max, mndwi_mean, ndbi_mean
GeoTIFF scale: 100m/px | Preview: 512px WebP | Bangkok bbox: [[13.494,100.329],[13.956,100.935]]
