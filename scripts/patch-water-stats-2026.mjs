#!/usr/bin/env node
/**
 * Patch R2 metadata.json for a given year with district_stats (water_ratio, ndwi_mean, mndwi_mean).
 * Uses the same GEE Node.js SDK setup as the Next.js API routes.
 *
 * Usage:
 *   node scripts/patch-water-stats-2026.mjs [--year 2026] [--force]
 */

import * as dotenv from 'dotenv';
dotenv.config({ path: '.env.local' });

import { S3Client, GetObjectCommand, PutObjectCommand } from '@aws-sdk/client-s3';
import ee from '@google/earthengine';
import { google } from 'googleapis';
import { createRequire } from 'module';
import { readFileSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join, resolve } from 'path';

const __dirname = dirname(fileURLToPath(import.meta.url));

const args     = process.argv.slice(2);
const yearArg  = args.includes('--year') ? parseInt(args[args.indexOf('--year') + 1], 10) : 2026;
const force    = args.includes('--force');

const CACHE_PREFIX = process.env.SATELLITE_CACHE_PREFIX || 'satellite-cache';
const BUCKET       = process.env.R2_BUCKET;
const ACCOUNT_ID   = process.env.R2_ACCOUNT_ID;
const SCALE        = 100;

// ── GEE init ─────────────────────────────────────────────────────────────────

const GEE_SCOPE = 'https://www.googleapis.com/auth/earthengine';

function getAccessToken(email, key) {
  return new Promise((resolve, reject) => {
    const jwtAuth = new google.auth.JWT(email, null, key, [GEE_SCOPE]);
    jwtAuth.getAccessToken((err, token) => {
      if (err || !token) reject(err ?? new Error('No token'));
      else resolve(token);
    });
  });
}

async function initGEE() {
  const email = process.env.GEE_CLIENT_EMAIL;
  const key   = process.env.GEE_PRIVATE_KEY?.replace(/\\n/g, '\n');
  const proj  = process.env.GEE_PROJECT_ID;
  if (!email || !key) throw new Error('GEE_CLIENT_EMAIL / GEE_PRIVATE_KEY missing');

  const token = await getAccessToken(email, key);
  ee.apiclient.setAuthToken('', 'Bearer', token, 3500, [], null, false);
  ee.apiclient.setAuthTokenRefresher((_args, cb) =>
    getAccessToken(email, key)
      .then(t => cb({ token_type: 'Bearer', access_token: t, expires_in: 3500 }))
      .catch(() => cb(null))
  );
  await new Promise((res, rej) =>
    ee.initialize(null, null, () => { console.log('✅ GEE initialized'); res(); }, rej, null, proj)
  );
}

// ── Districts ─────────────────────────────────────────────────────────────────

function loadDistrictsFC() {
  const path = resolve(__dirname, '..', 'src', 'data', 'bkk_districts.json');
  const { features } = JSON.parse(readFileSync(path, 'utf8'));
  return ee.FeatureCollection(
    features.map(f =>
      ee.Feature(
        ee.Geometry(f.geometry).simplify(250),
        { id: f.properties.id, name_th: f.properties.name_th }
      )
    )
  );
}

// ── Compute stats ─────────────────────────────────────────────────────────────

function evaluateEe(obj) {
  return new Promise((res, rej) =>
    obj.evaluate((val, err) => err ? rej(err) : res(val))
  );
}

function maskS2(image) {
  const scl = image.select('SCL');
  const clear = scl.neq(0).and(scl.neq(1)).and(scl.neq(3))
    .and(scl.neq(8)).and(scl.neq(9)).and(scl.neq(10)).and(scl.neq(11));
  return image.updateMask(clear);
}

async function computeStats(year) {
  const today     = new Date();
  const dateStart = `${year}-01-01`;
  const dateEnd   = year === today.getFullYear()
    ? today.toISOString().split('T')[0]
    : `${year}-12-31`;

  console.log(`Computing ${year}: ${dateStart} → ${dateEnd}`);
  const bbox = ee.Geometry.BBox(100.329, 13.494, 100.935, 13.956);

  const col = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
    .filterBounds(bbox)
    .filterDate(dateStart, dateEnd)
    .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 30))
    .map(maskS2)
    .map(img => {
      const green = img.select('B3').divide(10000);
      const nir   = img.select('B8').divide(10000);
      const swir  = img.select('B11').divide(10000);
      const ndwi  = green.subtract(nir).divide(green.add(nir)).rename('NDWI');
      const mndwi = green.subtract(swir).divide(green.add(swir)).rename('MNDWI');
      return img.addBands([ndwi, mndwi]);
    });

  const count = await evaluateEe(col.size());
  console.log(`  ${count} scenes`);
  if (count < 1) throw new Error('No scenes available');

  const ndwiMean  = col.select('NDWI').mean().rename('ndwi_mean');
  const ndwiMax   = col.select('NDWI').max().rename('ndwi_max');
  const mndwiMean = col.select('MNDWI').mean().rename('mndwi_mean');
  const waterMask = ndwiMean.gt(0).rename('water_ratio');

  const stacked   = ndwiMean.addBands(ndwiMax).addBands(mndwiMean).addBands(waterMask);
  const districts = loadDistrictsFC();

  const result = await evaluateEe(
    stacked.reduceRegions({ collection: districts, reducer: ee.Reducer.mean(), scale: SCALE, tileScale: 2 })
  );

  return (result.features ?? []).map(feat => {
    const p = feat.properties ?? {};
    const f = k => { const v = p[k]; return (typeof v === 'number' && Number.isFinite(v)) ? +v.toFixed(4) : null; };
    return {
      district_id:   p.id,
      district_name: p.name_th,
      ndwi_mean:     f('ndwi_mean'),
      ndwi_max:      f('ndwi_max'),
      mndwi_mean:    f('mndwi_mean'),
      water_ratio:   f('water_ratio'),
    };
  });
}

// ── R2 helpers ────────────────────────────────────────────────────────────────

function buildS3() {
  return new S3Client({
    region: 'auto',
    endpoint: `https://${ACCOUNT_ID}.r2.cloudflarestorage.com`,
    credentials: {
      accessKeyId:     process.env.R2_ACCESS_KEY_ID     || '',
      secretAccessKey: process.env.R2_SECRET_ACCESS_KEY || '',
    },
  });
}

async function getR2Json(s3, key) {
  try {
    const res = await s3.send(new GetObjectCommand({ Bucket: BUCKET, Key: key }));
    return JSON.parse(await res.Body.transformToString());
  } catch { return null; }
}

async function putR2Json(s3, key, data) {
  const body = JSON.stringify(data, null, 2);
  await s3.send(new PutObjectCommand({
    Bucket: BUCKET, Key: key,
    Body: body,
    ContentType: 'application/json',
    CacheControl: 'public, max-age=300',
  }));
  console.log(`✅ Uploaded ${key} (${body.length} bytes)`);
}

// ── Supabase upsert (optional) ────────────────────────────────────────────────

async function upsertSupabase(year, rows) {
  const base = process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL;
  const key  = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!base || !key) { console.log('Supabase env not set — skipping'); return; }

  const records = rows
    .filter(r => r.district_id != null && r.water_ratio != null)
    .map(r => ({ district_id: r.district_id, district_name: r.district_name, year, water_ratio: r.water_ratio, ndwi_mean: r.ndwi_mean, mndwi_mean: r.mndwi_mean }));

  const res = await fetch(`${base.replace(/\/$/, '')}/rest/v1/district_statistics`, {
    method: 'POST',
    headers: {
      'apikey': key, 'Authorization': `Bearer ${key}`,
      'Content-Type': 'application/json', 'Prefer': 'resolution=merge-duplicates',
    },
    body: JSON.stringify(records),
  });
  if (res.ok) console.log(`✅ Supabase upsert OK: ${records.length} rows for year ${year}`);
  else console.warn(`⚠️  Supabase upsert failed: ${res.status} — ${await res.text()}`);
}

// ── Main ──────────────────────────────────────────────────────────────────────

async function main() {
  console.log(`\n=== Patching district_stats for year ${yearArg} (force=${force}) ===\n`);

  const metaKey = `${CACHE_PREFIX}/yearly/${yearArg}/metadata.json`;
  const s3      = buildS3();

  const meta = await getR2Json(s3, metaKey);
  if (!meta) {
    console.error(`❌ No metadata.json found for year ${yearArg} at ${metaKey}`);
    process.exit(1);
  }
  console.log(`Metadata: status=${meta.status}, image_count=${meta.image_count}, district_stats=${(meta.district_stats ?? []).length} rows`);

  const hasWater = (meta.district_stats ?? []).some(r => typeof r.water_ratio === 'number');
  if (hasWater && !force) {
    console.log('district_stats already present — use --force to overwrite');
    process.exit(0);
  }

  await initGEE();

  console.log('\nRunning GEE reduceRegions...');
  const rows = await computeStats(yearArg);
  console.log(`Computed ${rows.length} district rows`);
  if (!rows.length) { console.error('❌ GEE returned no rows'); process.exit(1); }

  meta.district_stats = rows;
  meta.patched_at     = new Date().toISOString().replace(/\.\d{3}Z$/, 'Z');
  await putR2Json(s3, metaKey, meta);
  await upsertSupabase(yearArg, rows);

  console.log('\n✅ Done.');
}

main().catch(err => { console.error('❌ Fatal:', err); process.exit(1); });
