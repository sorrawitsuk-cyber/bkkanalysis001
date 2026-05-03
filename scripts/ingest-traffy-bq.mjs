/**
 * Traffy Fondue → Google BigQuery bulk ingest (Load Jobs - free tier compatible)
 * Usage: node scripts/ingest-traffy-bq.mjs [startOffset]
 *
 * Strategy: fetch from Traffy API → accumulate 5000 records → BigQuery Load Job
 */

import { BigQuery } from '@google-cloud/bigquery';
import { readFileSync, writeFileSync, unlinkSync } from 'fs';
import { resolve } from 'path';
import { tmpdir } from 'os';

// ── Load .env.local ──────────────────────────────────────────────────────────
const envVars = {};
for (const line of readFileSync(resolve(process.cwd(), '.env.local'), 'utf-8').split('\n')) {
  const trimmed = line.trim();
  if (!trimmed || trimmed.startsWith('#')) continue;
  const eq = trimmed.indexOf('=');
  if (eq < 0) continue;
  envVars[trimmed.slice(0, eq).trim()] = trimmed.slice(eq + 1).trim();
}

const PROJECT_ID  = envVars.BQ_PROJECT_ID;
const DATASET_ID  = envVars.BQ_DATASET;
const credentials = JSON.parse(envVars.BQ_CREDENTIALS);

// ── Config ───────────────────────────────────────────────────────────────────
const TRAFFY_API    = 'https://publicapi.traffy.in.th/share/teamchadchart/search';
const FETCH_BATCH   = 500;    // records per Traffy API call
const LOAD_EVERY    = 5000;   // flush to BigQuery every N records
const MAX_RETRIES   = 8;

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
    ticket_id:      String(item.ticket_id || ''),
    district,
    district_group: getDistrictGroup(district),
    problem_type:   (item.problem_type_abdul?.[0] && item.problem_type_abdul[0] !== '')
                      ? item.problem_type_abdul[0]
                      : classifyProblem(item.description || ''),
    state:          item.state || 'ไม่ระบุ',
    description:    item.description || null,
    address:        item.address || null,
    lon:            lon,
    lat:            lat,
    photo_url:      item.photo_url || null,
    org:            item.org || null,
    created_at:     item.timestamp ? new Date(item.timestamp).toISOString() : null,
  };
}

// ── Helpers ───────────────────────────────────────────────────────────────────
function fmt(n) { return n.toLocaleString('en'); }
function bar(pct, w = 30) {
  const f = Math.round(pct / 100 * w);
  return '[' + '█'.repeat(f) + '░'.repeat(w - f) + ']';
}
function fmtEta(rem, rps) {
  if (!rps) return '?';
  const s = Math.round(rem / rps);
  if (s < 60) return `${s}s`;
  if (s < 3600) return `${Math.floor(s/60)}m${s%60}s`;
  return `${Math.floor(s/3600)}h${Math.floor((s%3600)/60)}m`;
}

async function fetchWithRetry(url) {
  for (let i = 1; i <= MAX_RETRIES; i++) {
    try {
      const res = await fetch(url, { signal: AbortSignal.timeout(60_000) });
      if (res.ok) return res.json();
      if (res.status < 500) throw new Error(`HTTP ${res.status} (fatal)`);
      throw new Error(`HTTP ${res.status}`);
    } catch (err) {
      if (i === MAX_RETRIES) throw err;
      const wait = i * 3000;
      process.stdout.write(`\n⚠️  retry ${i}/${MAX_RETRIES} (${err.message}) wait ${wait/1000}s...`);
      await new Promise(r => setTimeout(r, wait));
    }
  }
}

// ── BigQuery Load Job ─────────────────────────────────────────────────────────
const bq = new BigQuery({ projectId: PROJECT_ID, credentials });
const bqTable = bq.dataset(DATASET_ID).table('traffy_complaints');

function createLoadJobAsync(table, source, metadata) {
  return new Promise((resolve, reject) => {
    table.createLoadJob(source, metadata, (err, job) => {
      if (err) reject(err);
      else resolve(job);
    });
  });
}

async function flushToBigQuery(records) {
  if (records.length === 0) return;
  const tmpFile = resolve(tmpdir(), `traffy_batch_${Date.now()}.jsonl`);
  const jsonl = records.map(r => JSON.stringify(r)).join('\n');
  writeFileSync(tmpFile, jsonl, 'utf-8');

  try {
    const job = await createLoadJobAsync(bqTable, tmpFile, {
      sourceFormat: 'NEWLINE_DELIMITED_JSON',
      writeDisposition: 'WRITE_APPEND',
    });
    // Poll until done
    while (true) {
      const [meta] = await job.getMetadata();
      if (meta.status.state === 'DONE') {
        if (meta.status.errorResult) throw new Error(meta.status.errorResult.message);
        break;
      }
      await new Promise(r => setTimeout(r, 2000));
    }
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

// ── Main ──────────────────────────────────────────────────────────────────────
let offset      = parseInt(process.argv[2] || '0');
let totalRec    = 0;
let totalLoaded = 0;
let batchNum    = 0;
let buffer      = [];
const startTime = Date.now();

console.log(`\n🚀 Traffy → BigQuery Load Jobs  (${PROJECT_ID}.${DATASET_ID}.traffy_complaints)`);
console.log(`   fetch_batch=${FETCH_BATCH}, load_every=${LOAD_EVERY}, retry=${MAX_RETRIES}x`);
console.log(`📍 เริ่มที่ offset = ${fmt(offset)}\n`);

async function flushBuffer(force = false) {
  if (buffer.length === 0) return;
  if (!force && buffer.length < LOAD_EVERY) return;

  process.stdout.write(`\n📤 Loading ${fmt(buffer.length)} records to BigQuery...`);
  const t = Date.now();
  await flushToBigQuery(buffer);
  totalLoaded += buffer.length;
  buffer = [];
  process.stdout.write(` done (${Date.now()-t}ms)\n`);
}

while (true) {
  // Fetch one batch from Traffy API
  let data;
  try {
    data = await fetchWithRetry(`${TRAFFY_API}?limit=${FETCH_BATCH}&offset=${offset}`);
  } catch (err) {
    await flushBuffer(true);
    const waitSec = 60;
    process.stdout.write(`\n⏳ API error at offset ${fmt(offset)}: ${err.message} — รอ ${waitSec}s แล้วลองใหม่...\n`);
    await new Promise(r => setTimeout(r, waitSec * 1000));
    continue;
  }

  const total   = data.total ?? data.count ?? 0;
  const results = data.results ?? [];
  if (totalRec === 0) totalRec = total;

  if (results.length === 0) {
    await flushBuffer(true);
    console.log('\n✅ ดึงข้อมูลครบแล้ว!');
    break;
  }

  buffer.push(...results.map(transform).filter(r => r.ticket_id));
  offset += results.length;
  batchNum++;

  // Flush when buffer hits threshold
  await flushBuffer(false);

  const elapsed = (Date.now() - startTime) / 1000;
  const pct = totalRec > 0 ? Math.min(100, (offset / totalRec) * 100) : 0;
  const rps = offset / elapsed;

  process.stdout.write(
    `\r${bar(pct)} ${pct.toFixed(1)}%  ` +
    `fetched=${fmt(offset)}  loaded=${fmt(totalLoaded)}  ` +
    `${Math.round(rps)} rec/s  ETA: ${fmtEta(totalRec - offset, rps)}  ` +
    `buf=${fmt(buffer.length)}   `
  );

  if (results.length < FETCH_BATCH || offset >= totalRec) {
    await flushBuffer(true);
    const elapsed2 = (Date.now() - startTime) / 1000;
    console.log(`\n\n✅ เสร็จ! loaded ${fmt(totalLoaded)} records ใน ${Math.round(elapsed2)}s`);
    break;
  }
}
