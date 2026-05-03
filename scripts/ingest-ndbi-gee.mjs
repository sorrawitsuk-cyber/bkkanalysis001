/**
 * Ingest real Normalized Difference Built-up Index (NDBI) statistics from Google Earth Engine (Sentinel-2)
 * into Supabase district_statistics table.
 *
 * Prerequisites:
 *   1. Run the migration: supabase/migrations/004_add_ndbi_columns.sql
 *   2. Ensure .env.local has: GEE_CLIENT_EMAIL, GEE_PRIVATE_KEY, GEE_PROJECT_ID,
 *      NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Usage:
 *   node scripts/ingest-ndbi-gee.mjs
 *   node scripts/ingest-ndbi-gee.mjs --year 2024          # single year
 *   node scripts/ingest-ndbi-gee.mjs --year 2018 --dry-run
 */

import { readFileSync, existsSync } from 'fs';
import { resolve, dirname } from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import ee from '@google/earthengine';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = resolve(__dirname, '..');

// ── env ──────────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = resolve(ROOT, '.env.local');
  if (!existsSync(envPath)) { console.error('.env.local not found'); process.exit(1); }
  const env = {};
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
  return env;
}

// ── args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argYear = args.includes('--year') ? parseInt(args[args.indexOf('--year') + 1], 10) : null;
const DRY_RUN = args.includes('--dry-run');

const YEARS = argYear ? [argYear] : [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

// ── GEE init ─────────────────────────────────────────────────────────────────
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

// ── Sentinel-2 NDBI helpers ───────────────────────────────────────────────────────
const maskSentinel2 = (image) => {
  const scl = image.select('SCL');
  const clearMask = scl
    .neq(0)
    .and(scl.neq(1))
    .and(scl.neq(3))
    .and(scl.neq(8))
    .and(scl.neq(9))
    .and(scl.neq(10))
    .and(scl.neq(11));
  return image.updateMask(clearMask);
};

function getSentinelCollection(year, startDate, endDate) {
  return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
    .map(maskSentinel2);
}

function toNDBI(collection) {
  return collection
    .map(image => {
      // Sentinel-2 NDBI = (SWIR1 - NIR) / (SWIR1 + NIR) = (B11 - B8) / (B11 + B8)
      const swir = image.select('B11').divide(10000);
      const nir = image.select('B8').divide(10000);
      return swir.subtract(nir).divide(swir.add(nir)).rename('NDBI');
    })
    .median();
}

// ── per-district stats via reduceRegions ──────────────────────────────────────
function computeDistrictStats(ndbiImage, districtFeatures, scale = 10) {
  const stats = ndbiImage.reduceRegions({
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

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const env = loadEnv();
  const { GEE_CLIENT_EMAIL, GEE_PRIVATE_KEY, GEE_PROJECT_ID,
          NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY, SUPABASE_SERVICE_ROLE_KEY } = env;

  if (!GEE_CLIENT_EMAIL || !GEE_PRIVATE_KEY) {
    console.error('Missing GEE credentials in .env.local'); process.exit(1);
  }
  console.log('Key length:', GEE_PRIVATE_KEY.length);
  console.log('Key start:', GEE_PRIVATE_KEY.substring(0, 30));
  if (!NEXT_PUBLIC_SUPABASE_URL || (!NEXT_PUBLIC_SUPABASE_ANON_KEY && !SUPABASE_SERVICE_ROLE_KEY)) {
    console.error('Missing Supabase credentials in .env.local'); process.exit(1);
  }

  await initGEE(GEE_CLIENT_EMAIL, GEE_PRIVATE_KEY.replace(/\\n/g, '\n'), GEE_PROJECT_ID);
  const supabaseKey = SUPABASE_SERVICE_ROLE_KEY || NEXT_PUBLIC_SUPABASE_ANON_KEY;
  const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, supabaseKey);

  // Load district GeoJSON
  const geojsonPath = resolve(ROOT, 'src', 'data', 'bkk_districts.json');
  const geojsonData = JSON.parse(readFileSync(geojsonPath, 'utf-8'));
  const districtFeatures = ee.FeatureCollection(geojsonData);
  const bkkBoundary = districtFeatures.geometry();

  // Fetch actual district IDs from Supabase to prevent FK constraint errors
  const { data: dbDistricts, error: dbErr } = await supabase.from('districts').select('id, name_th');
  if (dbErr || !dbDistricts) {
    console.error('❌ Failed to fetch districts from Supabase:', dbErr);
    process.exit(1);
  }
  const dbIdByName = {};
  for (const d of dbDistricts) dbIdByName[d.name_th] = d.id;

  for (const year of YEARS) {
    console.log(`\n📅 Processing year ${year}…`);
    const startDate = `${year}-01-01`;
    const endDate   = `${year}-12-31`;

    const annualCol = getSentinelCollection(year, startDate, endDate).filterBounds(bkkBoundary);
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

    const annualNDBI = toNDBI(annualCol).clip(bkkBoundary);
    console.log('   Computing annual mean+max NDBI per district…');
    const annualResult = await computeDistrictStats(annualNDBI, districtFeatures);

    const records = [];
    for (const f of annualResult.features) {
      const name_th = f.properties.name_th;
      const district_id = dbIdByName[name_th];
      if (!district_id) continue;

      records.push({
        district_id,
        year,
        ndbi_mean: typeof f.properties.mean === 'number' ? parseFloat(f.properties.mean.toFixed(4)) : null,
        ndbi_max:  typeof f.properties.max  === 'number' ? parseFloat(f.properties.max.toFixed(4))  : null,
        ndbi_data_source: `Sentinel-2 SR Harmonized median ${startDate}/${endDate}`,
      });
    }

    if (DRY_RUN) {
      console.log(`   [DRY RUN] Would upsert ${records.length} records for ${year}.`);
      console.log('   Sample:', JSON.stringify(records[0], null, 2));
      continue;
    }

    const { data: existing } = await supabase.from('district_statistics').select('id, district_id').eq('year', year);
    const idMap = {};
    if (existing) {
      existing.forEach(e => idMap[e.district_id] = e.id);
    }
    
    for (const rec of records) {
      if (idMap[rec.district_id]) {
        rec.id = idMap[rec.district_id];
      }
    }

    const { error } = await supabase
      .from('district_statistics')
      .upsert(records);

    if (error) {
      console.error(`   ❌ Supabase upsert failed for ${year}:`, error.message);
    } else {
      console.log(`   ✅ Upserted ${records.length} records for ${year}.`);
    }
  }

  console.log('\n🎉 NDBI ingestion complete.');
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
