/**
 * Traffy Fondue → Supabase bulk ingest
 * Usage: node scripts/ingest-traffy.mjs [startOffset]
 */

import { createClient } from '@supabase/supabase-js';
import { readFileSync } from 'fs';
import { resolve } from 'path';

// ── Load .env.local ──────────────────────────────────────────────────────────
const envPath = resolve(process.cwd(), '.env.local');
const envVars = {};
try {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const trimmed = line.trim();
    if (!trimmed || trimmed.startsWith('#')) continue;
    const eq = trimmed.indexOf('=');
    if (eq < 0) continue;
    envVars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
  }
} catch {
  console.error('❌ ไม่พบ .env.local');
  process.exit(1);
}

const SUPABASE_URL = envVars.NEXT_PUBLIC_SUPABASE_URL;
const SUPABASE_KEY = envVars.SUPABASE_SERVICE_ROLE_KEY || envVars.NEXT_PUBLIC_SUPABASE_ANON_KEY;
if (!SUPABASE_URL || !SUPABASE_KEY) {
  console.error('❌ NEXT_PUBLIC_SUPABASE_URL หรือ key ไม่ครบ');
  process.exit(1);
}

// ── Config ───────────────────────────────────────────────────────────────────
const TRAFFY_API  = 'https://publicapi.traffy.in.th/share/teamchadchart/search';
const BATCH_SIZE  = 500;   // records per Traffy API call
const UPSERT_CHUNK = 200;  // records per Supabase upsert call
const DELAY_MS    = 0;     // ms delay between batches (0 = max speed)

// ── District / classification helpers ────────────────────────────────────────
const DISTRICT_NAMES = [
  'พระนคร','ดุสิต','หนองจอก','บางรัก','บางเขน','บางกะปิ','ปทุมวัน','ป้อมปราบศัตรูพ่าย',
  'พระโขนง','มีนบุรี','ลาดกระบัง','ยานนาวา','สัมพันธวงศ์','พญาไท','ธนบุรี','บางกอกใหญ่',
  'ห้วยขวาง','คลองสาน','ตลิ่งชัน','บางกอกน้อย','บางขุนเทียน','ภาษีเจริญ','หนองแขม','ราษฎร์บูรณะ',
  'บางพลัด','ดินแดง','บึงกุ่ม','สาทร','บางซื่อ','จตุจักร','บางคอแหลม','ประเวศ','คลองเตย',
  'สวนหลวง','จอมทอง','ดอนเมือง','ราชเทวี','ลาดพร้าว','วัฒนา','บางแค','หลักสี่','สายไหม',
  'คันนายาว','สะพานสูง','วังทองหลาง','คลองสามวา','บางนา','ทวีวัฒนา','ทุ่งครุ','บางบอน',
].sort((a, b) => b.length - a.length);

const DISTRICT_GROUPS = {
  'กลุ่มกรุงเทพเหนือ':    ['ดอนเมือง','หลักสี่','สายไหม','บางเขน','จตุจักร','ลาดพร้าว','บึงกุ่ม'],
  'กลุ่มกรุงเทพกลาง':     ['พระนคร','ดุสิต','ป้อมปราบศัตรูพ่าย','สัมพันธวงศ์','ปทุมวัน','ราชเทวี','พญาไท','ดินแดง','ห้วยขวาง','วังทองหลาง'],
  'กลุ่มกรุงเทพตะวันออก': ['มีนบุรี','คลองสามวา','หนองจอก','ลาดกระบัง','สะพานสูง','คันนายาว','บางกะปิ'],
  'กลุ่มกรุงเทพใต้':      ['สาทร','บางรัก','ยานนาวา','บางคอแหลม','วัฒนา','คลองเตย','พระโขนง','สวนหลวง','ประเวศ','บางนา'],
  'กลุ่มกรุงธนเหนือ':     ['บางพลัด','บางกอกน้อย','ตลิ่งชัน','ทวีวัฒนา','ธนบุรี','คลองสาน','บางกอกใหญ่'],
  'กลุ่มกรุงธนใต้':       ['ภาษีเจริญ','หนองแขม','บางแค','บางบอน','จอมทอง','ราษฎร์บูรณะ','ทุ่งครุ','บางขุนเทียน'],
};

const PROBLEM_KEYWORDS = [
  ['ถนน/จราจร',       ['ถนน','จราจร','รถ','ขับ','จอด','สัญญาณไฟ','สะพาน','หลุม','บ่อ','พื้นถนน','ยุบ','ชำรุด']],
  ['ทางเท้า',         ['ทางเท้า','ฟุตบาท','กระเบื้อง','บล็อก','เดินเท้า','ทางข้าม','ทางม้าลาย']],
  ['ความสะอาด/ขยะ',   ['ขยะ','ถังขยะ','เก็บขยะ','สกปรก','เหม็น','ทิ้งขยะ','ซาก','กลิ่น']],
  ['น้ำท่วม/ระบายน้ำ', ['น้ำท่วม','ท่วม','ระบายน้ำ','ท่อ','คลอง','ฝาท่อ','น้ำขัง','น้ำเน่า']],
  ['ไฟฟ้า/แสงสว่าง',  ['ไฟฟ้า','แสงสว่าง','โคมไฟ','หลอดไฟ','เสาไฟ','สายไฟ','มืด']],
  ['ต้นไม้/สวน',      ['ต้นไม้','กิ่งไม้','ใบไม้','หญ้า','สวน','ตัดต้นไม้','ปลูก','พุ่มไม้']],
  ['สัตว์จรจัด',      ['สุนัข','แมว','หมา','จรจัด','สัตว์','งู','คลอด']],
  ['เสียงรบกวน',      ['เสียง','รบกวน','ดัง','เพลง','คาราโอเกะ']],
  ['ก่อสร้าง/อาคาร',  ['ก่อสร้าง','อาคาร','สร้าง','รื้อ','ต่อเติม']],
];

function extractDistrict(addr) {
  if (!addr) return 'ไม่ระบุ';
  for (const d of DISTRICT_NAMES) { if (addr.includes(d)) return d; }
  return 'ไม่ระบุ';
}
function getDistrictGroup(d) {
  for (const [g, ds] of Object.entries(DISTRICT_GROUPS)) { if (ds.includes(d)) return g; }
  return 'ไม่ระบุ';
}
function classifyProblem(desc) {
  if (!desc) return 'อื่นๆ';
  for (const [c, kws] of PROBLEM_KEYWORDS) { for (const k of kws) { if (desc.includes(k)) return c; } }
  return 'อื่นๆ';
}
function transform(item) {
  let lon = null, lat = null;
  if (Array.isArray(item.coords) && item.coords.length === 2) {
    let c0 = parseFloat(item.coords[0]), c1 = parseFloat(item.coords[1]);
    if (c1 > 80 && c1 < 120 && c0 > 10 && c0 < 20) { lon = c1; lat = c0; }
    else { lon = c0; lat = c1; }
    if (lon < 99 || lon > 101 || lat < 13 || lat > 14.2) { lon = null; lat = null; }
  }
  const district = extractDistrict(item.address || '');
  return {
    ticket_id:      item.ticket_id,
    district,
    district_group: getDistrictGroup(district),
    problem_type:   (item.problem_type_abdul?.[0] && item.problem_type_abdul[0] !== '')
                      ? item.problem_type_abdul[0]
                      : classifyProblem(item.description || ''),
    state:          item.state || 'ไม่ระบุ',
    description:    item.description || null,
    address:        item.address || null,
    lon, lat,
    photo_url:      item.photo_url || null,
    org:            item.org || null,
    created_at:     item.timestamp || null,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n) { return n.toLocaleString('en'); }
function bar(pct, width = 30) {
  const filled = Math.round(pct / 100 * width);
  return '[' + '█'.repeat(filled) + '░'.repeat(width - filled) + ']';
}
function eta(remaining, rps) {
  if (!rps) return '?';
  const s = Math.round(remaining / rps);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m${s%60}s`;
  return `${Math.floor(s/3600)}h${Math.floor((s%3600)/60)}m`;
}

// ── Fetch with retry ──────────────────────────────────────────────────────────
const MAX_RETRIES = 5;

async function fetchWithRetry(url) {
  for (let attempt = 1; attempt <= MAX_RETRIES; attempt++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (res.ok) return res.json();
      // 5xx → retryable, 4xx → fatal
      if (res.status < 500) throw new Error(`HTTP ${res.status} (fatal)`);
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (attempt === MAX_RETRIES) throw err;
      const wait = attempt * 3000; // 3s, 6s, 9s, 12s
      process.stdout.write(`\n⚠️  retry ${attempt}/${MAX_RETRIES} (${err.message}) รอ ${wait/1000}s...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
const supabase = createClient(SUPABASE_URL, SUPABASE_KEY);

let offset = parseInt(process.argv[2] || '0');
let totalRecords = 0;
let totalUpserted = 0;
let batchNum = 0;
const startTime = Date.now();

console.log(`\n🚀 Traffy Fondue → Supabase  (batch=${BATCH_SIZE}, upsert_chunk=${UPSERT_CHUNK}, retry=${MAX_RETRIES}x)`);
console.log(`📍 เริ่มที่ offset = ${fmt(offset)}\n`);

while (true) {
  const t0 = Date.now();

  // 1. Fetch from Traffy API (with auto-retry)
  let data;
  try {
    data = await fetchWithRetry(`${TRAFFY_API}?limit=${BATCH_SIZE}&start=${offset}`);
  } catch (err) {
    console.error(`\n❌ Traffy API error at offset ${fmt(offset)}: ${err.message}`);
    console.error(`   รันใหม่ด้วย: node scripts/ingest-traffy.mjs ${offset}`);
    process.exit(1);
  }

  const total = data.total ?? data.count ?? 0;
  const results = data.results ?? [];
  if (totalRecords === 0) totalRecords = total;

  if (results.length === 0) {
    console.log('\n✅ ดึงข้อมูลครบแล้ว! ไม่มี record เพิ่มเติม');
    break;
  }

  // 2. Transform
  const records = results.map(transform);

  // 3. Upsert to Supabase in chunks
  let upserted = 0;
  for (let i = 0; i < records.length; i += UPSERT_CHUNK) {
    const chunk = records.slice(i, i + UPSERT_CHUNK);
    const { error } = await supabase
      .from('traffy_complaints')
      .upsert(chunk, { onConflict: 'ticket_id' });
    if (error) {
      console.error(`\n❌ Supabase error at offset ${fmt(offset)}: ${error.message}`);
      console.error(`   รันใหม่ด้วย: node scripts/ingest-traffy.mjs ${offset}`);
      process.exit(1);
    }
    upserted += chunk.length;
  }

  offset += results.length;
  totalUpserted += upserted;
  batchNum++;

  // 4. Progress display
  const elapsed = (Date.now() - startTime) / 1000;
  const pct = totalRecords > 0 ? Math.min(100, (offset / totalRecords) * 100) : 0;
  const rps = totalUpserted / elapsed;
  const remaining = totalRecords - offset;
  const batchMs = Date.now() - t0;

  process.stdout.write(
    `\r${bar(pct)} ${pct.toFixed(1)}%  ` +
    `${fmt(offset)}/${fmt(totalRecords)}  ` +
    `${Math.round(rps)} rec/s  ` +
    `ETA: ${eta(remaining, rps)}  ` +
    `[batch #${batchNum} ${batchMs}ms]   `
  );

  if (results.length < BATCH_SIZE || offset >= totalRecords) {
    console.log(`\n\n✅ เสร็จสมบูรณ์! upserted ${fmt(totalUpserted)} records ใน ${Math.round(elapsed)}s`);
    break;
  }

  if (DELAY_MS > 0) await new Promise(r => setTimeout(r, DELAY_MS));
}
