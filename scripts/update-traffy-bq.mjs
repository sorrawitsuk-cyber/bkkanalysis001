/**
 * Daily Traffy update: ดึงข้อมูลล่าสุด N รายการจาก Traffy API แล้ว append เข้า BigQuery
 * View traffy_complaints_current จะ dedup ให้อัตโนมัติ (ใช้ ingested_at ล่าสุด)
 *
 * Usage:
 *   node scripts/update-traffy-bq.mjs              # ดึง 15,000 รายการล่าสุด
 *   node scripts/update-traffy-bq.mjs --count 5000
 *   node scripts/update-traffy-bq.mjs --dry-run
 */

import { BigQuery } from '@google-cloud/bigquery';
import { readFileSync, writeFileSync, unlinkSync, existsSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';

// ── Load env (.env.local in dev, process.env in CI) ──────────────────────────
const envVars = {};
const envPath = resolve(process.cwd(), '.env.local');
if (existsSync(envPath)) {
  for (const line of readFileSync(envPath, 'utf-8').split('\n')) {
    const t = line.trim();
    if (!t || t.startsWith('#')) continue;
    const eq = t.indexOf('=');
    if (eq < 0) continue;
    envVars[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
  }
}

const PROJECT_ID  = process.env.BQ_PROJECT_ID  || envVars.BQ_PROJECT_ID;
const DATASET_ID  = process.env.BQ_DATASET      || envVars.BQ_DATASET;
const rawCreds    = process.env.BQ_CREDENTIALS  || envVars.BQ_CREDENTIALS || '{}';
const credentials = JSON.parse(rawCreds);

if (!PROJECT_ID || !DATASET_ID) {
  console.error('❌ Missing BQ_PROJECT_ID or BQ_DATASET'); process.exit(1);
}

// ── Args ──────────────────────────────────────────────────────────────────────
const args    = process.argv.slice(2);
const COUNT   = parseInt(args[args.indexOf('--count') > -1 ? args.indexOf('--count') + 1 : -1] || '15000');
const DRY_RUN = args.includes('--dry-run');
const BATCH   = 500;   // records per Traffy API call

const TRAFFY_API = 'https://publicapi.traffy.in.th/share/teamchadchart/search';

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
function transform(item, ingestedAt) {
  let lon = null, lat = null;
  if (Array.isArray(item.coords) && item.coords.length === 2) {
    let c0 = parseFloat(item.coords[0]), c1 = parseFloat(item.coords[1]);
    if (c1 > 80 && c1 < 120 && c0 > 10 && c0 < 20) { lon = c1; lat = c0; }
    else { lon = c0; lat = c1; }
    if (lon < 99 || lon > 101 || lat < 13 || lat > 14.2) { lon = null; lat = null; }
  }
  const district = extractDistrict(item.address || '');
  return {
    ticket_id:      String(item.ticket_id || ''),
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
    created_at:     item.timestamp ? new Date(item.timestamp).toISOString() : null,
    ingested_at:    ingestedAt,
  };
}

async function fetchWithRetry(url, retries = 4) {
  for (let i = 1; i <= retries; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(30_000) });
      if (res.ok) return res.json();
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (i === retries) throw err;
      const wait = i * 3000;
      process.stdout.write(`\n  ⚠️  retry ${i} (${err.message}) wait ${wait/1000}s...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

// ── BigQuery Load Job ─────────────────────────────────────────────────────────
const bq      = new BigQuery({ projectId: PROJECT_ID, credentials });
const bqTable = bq.dataset(DATASET_ID).table('traffy_complaints');

async function loadToBigQuery(records) {
  const tmpFile = resolve(tmpdir(), `traffy_update_${Date.now()}.jsonl`);
  writeFileSync(tmpFile, records.map(r => JSON.stringify(r)).join('\n'), 'utf-8');
  try {
    await new Promise((resolve, reject) => {
      bqTable.createLoadJob(tmpFile, {
        sourceFormat: 'NEWLINE_DELIMITED_JSON',
        writeDisposition: 'WRITE_APPEND',
      }, (err, job) => {
        if (err) return reject(err);
        const poll = setInterval(async () => {
          const [meta] = await job.getMetadata();
          if (meta.status.state === 'DONE') {
            clearInterval(poll);
            if (meta.status.errorResult) reject(new Error(meta.status.errorResult.message));
            else resolve();
          }
        }, 2000);
      });
    });
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
const ingestedAt = new Date().toISOString();
const records    = [];
let offset       = 0;

console.log(`\n🔄 Traffy daily update  [${new Date().toLocaleString('th-TH', { timeZone: 'Asia/Bangkok' })}]`);
console.log(`   Project: ${PROJECT_ID}.${DATASET_ID}`);
console.log(`   Target : ${COUNT.toLocaleString()} most-recent records`);
if (DRY_RUN) console.log('   Mode   : DRY RUN (no BigQuery write)\n');

while (records.length < COUNT) {
  const remaining = COUNT - records.length;
  const limit     = Math.min(BATCH, remaining);
  let data;
  try {
    data = await fetchWithRetry(`${TRAFFY_API}?limit=${limit}&start=${offset}`);
  } catch (err) {
    console.error(`\n❌ Traffy API error at offset ${offset}: ${err.message}`);
    process.exit(1);
  }

  const results = data.results ?? [];
  if (results.length === 0) break;

  records.push(...results.map(r => transform(r, ingestedAt)).filter(r => r.ticket_id));
  offset += results.length;

  process.stdout.write(`\r  Fetched ${records.length.toLocaleString()} / ${COUNT.toLocaleString()} records...`);

  if (results.length < limit) break;
}

console.log(`\n  ✅ Fetched ${records.length.toLocaleString()} records`);
if (records.length === 0) { console.log('  Nothing to load.'); process.exit(0); }

if (DRY_RUN) {
  console.log('\n[DRY RUN] Sample record:');
  console.log(JSON.stringify(records[0], null, 2));
  process.exit(0);
}

console.log(`  📤 Loading to BigQuery...`);
await loadToBigQuery(records);
console.log(`  ✅ Loaded ${records.length.toLocaleString()} records (ingested_at: ${ingestedAt})`);
console.log(`\n  View traffy_complaints_current จะ dedup อัตโนมัติ`);
console.log('🎉 Done!\n');
