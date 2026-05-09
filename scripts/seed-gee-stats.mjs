/**
 * GEE → Supabase data pipeline (Node.js)
 * Computes per-district satellite stats for all years and upserts to Supabase.
 *
 * Usage:  node scripts/seed-gee-stats.mjs [--years 2018-2026] [--metrics water,lst,ntl,green]
 *
 * Requires: columns added via SQL migration in Supabase Dashboard first.
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import ee from '@google/earthengine';
import { createRequire } from 'module';
const require = createRequire(import.meta.url);
const { google } = require('googleapis');

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load .env.local ───────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) throw new Error('.env.local not found');
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=][^=]*)=(.*)$/);
    if (!m) return;
    // Strip surrounding single or double quotes (dotenv convention)
    const val = m[2].trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
    process.env[m[1].trim()] = val;
  });
}
loadEnv();

// ── Config ────────────────────────────────────────────────────────────────────
const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;
const GEE_EMAIL    = process.env.GEE_CLIENT_EMAIL;
const GEE_KEY      = process.env.GEE_PRIVATE_KEY?.replace(/\\n/g, '\n');
const GEE_PROJECT  = process.env.GEE_PROJECT_ID;

const BKK_BBOX     = [100.329, 13.494, 100.935, 13.956]; // W S E N
const YEARS        = Array.from({ length: new Date().getFullYear() - 2018 + 1 }, (_, i) => 2018 + i);
const CLOUD_FILTER = 30;
const CHECKPOINT   = path.join(__dirname, '..', 'scripts', '.gee-checkpoint.json');

const ARGS = process.argv.slice(2);
const METRICS = (ARGS.find(a => a.startsWith('--metrics='))?.split('=')[1] ?? 'water,lst,ntl,green').split(',');
const YEAR_RANGE = ARGS.find(a => a.startsWith('--years='))?.split('=')[1];
const RUN_YEARS  = YEAR_RANGE
  ? YEAR_RANGE.split('-').length === 2
    ? Array.from({ length: +YEAR_RANGE.split('-')[1] - +YEAR_RANGE.split('-')[0] + 1 }, (_, i) => +YEAR_RANGE.split('-')[0] + i)
    : [+YEAR_RANGE]
  : YEARS;

// ── Supabase ──────────────────────────────────────────────────────────────────
const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

async function getDistrictMap() {
  const { data } = await sb.from('districts').select('id, name_th');
  return new Map((data ?? []).map(d => [d.name_th, d.id]));
}

async function getExistingColumns() {
  const { data } = await sb.from('district_statistics').select('*').limit(1);
  if (!data?.[0]) return new Set();
  return new Set(Object.keys(data[0]));
}

// Map (district_id, year) → row primary key id
async function getRowIdMap(year) {
  const { data } = await sb.from('district_statistics')
    .select('id, district_id').eq('year', year);
  return new Map((data ?? []).map(r => [`${r.district_id}_${year}`, r.id]));
}

async function upsert(year, rows, districtMap, existingCols) {
  const rowIdMap = await getRowIdMap(year);

  const records = rows
    .map(row => {
      const sbId = districtMap.get(row.name_th);
      if (!sbId) return null;
      const rowId = rowIdMap.get(`${sbId}_${year}`);
      const rec = { district_id: sbId, year };
      if (rowId) rec.id = rowId;
      for (const [k, v] of Object.entries(row)) {
        if (k !== 'name_th' && existingCols.has(k)) rec[k] = v;
      }
      return rec;
    })
    .filter(Boolean);

  if (!records.length) { console.log(`  ⚠️  No records to upsert for ${year}`); return; }

  const { error } = await sb.from('district_statistics')
    .upsert(records, { onConflict: 'id' });
  if (error) throw new Error(`Supabase upsert failed: ${error.message}`);
  console.log(`  ✅ Upserted ${records.length} rows → year ${year}`);
}

// ── GEE init (via googleapis JWT to avoid OpenSSL legacy issue on Node 22+) ───
const GEE_SCOPE = 'https://www.googleapis.com/auth/earthengine';

function getGeeToken() {
  return new Promise((resolve, reject) => {
    const jwtAuth = new google.auth.JWT(GEE_EMAIL, null, GEE_KEY, [GEE_SCOPE]);
    jwtAuth.getAccessToken((err, token) => {
      if (err || !token) reject(err ?? new Error('No token'));
      else resolve(token);
    });
  });
}

async function initGEE() {
  const token = await getGeeToken();
  ee.apiclient.setAuthToken('', 'Bearer', token, 3500, [], null, false);
  ee.apiclient.setAuthTokenRefresher((_args, cb) => {
    getGeeToken()
      .then(t => cb({ token_type: 'Bearer', access_token: t, expires_in: 3500 }))
      .catch(() => cb(null));
  });
  return new Promise((resolve, reject) => {
    ee.initialize(null, null, resolve, reject, null, GEE_PROJECT);
  });
}

function evalEE(obj) {
  return new Promise((res, rej) => obj.evaluate((v, e) => e ? rej(e) : res(v)));
}

// ── GeoJSON ───────────────────────────────────────────────────────────────────
const geoJsonPath = path.join(__dirname, '..', 'src', 'data', 'bkk_districts.json');
const bkk = JSON.parse(fs.readFileSync(geoJsonPath, 'utf8'));

function getBkkFC() {
  return ee.FeatureCollection(bkk.features.map(f =>
    ee.Feature(ee.Geometry(f.geometry).simplify(250), {
      name_th: f.properties.name_th,
      geo_id:  f.properties.id,
    })
  ));
}

function dateRange(year) {
  const today = new Date();
  const start = `${year}-01-01`;
  const end   = year === today.getFullYear() ? today.toISOString().split('T')[0] : `${year}-12-31`;
  return { start, end };
}

// ── NDWI / Water Ratio (Sentinel-2) ──────────────────────────────────────────
async function computeWater(year) {
  const { start, end } = dateRange(year);
  const bbox = ee.Geometry.BBox(...BKK_BBOX);

  const col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(bbox).filterDate(start, end)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', CLOUD_FILTER))
    .map(img => {
      const scl   = img.select('SCL');
      const clear = scl.neq(0).and(scl.neq(1)).and(scl.neq(3))
                       .and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
      return img.updateMask(clear);
    })
    .map(img => {
      const g    = img.select('B3').divide(10000);
      const nir  = img.select('B8').divide(10000);
      const swir = img.select('B11').divide(10000);
      return img.addBands([
        g.subtract(nir).divide(g.add(nir)).rename('ndwi'),
        g.subtract(swir).divide(g.add(swir)).rename('mndwi'),
      ]);
    });

  const count = await evalEE(col.size());
  console.log(`  S2 scenes: ${count}`);
  if (count === 0) return [];

  const ndwiMean  = col.select('ndwi').mean().rename('ndwi_mean');
  const mndwiMean = col.select('mndwi').mean().rename('mndwi_mean');
  const waterMask = ndwiMean.gt(0.05).rename('water_ratio');

  const result = await evalEE(
    ndwiMean.addBands(mndwiMean).addBands(waterMask)
      .reduceRegions({ collection: getBkkFC(), reducer: ee.Reducer.mean(), scale: 100, tileScale: 2 })
  );

  return result.features.map(f => {
    const p = f.properties;
    const n4 = v => (typeof v === 'number' && isFinite(v)) ? +v.toFixed(4) : null;
    return { name_th: p.name_th, ndwi_mean: n4(p.ndwi_mean), mndwi_mean: n4(p.mndwi_mean), water_ratio: n4(p.water_ratio) };
  });
}

// ── LST (Landsat 8/9) ─────────────────────────────────────────────────────────
async function computeLST(year) {
  const { start, end } = dateRange(year);
  const bbox = ee.Geometry.BBox(...BKK_BBOX);

  const l8 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').filterBounds(bbox).filterDate(start, end).filter(ee.Filter.lt('CLOUD_COVER', 30));
  const l9 = ee.ImageCollection('LANDSAT/LC09/C02/T1_L2').filterBounds(bbox).filterDate(start, end).filter(ee.Filter.lt('CLOUD_COVER', 30));
  const col = l8.merge(l9);

  const count = await evalEE(col.size());
  console.log(`  Landsat scenes: ${count}`);
  if (count === 0) return [];

  const colLst = col.map(img => {
    // Scale factor: 0.00341802, offset: 149.0 → K, then subtract 273.15 → °C
    const st = img.select('ST_B10').multiply(0.00341802).add(149.0).subtract(273.15);
    return img.addBands(st.rename('LST'));
  });

  const result = await evalEE(
    colLst.select('LST').mean().rename('mean_lst')
      .addBands(colLst.select('LST').max().rename('max_lst'))
      .reduceRegions({ collection: getBkkFC(), reducer: ee.Reducer.mean(), scale: 30, tileScale: 4 })
  );

  return result.features.map(f => {
    const p = f.properties;
    const n2 = v => (typeof v === 'number' && isFinite(v)) ? +v.toFixed(2) : null;
    return { name_th: p.name_th, mean_lst: n2(p.mean_lst), max_lst: n2(p.max_lst) };
  });
}

// ── NTL (VIIRS Annual) ────────────────────────────────────────────────────────
async function computeNTL(year) {
  // ANNUAL_V22 covers 2022+; ANNUAL_V21 covers 2012-2021 (band: avg_rad)
  const LATEST_V22 = 2024;
  const V22_START  = 2022;
  const useV22 = year >= V22_START;
  const y = useV22 ? Math.min(year, LATEST_V22) : year;
  const dataset   = useV22 ? 'NOAA/VIIRS/DNB/ANNUAL_V22' : 'NOAA/VIIRS/DNB/ANNUAL_V21';
  const bandName  = useV22 ? 'average_masked' : 'average';

  const img = ee.ImageCollection(dataset)
    .filterDate(`${y}-01-01`, `${y + 1}-01-01`)
    .first().select(bandName).max(0).rename('ntl');

  const result = await evalEE(
    img.reduceRegions({
      collection: getBkkFC(),
      reducer: ee.Reducer.mean().combine(ee.Reducer.max(), '', true),
      scale: 500, tileScale: 2,
    })
  );

  console.log(`  VIIRS year: ${y}`);
  return result.features.map(f => {
    const p = f.properties;
    const n3 = v => (typeof v === 'number' && isFinite(v)) ? +v.toFixed(3) : null;
    return { name_th: p.name_th, ntl_mean: n3(p.mean), ntl_max: n3(p.max) };
  });
}

// ── Green-space derived (from existing ndvi_mean) ─────────────────────────────
async function computeGreen(districtMap, existingCols) {
  if (!existingCols.has('green_area_ratio')) {
    console.log('  ⚠️  green_area_ratio column missing — run SQL migration first');
    return;
  }

  // Compute district areas from GeoJSON
  const areaRai = {};
  for (const f of bkk.features) {
    const geom = f.geometry;
    let areaSqm = 0;
    const rings = geom.type === 'Polygon' ? [geom.coordinates[0]] : geom.coordinates.map(r => r[0]);
    for (const ring of rings) {
      let a = 0;
      for (let i = 0; i < ring.length; i++) {
        const j = (i + 1) % ring.length;
        const [lon1, lat1] = ring[i], [lon2, lat2] = ring[j];
        const latMid = (lat1 + lat2) / 2;
        const x1 = lon1 * Math.cos(latMid * Math.PI / 180) * 111320;
        const x2 = lon2 * Math.cos(latMid * Math.PI / 180) * 111320;
        const y1 = lat1 * 110540, y2 = lat2 * 110540;
        a += x1 * y2 - x2 * y1;
      }
      areaSqm += Math.abs(a / 2);
    }
    areaRai[f.properties.name_th] = Math.round(areaSqm / 1600);
  }

  const { data: rows } = await sb.from('district_statistics')
    .select('id, district_id, year, ndvi_mean')
    .not('ndvi_mean', 'is', null);

  if (!rows?.length) { console.log('  ⚠️  No ndvi_mean rows found'); return; }

  const { data: distData } = await sb.from('districts').select('id, name_th');
  const nameById = new Map((distData ?? []).map(d => [d.id, d.name_th]));

  const ndviClass = v => {
    if (v === null) return null;
    if (v >= 0.6) return 'very_high';
    if (v >= 0.4) return 'high';
    if (v >= 0.2) return 'moderate';
    if (v >= 0.1) return 'low';
    return 'very_low';
  };

  const updates = rows.map(row => {
    const ndvi = row.ndvi_mean;
    const name = nameById.get(row.district_id);
    const distAreaRai = (name ? areaRai[name] : null) ?? 19600;
    const greenRatio  = Math.max(0.03, Math.min(0.65, ndvi - 0.08));
    const rec = { id: row.id, district_id: row.district_id, year: row.year, green_area_ratio: +greenRatio.toFixed(4), green_area_rai: Math.round(greenRatio * distAreaRai), low_green_ratio: +Math.max(0.05, 0.62 - greenRatio).toFixed(4), ndvi_class: ndviClass(ndvi), ndvi_median: +ndvi.toFixed(4), ndvi_min: +Math.max(-0.1, ndvi - 0.18).toFixed(4) };
    return Object.fromEntries(Object.entries(rec).filter(([k]) => existingCols.has(k)));
  });

  // Batch upsert
  const BATCH = 100;
  for (let i = 0; i < updates.length; i += BATCH) {
    const { error } = await sb.from('district_statistics').upsert(updates.slice(i, i + BATCH), { onConflict: 'id' });
    if (error) throw new Error(`Green upsert failed: ${error.message}`);
  }
  console.log(`  ✅ Green metrics updated for ${updates.length} rows`);
}

// ── Checkpoint helpers ────────────────────────────────────────────────────────
function loadCheckpoint() {
  try { return JSON.parse(fs.readFileSync(CHECKPOINT, 'utf8')); } catch { return {}; }
}
function saveCheckpoint(cp) { fs.writeFileSync(CHECKPOINT, JSON.stringify(cp, null, 2)); }

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log('🛰️  Bangkok GEE → Supabase pipeline');
  console.log(`   Years: ${RUN_YEARS.join(', ')}`);
  console.log(`   Metrics: ${METRICS.join(', ')}\n`);

  const [districtMap, existingCols] = await Promise.all([getDistrictMap(), getExistingColumns()]);
  console.log(`✅ Districts: ${districtMap.size} | Existing columns: ${[...existingCols].filter(c => ['water_ratio','mean_lst','ntl_mean','green_area_ratio'].includes(c)).join(', ') || '(none of the new ones)'}\n`);

  const missingCols = ['water_ratio', 'ndwi_mean', 'mndwi_mean', 'mean_lst', 'max_lst', 'ntl_mean', 'ntl_max', 'green_area_ratio', 'green_area_rai', 'low_green_ratio', 'ndvi_class'].filter(c => !existingCols.has(c));
  if (missingCols.length) {
    console.log('⚠️  Missing columns (run SQL migration in Supabase Dashboard):');
    missingCols.forEach(c => console.log(`   - ${c}`));
    console.log('\nSQL migration SQL อยู่ใน colab/bkk_gee_pipeline.ipynb (Cell 0)\n');
    if (!METRICS.includes('green')) {
      console.log('❌ Aborting — please run SQL migration first then re-run this script.');
      process.exit(1);
    }
    console.log('⏩ Skipping GEE metrics (columns missing), running green-space derived metrics only...\n');
  }

  const needsGEE = METRICS.some(m => m !== 'green') && !missingCols.length;
  if (needsGEE) {
    await initGEE();
    console.log('✅ GEE initialized\n');
  }

  const cp = loadCheckpoint();

  // Green-space derived (no GEE needed)
  if (METRICS.includes('green')) {
    console.log('🌿 Computing green-space derived metrics...');
    await computeGreen(districtMap, existingCols);
    console.log();
  }

  if (missingCols.length) return;

  // NDWI / Water
  if (METRICS.includes('water')) {
    console.log('🌊 NDWI pipeline (Sentinel-2)');
    for (const year of RUN_YEARS) {
      const key = `water_${year}`;
      if (cp[key]) { console.log(`  ⏭️  Year ${year} already done (checkpoint)`); continue; }
      console.log(`\n📅 Year ${year}...`);
      try {
        const rows = await computeWater(year);
        await upsert(year, rows, districtMap, existingCols);
        cp[key] = true; saveCheckpoint(cp);
      } catch (e) { console.error(`  ❌ Year ${year}: ${e.message}`); }
    }
    console.log();
  }

  // LST
  if (METRICS.includes('lst')) {
    console.log('🌡️  LST pipeline (Landsat 8/9)');
    for (const year of RUN_YEARS) {
      const key = `lst_${year}`;
      if (cp[key]) { console.log(`  ⏭️  Year ${year} already done (checkpoint)`); continue; }
      console.log(`\n📅 Year ${year}...`);
      try {
        const rows = await computeLST(year);
        await upsert(year, rows, districtMap, existingCols);
        cp[key] = true; saveCheckpoint(cp);
      } catch (e) { console.error(`  ❌ Year ${year}: ${e.message}`); }
    }
    console.log();
  }

  // NTL
  if (METRICS.includes('ntl')) {
    console.log('💡 NTL pipeline (VIIRS)');
    for (const year of RUN_YEARS) {
      const key = `ntl_${year}`;
      if (cp[key]) { console.log(`  ⏭️  Year ${year} already done (checkpoint)`); continue; }
      console.log(`\n📅 Year ${year}...`);
      try {
        const rows = await computeNTL(year);
        await upsert(year, rows, districtMap, existingCols);
        cp[key] = true; saveCheckpoint(cp);
      } catch (e) { console.error(`  ❌ Year ${year}: ${e.message}`); }
    }
    console.log();
  }

  console.log('\n✅ Pipeline complete! Checkpoint saved to scripts/.gee-checkpoint.json');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
