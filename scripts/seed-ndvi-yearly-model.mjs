/**
 * seed-ndvi-yearly-model.mjs
 * Updates ndvi_mean per district per year with a physically-plausible model:
 *   ndvi(district, year) = baseline + urbanization_trend * (year − 2022)
 *                        + enso_effect(year) + district_noise(district, year)
 *
 * Baseline: per-district vegetation_index from lst_data.json (treated as 2022 anchor).
 * ENSO effect: year-level climate forcing (La Niña wetter → higher NDVI).
 * Urbanization trend: slower decline for greener outer districts.
 * Noise: deterministic ±0.005 per district×year (reproducible, zero-mean).
 *
 * Usage: node scripts/seed-ndvi-yearly-model.mjs [--dry-run]
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';
import * as turf from '@turf/turf';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');

// ── Load .env.local ──────────────────────────────────────────────────────────
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

const sb = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY
);

// ── Climate effect per year (relative to 2022 baseline) ─────────────────────
// Based on ENSO state over Bangkok / Central Thailand:
//   La Niña → above-average rainfall → higher NDVI
//   El Niño → drier conditions → lower NDVI
const ENSO_EFFECT = {
  2018: +0.012,  // La Niña ending — above-average wet season
  2019: +0.005,  // Neutral
  2020: +0.018,  // La Niña — exceptional rainfall in SE Asia
  2021: +0.014,  // La Niña continues
  2022:  0.000,  // Neutral baseline year
  2023: -0.013,  // El Niño developing — drought stress mid-year
  2024: -0.008,  // El Niño peak Q1, transitioning out
  2025: +0.007,  // La Niña returning
  2026: +0.003,  // Partial year (Jan–Jun estimate)
};

// ── Urbanization trend: annual slope from 2022 ───────────────────────────────
function annualTrend(baseline) {
  if (baseline < 0.15) return -0.0022;  // Very dense urban: strong pressure
  if (baseline < 0.22) return -0.0016;  // Dense urban
  if (baseline < 0.30) return -0.0010;  // Mixed urban
  if (baseline < 0.40) return -0.0006;  // Suburban mixed
  return -0.0003;                        // Green / outer districts: near-stable
}

// ── Deterministic noise: ±0.005 max, zero-mean per district ──────────────────
// Uses a simple hash so values are reproducible but district-unique.
function deterministicNoise(districtId, year) {
  const v = ((districtId * 2654435761 + year * 2246822519) >>> 0) % 10000;
  return (v - 5000) / 1000000;  // Range ≈ −0.005 … +0.005
}

// ── Helpers ───────────────────────────────────────────────────────────────────
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
  return +Math.min(10, Math.max(0, (v / 0.6) * 10)).toFixed(2);
}

// ── Load GeoJSON for district area ────────────────────────────────────────────
const geoJsonPath = path.join(__dirname, '..', 'src', 'data', 'bkk_districts.json');
const bkk = JSON.parse(fs.readFileSync(geoJsonPath, 'utf8'));
const areaRaiByName = new Map();
for (const f of bkk.features) {
  areaRaiByName.set(f.properties.name_th, Math.round(turf.area(f) / 1600));
}

// ── Load per-district baseline from lst_data.json ─────────────────────────────
const lstDataPath = path.join(__dirname, '..', 'src', 'data', 'lst_data.json');
const lstData = JSON.parse(fs.readFileSync(lstDataPath, 'utf8'));

// One baseline per district (use any year's value — they're identical in the source)
const baselineByName = new Map();
for (const row of lstData) {
  if (!baselineByName.has(row.district_name) && typeof row.vegetation_index === 'number') {
    baselineByName.set(row.district_name, row.vegetation_index);
  }
}

const YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

// ── Main ──────────────────────────────────────────────────────────────────────
async function main() {
  console.log(`🌿 NDVI yearly model seed ${DRY_RUN ? '[DRY-RUN]' : ''}`);

  const { data: distData } = await sb.from('districts').select('id, name_th');
  const distIdByName = new Map(distData.map(d => [d.name_th, d.id]));
  const distNameById = new Map(distData.map(d => [d.id, d.name_th]));
  console.log(`✅ ${distData.length} districts loaded`);

  const { data: rowData } = await sb
    .from('district_statistics')
    .select('id, district_id, year, ndvi_mean');
  const rowIdMap = new Map(rowData.map(r => [`${r.district_id}_${r.year}`, r.id]));
  console.log(`✅ ${rowData.length} existing rows found\n`);

  const updates = [];

  for (const [distName, baseline] of baselineByName) {
    const sbId = distIdByName.get(distName)
      ?? distIdByName.get(`เขต${distName}`)
      ?? distIdByName.get(distName.replace(/^เขต/, ''));
    if (!sbId) { console.warn(`  ⚠️  No Supabase ID for "${distName}"`); continue; }

    const trend = annualTrend(baseline);
    const distAreaRai = areaRaiByName.get(distName) ?? 19600;

    for (const year of YEARS) {
      const rowId = rowIdMap.get(`${sbId}_${year}`);
      if (!rowId) { console.warn(`  ⚠️  Missing row: ${distName} ${year}`); continue; }

      const enso = ENSO_EFFECT[year] ?? 0;
      const noise = deterministicNoise(sbId, year);
      const ndvi = +Math.max(0.05, Math.min(0.65,
        baseline + trend * (year - 2022) + enso + noise
      )).toFixed(4);

      const greenRatio = +Math.max(0.03, Math.min(0.65, ndvi - 0.08)).toFixed(4);
      const greenAreaRai = Math.round(greenRatio * distAreaRai);
      const lowGreenRatio = +Math.max(0.05, 0.62 - greenRatio).toFixed(4);

      updates.push({
        id:               rowId,
        district_id:      sbId,
        year,
        ndvi_mean:        ndvi,
        ndvi_median:      ndvi,
        ndvi_min:         +Math.max(-0.1, ndvi - 0.18).toFixed(4),
        ndvi_max:         +Math.min(0.85, ndvi + 0.22).toFixed(4),
        ndvi_score:       normalizeNdviScore(ndvi),
        ndvi_class:       ndviClass(ndvi),
        green_area_ratio: greenRatio,
        green_area_rai:   greenAreaRai,
        low_green_ratio:  lowGreenRatio,
        ndvi_data_source: 'modeled (ENSO+urbanization) — awaiting GEE ingest',
      });
    }
  }

  console.log(`📊 ${updates.length} rows to update`);

  // Print preview
  const sample = updates.filter(u => {
    const name = distNameById.get(u.district_id);
    return name === 'ตลิ่งชัน' || name === 'พระนคร' || name === 'มีนบุรี';
  });
  if (sample.length) {
    console.log('\nSample (ตลิ่งชัน / พระนคร / มีนบุรี):');
    console.log(sample.map(u => {
      const n = distNameById.get(u.district_id);
      return `  ${n} ${u.year}: ndvi=${u.ndvi_mean}  green_rai=${u.green_area_rai}`;
    }).join('\n'));
  }

  if (DRY_RUN) { console.log('\n[DRY-RUN] No changes written.'); return; }

  const BATCH = 100;
  let done = 0;
  for (let i = 0; i < updates.length; i += BATCH) {
    const { error } = await sb.from('district_statistics')
      .upsert(updates.slice(i, i + BATCH), { onConflict: 'id' });
    if (error) throw new Error(`Upsert failed (batch ${i}): ${error.message}`);
    done += Math.min(BATCH, updates.length - i);
    process.stdout.write(`\r  ✅ ${done}/${updates.length} rows upserted…`);
  }

  console.log(`\n\n✅ Done — ndvi_mean + green metrics updated with yearly model`);
  console.log('   Label: ndvi_data_source = "modeled (ENSO+urbanization)"');
  console.log('   Replace with: node scripts/ingest-ndvi-gee.mjs (when GEE available)');
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
