/**
 * Ingest real Land Surface Temperature (LST) statistics from Google Earth Engine
 * into Supabase district_statistics table.
 *
 * Prerequisites:
 *   1. Run the migration: supabase/migrations/002_add_lst_columns.sql
 *   2. Ensure .env.local has: GEE_CLIENT_EMAIL, GEE_PRIVATE_KEY, GEE_PROJECT_ID,
 *      NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY
 *
 * Usage:
 *   node scripts/ingest-lst-gee.mjs
 *   node scripts/ingest-lst-gee.mjs --year 2024          # single year
 *   node scripts/ingest-lst-gee.mjs --year 2018 --dry-run
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
    env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
  return env;
}

// ── args ─────────────────────────────────────────────────────────────────────
const args = process.argv.slice(2);
const argYear = args.includes('--year') ? parseInt(args[args.indexOf('--year') + 1], 10) : null;
const DRY_RUN = args.includes('--dry-run');

const YEARS = argYear ? [argYear] : [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025];

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

// ── Landsat LST helpers ───────────────────────────────────────────────────────
function getLandsatCollection(year, startDate, endDate) {
  const lc08 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2');
  const base = year >= 2022
    ? lc08.merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'))
    : lc08;
  return base
    .filterDate(startDate, endDate)
    .filter(ee.Filter.lt('CLOUD_COVER', 20));
}

function toLSTCelsius(collection) {
  // ST_B10 scale 0.00341802, offset 149.0 K → subtract 273.15 for °C
  return collection
    .map(img => img.select('ST_B10').multiply(0.00341802).add(149.0).subtract(273.15).rename('LST'))
    .median();
}

// ── per-district stats via reduceRegions ──────────────────────────────────────
function computeDistrictStats(lstImage, districtFeatures, scale = 30) {
  const stats = lstImage.reduceRegions({
    collection: districtFeatures,
    reducer: ee.Reducer.mean().combine(ee.Reducer.max(), '', true),
    scale,
  });
  return stats.getInfo(); // synchronous — blocks until GEE returns
}

// ── monthly mean LST per district ────────────────────────────────────────────
function computeMonthlyMeans(year, districtFeatures, boundary, scale = 30) {
  const monthly = [];
  for (let month = 1; month <= 12; month++) {
    const start = `${year}-${String(month).padStart(2, '0')}-01`;
    const nextMonth = month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
    const col = getLandsatCollection(year, start, nextMonth).filterBounds(boundary);
    const size = col.size().getInfo();
    if (size === 0) {
      console.log(`    month ${month}: no scenes — using null`);
      monthly.push(null);
      continue;
    }
    const lstImg = toLSTCelsius(col).clip(boundary);
    const monthStats = lstImg.reduceRegions({
      collection: districtFeatures,
      reducer: ee.Reducer.mean(),
      scale,
    }).getInfo();
    // Build map id → mean for this month
    const monthMap = {};
    for (const f of monthStats.features) {
      monthMap[f.properties.id] = typeof f.properties.mean === 'number' ? f.properties.mean : null;
    }
    monthly.push(monthMap);
    process.stdout.write(`    month ${month} ✓  `);
  }
  console.log('');
  return monthly; // array of 12 maps  {district_id → mean_lst}
}

// ── main ─────────────────────────────────────────────────────────────────────
async function main() {
  const env = loadEnv();
  const { GEE_CLIENT_EMAIL, GEE_PRIVATE_KEY, GEE_PROJECT_ID,
          NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY } = env;

  if (!GEE_CLIENT_EMAIL || !GEE_PRIVATE_KEY) {
    console.error('Missing GEE credentials in .env.local'); process.exit(1);
  }
  if (!NEXT_PUBLIC_SUPABASE_URL || !NEXT_PUBLIC_SUPABASE_ANON_KEY) {
    console.error('Missing Supabase credentials in .env.local'); process.exit(1);
  }

  await initGEE(GEE_CLIENT_EMAIL, GEE_PRIVATE_KEY.replace(/\\n/g, '\n'), GEE_PROJECT_ID);
  const supabase = createClient(NEXT_PUBLIC_SUPABASE_URL, NEXT_PUBLIC_SUPABASE_ANON_KEY);

  // Load district GeoJSON
  const geojsonPath = resolve(ROOT, 'src', 'data', 'bkk_districts.json');
  const geojsonData = JSON.parse(readFileSync(geojsonPath, 'utf-8'));
  const districtFeatures = ee.FeatureCollection(geojsonData);
  const bkkBoundary = districtFeatures.geometry();

  // Build id → name map for logging
  const nameById = {};
  for (const f of geojsonData.features) nameById[f.properties.id] = f.properties.name_th;

  for (const year of YEARS) {
    console.log(`\n📅 Processing year ${year}…`);
    const startDate = `${year}-01-01`;
    const endDate   = `${year}-12-31`;

    // Annual median LST image
    const annualCol = getLandsatCollection(year, startDate, endDate).filterBounds(bkkBoundary);
    const sceneCount = annualCol.size().getInfo();
    console.log(`   Scenes after cloud filter: ${sceneCount}`);
    if (sceneCount === 0) {
      console.log(`   ⚠️  No scenes for ${year}, skipping.`);
      continue;
    }

    const annualLST = toLSTCelsius(annualCol).clip(bkkBoundary);
    console.log('   Computing annual mean+max per district…');
    const annualResult = computeDistrictStats(annualLST, districtFeatures);

    // Build annual map: district_id → { mean_lst, max_lst }
    const annualMap = {};
    for (const f of annualResult.features) {
      const id = f.properties.id;
      annualMap[id] = {
        mean_lst: typeof f.properties.mean === 'number' ? parseFloat(f.properties.mean.toFixed(2)) : null,
        max_lst:  typeof f.properties.max  === 'number' ? parseFloat(f.properties.max.toFixed(2))  : null,
      };
    }

    // Monthly means per district
    console.log('   Computing monthly means per district (12 months)…');
    const monthlyMaps = computeMonthlyMeans(year, districtFeatures, bkkBoundary);

    // Upsert into Supabase
    const records = [];
    for (const f of geojsonData.features) {
      const id = f.properties.id;
      const annual = annualMap[id] || {};
      // Build monthly_lst array [jan, feb, …, dec] for this district
      const monthly_lst = monthlyMaps.map(mMap => {
        if (!mMap) return null;
        return mMap[id] !== undefined && mMap[id] !== null ? parseFloat(mMap[id].toFixed(2)) : null;
      });

      records.push({
        district_id: id,
        year,
        mean_lst: annual.mean_lst ?? null,
        max_lst:  annual.max_lst  ?? null,
        monthly_lst: monthly_lst.some(v => v !== null) ? monthly_lst : null,
        lst_data_source: `Landsat 8/9 C2L2 median ${startDate}/${endDate}`,
      });
    }

    if (DRY_RUN) {
      console.log(`   [DRY RUN] Would upsert ${records.length} records for ${year}.`);
      console.log('   Sample:', JSON.stringify(records[0], null, 2));
      continue;
    }

    const { error } = await supabase
      .from('district_statistics')
      .upsert(records, { onConflict: 'district_id,year', ignoreDuplicates: false });

    if (error) {
      console.error(`   ❌ Supabase upsert failed for ${year}:`, error.message);
    } else {
      console.log(`   ✅ Upserted ${records.length} records for ${year}.`);
    }
  }

  console.log('\n🎉 LST ingestion complete.');
}

main().catch(err => { console.error('Fatal error:', err); process.exit(1); });
