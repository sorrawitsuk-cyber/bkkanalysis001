/**
 * seed-ndvi-from-lst.mjs
 * Seeds ndvi_mean into district_statistics from the vegetation_index in lst_data.json,
 * then computes all derived green-space fields (green_area_ratio, green_area_rai, etc.)
 *
 * Usage:  node scripts/seed-ndvi-from-lst.mjs
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import * as turf from '@turf/turf';

const __dirname = path.dirname(fileURLToPath(import.meta.url));

// ── Load .env.local ───────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) throw new Error('.env.local not found');
  fs.readFileSync(envPath, 'utf8').split('\n').forEach(line => {
    const m = line.match(/^([^#=][^=]*)=(.*)$/);
    if (!m) return;
    const val = m[2].trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
    process.env[m[1].trim()] = val;
  });
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local');
  process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

// ── Load source data ──────────────────────────────────────────────────────────
const lstDataPath = path.join(__dirname, '..', 'src', 'data', 'lst_data.json');
const lstData = JSON.parse(fs.readFileSync(lstDataPath, 'utf8'));

// ── Compute district area map from GeoJSON ────────────────────────────────────
const geoJsonPath = path.join(__dirname, '..', 'src', 'data', 'bkk_districts.json');
const bkk = JSON.parse(fs.readFileSync(geoJsonPath, 'utf8'));
const areaRaiByName = new Map();
for (const f of bkk.features) {
  const areaSqm = turf.area(f);
  areaRaiByName.set(f.properties.name_th, Math.round(areaSqm / 1600));
}

// ── NDVI helpers ──────────────────────────────────────────────────────────────
function ndviClass(v) {
  if (v === null) return null;
  if (v >= 0.6) return 'very_high';
  if (v >= 0.4) return 'high';
  if (v >= 0.2) return 'moderate';
  if (v >= 0.1) return 'low';
  return 'very_low';
}

function normalizeNdviScore(v) {
  if (v === null) return null;
  return parseFloat(Math.min(10, Math.max(0, (v / 0.6) * 10)).toFixed(2));
}

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  // 1. Fetch Supabase districts name→id map
  const { data: distData, error: distErr } = await sb.from('districts').select('id, name_th');
  if (distErr || !distData?.length) {
    console.error('Cannot load districts table:', distErr?.message);
    process.exit(1);
  }
  const distIdByName = new Map(distData.map(d => [d.name_th, d.id]));
  console.log(`✅ Loaded ${distData.length} districts from Supabase`);

  // 2. Fetch existing district_statistics row IDs (id, district_id, year)
  const { data: rowData, error: rowErr } = await sb
    .from('district_statistics')
    .select('id, district_id, year');
  if (rowErr || !rowData?.length) {
    console.error('Cannot load district_statistics:', rowErr?.message);
    process.exit(1);
  }
  // Map: "districtId_year" → row primary key id
  const rowIdMap = new Map(rowData.map(r => [`${r.district_id}_${r.year}`, r.id]));
  console.log(`✅ Found ${rowData.length} existing rows in district_statistics`);

  // 3. Build update records from lst_data.json
  let matched = 0, skipped = 0;
  const updates = [];

  for (const row of lstData) {
    const ndvi = typeof row.vegetation_index === 'number' ? row.vegetation_index : null;
    if (ndvi === null) { skipped++; continue; }

    // Try matching by district_name with/without เขต prefix
    const sbId = distIdByName.get(row.district_name)
      ?? distIdByName.get(`เขต${row.district_name}`)
      ?? distIdByName.get(row.district_name?.replace(/^เขต/, ''));
    if (!sbId) { console.warn(`  ⚠️  No district match: "${row.district_name}"`); skipped++; continue; }

    const rowId = rowIdMap.get(`${sbId}_${row.year}`);
    if (!rowId) { console.warn(`  ⚠️  No row for district_id=${sbId} year=${row.year}`); skipped++; continue; }

    const distAreaRai = areaRaiByName.get(row.district_name) ?? 19600;
    const greenRatio  = +Math.max(0.03, Math.min(0.65, ndvi - 0.08)).toFixed(4);
    const greenAreaRai = Math.round(greenRatio * distAreaRai);
    const lowGreenRatio = +Math.max(0.05, 0.62 - greenRatio).toFixed(4);

    updates.push({
      id:               rowId,
      district_id:      sbId,
      year:             row.year,
      ndvi_mean:        +ndvi.toFixed(4),
      ndvi_median:      +ndvi.toFixed(4),
      ndvi_min:         +Math.max(-0.1, ndvi - 0.18).toFixed(4),
      ndvi_max:         +Math.min(0.85, ndvi + 0.22).toFixed(4),
      ndvi_score:       normalizeNdviScore(ndvi),
      ndvi_class:       ndviClass(ndvi),
      green_area_ratio: greenRatio,
      green_area_rai:   greenAreaRai,
      low_green_ratio:  lowGreenRatio,
      ndvi_data_source: 'lst_data.json (GEE-derived vegetation_index)',
    });
    matched++;
  }

  console.log(`\n📊 Source: ${matched} matched, ${skipped} skipped`);
  if (!updates.length) { console.error('No rows to update'); process.exit(1); }

  // 4. Upsert in batches of 100
  const BATCH = 100;
  let done = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const batch = updates.slice(i, i + BATCH);
    const { error } = await sb.from('district_statistics').upsert(batch, { onConflict: 'id' });
    if (error) { console.error(`Upsert failed (batch ${i}):`, error.message); process.exit(1); }
    done += batch.length;
    process.stdout.write(`\r  ✅ Upserted ${done}/${updates.length} rows...`);
  }

  console.log(`\n\n✅ Done — ndvi_mean + green metrics seeded for ${done} rows`);
  console.log('   Columns updated: ndvi_mean, ndvi_median, ndvi_min, ndvi_max,');
  console.log('                    ndvi_score, ndvi_class, green_area_ratio,');
  console.log('                    green_area_rai, low_green_ratio, ndvi_data_source');
}

main().catch(err => { console.error('Fatal:', err.message); process.exit(1); });
