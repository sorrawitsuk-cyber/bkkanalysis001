/**
 * Seed realistic NDBI (Normalized Difference Built-up Index) values for all
 * 50 Bangkok districts × 9 years (2018-2026) into district_statistics.
 *
 * Values are modelled after real Sentinel-2 NDBI characteristics for Bangkok:
 *   - Dense urban core: ~0.15–0.30
 *   - Mixed residential/commercial: ~0.05–0.18
 *   - Suburban: ~0.00–0.10
 *   - Peri-urban/green fringe: ~-0.15 to 0.02
 * Urban expansion trend: +0.002–0.005 NDBI per year.
 *
 * Usage:  node scripts/seed-ndbi.mjs
 *         node scripts/seed-ndbi.mjs --dry-run
 */

import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { createClient } from '@supabase/supabase-js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const DRY_RUN = process.argv.includes('--dry-run');

// ── env ───────────────────────────────────────────────────────────────────────
function loadEnv() {
  const envPath = path.join(__dirname, '..', '.env.local');
  if (!fs.existsSync(envPath)) return;
  fs.readFileSync(envPath, 'utf-8').split('\n').forEach(line => {
    const m = line.match(/^([^#=][^=]*)=(.*)/);
    if (!m) return;
    const val = m[2].trim().replace(/^(['"])([\s\S]*)\1$/, '$2');
    process.env[m[1].trim()] = val;
  });
}
loadEnv();

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('Missing Supabase credentials in .env.local'); process.exit(1);
}

const sb = createClient(SUPABASE_URL, SUPABASE_KEY);

const YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

// ── Per-district NDBI profile ─────────────────────────────────────────────────
// base2018: NDBI value in 2018 baseline
// trend:    annual increase (urban expansion ~+0.002–0.006)
// spread:   ndbi_max = ndbi_mean + spread (local hotspots)
const DISTRICT_NDBI = {
  // Dense urban core (old city, commercial centres)
  'พระนคร':           { base2018: 0.182, trend: 0.0025, spread: 0.095 },
  'สัมพันธวงศ์':       { base2018: 0.235, trend: 0.0020, spread: 0.080 },
  'ป้อมปราบศัตรูพ่าย': { base2018: 0.218, trend: 0.0022, spread: 0.085 },
  'บางรัก':           { base2018: 0.228, trend: 0.0020, spread: 0.082 },
  'ปทุมวัน':          { base2018: 0.210, trend: 0.0028, spread: 0.090 },
  'ราชเทวี':          { base2018: 0.198, trend: 0.0030, spread: 0.088 },
  'พญาไท':            { base2018: 0.175, trend: 0.0032, spread: 0.092 },
  'ดุสิต':            { base2018: 0.162, trend: 0.0025, spread: 0.095 },
  'สาทร':             { base2018: 0.222, trend: 0.0022, spread: 0.085 },
  'บางคอแหลม':        { base2018: 0.185, trend: 0.0028, spread: 0.090 },
  'ยานนาวา':          { base2018: 0.172, trend: 0.0030, spread: 0.093 },
  'คลองสาน':          { base2018: 0.190, trend: 0.0025, spread: 0.088 },
  'ธนบุรี':           { base2018: 0.168, trend: 0.0028, spread: 0.090 },
  'ดินแดง':           { base2018: 0.195, trend: 0.0032, spread: 0.087 },

  // Medium-high density (inner suburbs, mixed use)
  'ห้วยขวาง':         { base2018: 0.155, trend: 0.0035, spread: 0.095 },
  'วัฒนา':            { base2018: 0.168, trend: 0.0033, spread: 0.092 },
  'คลองเตย':          { base2018: 0.162, trend: 0.0030, spread: 0.095 },
  'บางซื่อ':          { base2018: 0.138, trend: 0.0045, spread: 0.100 },
  'จตุจักร':          { base2018: 0.125, trend: 0.0035, spread: 0.098 },
  'บางเขน':           { base2018: 0.118, trend: 0.0038, spread: 0.100 },
  'ลาดพร้าว':         { base2018: 0.132, trend: 0.0038, spread: 0.098 },
  'บางกะปิ':          { base2018: 0.142, trend: 0.0040, spread: 0.095 },
  'บางกอกใหญ่':       { base2018: 0.148, trend: 0.0030, spread: 0.092 },
  'วังทองหลาง':       { base2018: 0.138, trend: 0.0040, spread: 0.095 },
  'บางพลัด':          { base2018: 0.135, trend: 0.0032, spread: 0.095 },
  'บางกอกน้อย':       { base2018: 0.128, trend: 0.0030, spread: 0.095 },
  'บึงกุ่ม':          { base2018: 0.122, trend: 0.0042, spread: 0.098 },
  'พระโขนง':          { base2018: 0.145, trend: 0.0040, spread: 0.095 },
  'สวนหลวง':          { base2018: 0.115, trend: 0.0038, spread: 0.098 },
  'จอมทอง':           { base2018: 0.108, trend: 0.0040, spread: 0.098 },
  'ราษฎร์บูรณะ':      { base2018: 0.112, trend: 0.0042, spread: 0.100 },

  // Medium density (outer suburbs)
  'ดอนเมือง':         { base2018: 0.085, trend: 0.0045, spread: 0.105 },
  'หลักสี่':          { base2018: 0.078, trend: 0.0042, spread: 0.105 },
  'ทุ่งครุ':          { base2018: 0.072, trend: 0.0045, spread: 0.108 },
  'คันนายาว':         { base2018: 0.065, trend: 0.0048, spread: 0.108 },
  'บางแค':            { base2018: 0.082, trend: 0.0048, spread: 0.105 },
  'หนองแขม':          { base2018: 0.062, trend: 0.0050, spread: 0.110 },
  'ภาษีเจริญ':        { base2018: 0.088, trend: 0.0042, spread: 0.105 },
  'บางนา':            { base2018: 0.095, trend: 0.0050, spread: 0.105 },
  'ประเวศ':           { base2018: 0.078, trend: 0.0048, spread: 0.108 },
  'สะพานสูง':         { base2018: 0.072, trend: 0.0050, spread: 0.108 },
  'ตลิ่งชัน':         { base2018: 0.058, trend: 0.0048, spread: 0.112 },
  'บางบอน':           { base2018: 0.055, trend: 0.0052, spread: 0.112 },
  'ลาดกระบัง':        { base2018: 0.048, trend: 0.0055, spread: 0.115 },
  'มีนบุรี':          { base2018: 0.062, trend: 0.0052, spread: 0.110 },

  // Low density / peri-urban / green fringe
  'ทวีวัฒนา':         { base2018: 0.022, trend: 0.0048, spread: 0.118 },
  'สายไหม':           { base2018: 0.035, trend: 0.0055, spread: 0.115 },
  'คลองสามวา':        { base2018: -0.012, trend: 0.0058, spread: 0.120 },
  'บางขุนเทียน':      { base2018: -0.025, trend: 0.0055, spread: 0.125 },
  'หนองจอก':          { base2018: -0.048, trend: 0.0060, spread: 0.128 },
};

function round4(v) { return Math.round(v * 10000) / 10000; }

// Add small deterministic jitter so values look like real satellite measurements
function jitter(districtId, year, scale) {
  const seed = (districtId * 31 + year * 17) % 100;
  return ((seed / 100) - 0.5) * scale;
}

async function main() {
  console.log(`🏙️  NDBI seed — Bangkok 50 districts × ${YEARS.length} years`);
  if (DRY_RUN) console.log('   [DRY RUN — no writes]\n');

  // Fetch district name→id map
  const { data: districts, error: dErr } = await sb.from('districts').select('id, name_th');
  if (dErr || !districts) { console.error('Failed to fetch districts:', dErr?.message); process.exit(1); }
  const idByName = new Map(districts.map(d => [d.name_th, d.id]));
  console.log(`✅ Loaded ${idByName.size} districts from DB\n`);

  // Fetch existing row ids: key = `${district_id}_${year}`
  const { data: existing, error: eErr } = await sb
    .from('district_statistics').select('id, district_id, year');
  if (eErr) { console.error('Failed to fetch existing rows:', eErr.message); process.exit(1); }
  const rowIdMap = new Map((existing ?? []).map(r => [`${r.district_id}_${r.year}`, r.id]));
  console.log(`✅ Found ${rowIdMap.size} existing rows in district_statistics\n`);

  const records = [];

  for (const [nameTh, profile] of Object.entries(DISTRICT_NDBI)) {
    const districtId = idByName.get(nameTh);
    if (!districtId) { console.warn(`  ⚠️  District not found in DB: ${nameTh}`); continue; }

    for (let i = 0; i < YEARS.length; i++) {
      const year = YEARS[i];
      const rowKey = `${districtId}_${year}`;
      const rowId = rowIdMap.get(rowKey);

      const rawMean = profile.base2018 + profile.trend * i + jitter(districtId, year, 0.008);
      const ndbi_mean = round4(rawMean);
      const ndbi_max  = round4(Math.min(0.65, ndbi_mean + profile.spread + jitter(districtId, year + 1, 0.015)));

      const rec = {
        district_id: districtId,
        year,
        ndbi_mean,
        ndbi_max,
        ndbi_data_source: 'Sentinel-2 SR Harmonized (seeded estimate)',
      };
      if (rowId) rec.id = rowId;

      records.push(rec);
    }
  }

  console.log(`📊 Generated ${records.length} NDBI records`);

  if (DRY_RUN) {
    console.log('\nSample records:');
    records.slice(0, 5).forEach(r => console.log(' ', JSON.stringify(r)));
    return;
  }

  // Upsert in batches of 100
  const BATCH = 100;
  let upserted = 0;
  for (let i = 0; i < records.length; i += BATCH) {
    const batch = records.slice(i, i + BATCH);
    const { error } = await sb.from('district_statistics')
      .upsert(batch, { onConflict: 'id' });
    if (error) {
      console.error(`  ❌ Batch ${i / BATCH + 1} failed:`, error.message);
    } else {
      upserted += batch.length;
      process.stdout.write(`  ✅ ${upserted}/${records.length} rows upserted\r`);
    }
  }
  console.log(`\n\n🎉 Done — ${upserted} NDBI rows seeded into district_statistics.`);
}

main().catch(e => { console.error('Fatal:', e); process.exit(1); });
