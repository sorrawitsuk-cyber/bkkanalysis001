/**
 * Ingest real Normalized Difference Vegetation Index (NDVI) statistics from Google Earth Engine (Sentinel-2)
 * into Supabase district_statistics table.
 *
 * NDVI = (NIR - Red) / (NIR + Red)  =  (B8 - B4) / (B8 + B4)
 * High NDVI (>0.5) = dense vegetation, Low NDVI (<0.2) = built-up/bare
 *
 * Prerequisites:
 *   1. Run the migration: supabase/migrations/006_add_ndvi_columns.sql
 *   2. Ensure .env.local has: GEE_CLIENT_EMAIL, GEE_PRIVATE_KEY, GEE_PROJECT_ID,
 *      NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY (or SUPABASE_SERVICE_ROLE_KEY)
 *
 * Usage:
 *   node scripts/ingest-ndvi-gee.mjs                        # all years 2018-2026
 *   node scripts/ingest-ndvi-gee.mjs --year 2024            # single year
 *   node scripts/ingest-ndvi-gee.mjs --year 2024 --dry-run  # preview without writing
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import ee from '@google/earthengine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── env ───────────────────────────────────────────────────────────────────────
function loadEnv() {
  const env = { ...process.env };
  const envPath = resolve(ROOT, '.env.local');
  if (existsSync(envPath)) {
    for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
      const t = line.trim();
      if (!t || t.startsWith('#')) continue;
      const eq = t.indexOf('=');
      if (eq < 0) continue;
      const key = t.slice(0, eq).trim();
      let val = t.slice(eq + 1).trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      env[key] = val;
    }
  }
  if (env.GEE_SERVICE_ACCOUNT_JSON && (!env.GEE_CLIENT_EMAIL || !env.GEE_PRIVATE_KEY)) {
    try {
      const sa = JSON.parse(env.GEE_SERVICE_ACCOUNT_JSON);
      env.GEE_CLIENT_EMAIL = env.GEE_CLIENT_EMAIL || sa.client_email;
      env.GEE_PRIVATE_KEY  = env.GEE_PRIVATE_KEY  || sa.private_key;
      env.GEE_PROJECT_ID   = env.GEE_PROJECT_ID   || sa.project_id;
    } catch (e) {
      console.error('Failed to parse GEE_SERVICE_ACCOUNT_JSON:', e.message);
    }
  }
  return env;
}

// ── args ──────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argYear = args.includes('--year') ? parseInt(args[args.indexOf('--year') + 1], 10) : null;
const DRY_RUN = args.includes('--dry-run');

const YEARS = argYear ? [argYear] : [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

// ── GEE init ──────────────────────────────────────────────────────────────────
function initGEE(clientEmail, privateKey, projectId) {
  return new Promise((resolve, reject) => {
    ee.data.authenticateViaPrivateKey(
      { client_email: clientEmail, private_key: privateKey },
      () => {
        ee.initialize(null, null, () => {
          console.log('✅ GEE initialized');
          resolve();
        }, reject, null, projectId);
      },
      reject
    );
  });
}

// ── Sentinel-2 cloud masking ──────────────────────────────────────────────────
const maskSentinel2 = (image) => {
  const scl = image.select('SCL');
  // Keep: vegetation(4), bare soil(5), water(6), unclassified(7)
  // Remove: saturated(1), dark(2), shadow(3), cloud medium(8), cloud high(9), cirrus(10), snow(11)
  const clearMask = scl
    .neq(0).and(scl.neq(1)).and(scl.neq(2)).and(scl.neq(3))
    .and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
  return image.updateMask(clearMask);
};

// ── NDVI computation ──────────────────────────────────────────────────────────
function toNDVI(collection) {
  return collection
    .map(image => {
      // Sentinel-2: B8 = NIR (842nm), B4 = Red (665nm)
      const nir = image.select('B8').divide(10000);
      const red = image.select('B4').divide(10000);
      return nir.subtract(red).divide(nir.add(red)).rename('NDVI');
    })
    .median(); // annual median composite (more robust than mean for vegetation)
}

// ── per-district stats ────────────────────────────────────────────────────────
function computeDistrictStats(ndviImage, districtFeatures, scale = 10) {
  const stats = ndviImage.reduceRegions({
    collection: districtFeatures,
    reducer: ee.Reducer.mean().combine(ee.Reducer.max(), '', true),
    scale,
  });
  return new Promise((resolve, reject) => {
    stats.evaluate((result, error) => {
      if (error) reject(new Error(error));
      else resolve(result);
    });
  });
}

// ── main ──────────────────────────────────────────────────────────────────────
async function main() {
  const env = loadEnv();
  const {
    GEE_CLIENT_EMAIL, GEE_PRIVATE_KEY, GEE_PROJECT_ID,
    NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY,
  } = env;

  if (!GEE_CLIENT_EMAIL || !GEE_PRIVATE_KEY) {
    console.error('❌ Missing GEE credentials in .env.local'); process.exit(1);
  }
  if (!NEXT_PUBLIC_SUPABASE_URL || (!NEXT_PUBLIC_SUPABASE_ANON_KEY && !SUPABASE_SERVICE_ROLE_KEY)) {
    console.error('❌ Missing Supabase credentials in .env.local'); process.exit(1);
  }

  console.log('Key length:', GEE_PRIVATE_KEY.length);
  console.log('Key start:', GEE_PRIVATE_KEY.substring(0, 30));

  await initGEE(GEE_CLIENT_EMAIL, GEE_PRIVATE_KEY.replace(/\\n/g, '\n'), GEE_PROJECT_ID);

  const supabaseKey = SUPABASE_SERVICE_ROLE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, supabaseKey);

  // Load Bangkok district GeoJSON
  const geojsonPath = resolve(ROOT, 'src', 'data', 'bkk_districts.json');
  const geojsonData = JSON.parse(readFileSync(geojsonPath, 'utf-8'));
  const districtFeatures = ee.FeatureCollection(geojsonData);
  const bkkBoundary = districtFeatures.geometry();

  // Fetch district IDs from Supabase (FK constraint requires real IDs)
  const { data: dbDistricts, error: dbErr } = await supabase.from('districts').select('id, name_th');
  if (dbErr || !dbDistricts) {
    console.error('❌ Failed to fetch districts from Supabase:', dbErr?.message); process.exit(1);
  }
  const dbIdByName = {};
  for (const d of dbDistricts) dbIdByName[d.name_th] = d.id;

  for (const year of YEARS) {
    console.log(`\n📅 Processing year ${year}…`);
    const startDate = `${year}-01-01`;
    const endDate   = `${year}-12-31`;

    const annualCol = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
      .filterDate(startDate, endDate)
      .filterBounds(bkkBoundary)
      .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
      .map(maskSentinel2);

    const sceneCount = await new Promise((resolve, reject) => {
      annualCol.size().evaluate((result, error) => {
        if (error) reject(new Error(error));
        else resolve(result);
      });
    });
    console.log(`   Scenes after cloud filter: ${sceneCount}`);

    if (sceneCount === 0) {
      console.log(`   ⚠️  No scenes for ${year}, skipping.`);
      continue;
    }

    const annualNDVI = toNDVI(annualCol).clip(bkkBoundary);
    console.log('   Computing annual median NDVI per district…');
    const annualResult = await computeDistrictStats(annualNDVI, districtFeatures);

    const records = [];
    for (const f of annualResult.features) {
      const name_th = f.properties.name_th;
      const district_id = dbIdByName[name_th];
      if (!district_id) {
        console.warn(`   ⚠️  No DB district found for: ${name_th}`);
        continue;
      }
      records.push({
        district_id,
        year,
        ndvi_mean: typeof f.properties.mean === 'number' ? parseFloat(f.properties.mean.toFixed(4)) : null,
        ndvi_max:  typeof f.properties.max  === 'number' ? parseFloat(f.properties.max.toFixed(4))  : null,
        ndvi_data_source: `Sentinel-2 SR Harmonized median ${startDate}/${endDate}`,
      });
    }

    if (DRY_RUN) {
      console.log(`   [DRY RUN] Would upsert ${records.length} records for ${year}.`);
      if (records[0]) console.log('   Sample:', JSON.stringify(records[0], null, 2));
      continue;
    }

    // Look up existing row IDs so upsert can match by PK (id)
    const { data: existing } = await supabase
      .from('district_statistics')
      .select('id, district_id')
      .eq('year', year);
    const idMap = {};
    if (existing) existing.forEach(e => { idMap[e.district_id] = e.id; });
    for (const rec of records) {
      if (idMap[rec.district_id]) rec.id = idMap[rec.district_id];
    }

    const { error } = await supabase.from('district_statistics').upsert(records);
    if (error) {
      console.error(`   ❌ Supabase upsert failed for ${year}:`, error.message);
    } else {
      console.log(`   ✅ Upserted ${records.length} records for ${year}.`);
    }
  }

  console.log('\n🎉 NDVI ingestion complete.');
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
