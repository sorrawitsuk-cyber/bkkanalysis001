---
name: Supabase district_statistics fully seeded
description: All satellite metrics seeded to Supabase for all 50 districts × 9 years (2018-2026)
type: project
originSessionId: a0323179-033b-476d-af69-8941709136fc
---
All 450 rows in `district_statistics` are now fully populated via `scripts/seed-gee-stats.mjs`.

**What was seeded:**
- `water_ratio`, `ndwi_mean`, `mndwi_mean` — from Sentinel-2 NDWI via GEE
- `mean_lst`, `max_lst` — from Landsat 8/9 Surface Temperature via GEE
- `ntl_mean`, `ntl_max` — from VIIRS Annual (V21 for 2018-2021, V22 for 2022+)
- `green_area_ratio`, `green_area_rai`, etc. — derived from existing `ndvi_mean`

**Why:** The flood-risk, LST heat island, and nighttime light pages were showing empty sidebars because the DB had no water/LST/NTL data. The `/api/flood-risk` route was also refactored to compute live Sentinel-2 NDWI from GEE when Supabase has no data.

**How to apply:** Supabase data is the primary source now; GEE is the live fallback only for flood-risk and current year. No need to re-run the pipeline unless the DB is wiped.

**Key bugs fixed in the pipeline:**
1. `loadEnv()` must strip surrounding quotes from .env values (regex: `replace(/^(['"])([\s\S]*)\1$/, '$2')`)
2. `initGEE()` uses `googleapis` JWT + `ee.apiclient.setAuthToken()` instead of `authenticateViaPrivateKey()` — the old approach fails on Node.js 22+ with `ERR_OSSL_UNSUPPORTED`
3. Upsert uses row `id` (primary key) not `district_id,year` — no unique constraint on the compound key
4. VIIRS NTL dataset: `ANNUAL_V21` for ≤2021 (band: `average`), `ANNUAL_V22` for ≥2022 (band: `average_masked`)
