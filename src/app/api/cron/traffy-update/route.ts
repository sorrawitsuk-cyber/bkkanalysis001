import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';
import { writeFileSync, unlinkSync } from 'fs';
import { tmpdir } from 'os';
import { resolve } from 'path';

export const dynamic = 'force-dynamic';
export const maxDuration = 10;

const TRAFFY_API  = 'https://publicapi.traffy.in.th/share/teamchadchart/search';
const NEW_COUNT   = 1_000;   // ~4s fetch
const DEEP_COUNT  = 1_000;   // ~4s fetch  → total ~8-9s within Hobby 10s limit
const BATCH       = 500;
const ANCHOR_MS   = Date.UTC(2026, 0, 1);

const DISTRICT_NAMES = [
  'พระนคร','ดุสิต','หนองจอก','บางรัก','บางเขน','บางกะปิ','ปทุมวัน','ป้อมปราบศัตรูพ่าย',
  'พระโขนง','มีนบุรี','ลาดกระบัง','ยานนาวา','สัมพันธวงศ์','พญาไท','ธนบุรี','บางกอกใหญ่',
  'ห้วยขวาง','คลองสาน','ตลิ่งชัน','บางกอกน้อย','บางขุนเทียน','ภาษีเจริญ','หนองแขม','ราษฎร์บูรณะ',
  'บางพลัด','ดินแดง','บึงกุ่ม','สาทร','บางซื่อ','จตุจักร','บางคอแหลม','ประเวศ','คลองเตย',
  'สวนหลวง','จอมทอง','ดอนเมือง','ราชเทวี','ลาดพร้าว','วัฒนา','บางแค','หลักสี่','สายไหม',
  'คันนายาว','สะพานสูง','วังทองหลาง','คลองสามวา','บางนา','ทวีวัฒนา','ทุ่งครุ','บางบอน',
].sort((a, b) => b.length - a.length);

const DISTRICT_GROUPS: Record<string, string[]> = {
  'กลุ่มกรุงเทพเหนือ':    ['ดอนเมือง','หลักสี่','สายไหม','บางเขน','จตุจักร','ลาดพร้าว','บึงกุ่ม'],
  'กลุ่มกรุงเทพกลาง':     ['พระนคร','ดุสิต','ป้อมปราบศัตรูพ่าย','สัมพันธวงศ์','ปทุมวัน','ราชเทวี','พญาไท','ดินแดง','ห้วยขวาง','วังทองหลาง'],
  'กลุ่มกรุงเทพตะวันออก': ['มีนบุรี','คลองสามวา','หนองจอก','ลาดกระบัง','สะพานสูง','คันนายาว','บางกะปิ'],
  'กลุ่มกรุงเทพใต้':      ['สาทร','บางรัก','ยานนาวา','บางคอแหลม','วัฒนา','คลองเตย','พระโขนง','สวนหลวง','ประเวศ','บางนา'],
  'กลุ่มกรุงธนเหนือ':     ['บางพลัด','บางกอกน้อย','ตลิ่งชัน','ทวีวัฒนา','ธนบุรี','คลองสาน','บางกอกใหญ่'],
  'กลุ่มกรุงธนใต้':       ['ภาษีเจริญ','หนองแขม','บางแค','บางบอน','จอมทอง','ราษฎร์บูรณะ','ทุ่งครุ','บางขุนเทียน'],
};

const PROBLEM_KEYWORDS: [string, string[]][] = [
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

function extractDistrict(addr: string) {
  if (!addr) return 'ไม่ระบุ';
  for (const d of DISTRICT_NAMES) { if (addr.includes(d)) return d; }
  return 'ไม่ระบุ';
}
function getDistrictGroup(d: string) {
  for (const [g, ds] of Object.entries(DISTRICT_GROUPS)) { if (ds.includes(d)) return g; }
  return 'ไม่ระบุ';
}
function classifyProblem(desc: string) {
  if (!desc) return 'อื่นๆ';
  for (const [c, kws] of PROBLEM_KEYWORDS) { for (const k of kws) { if (desc.includes(k)) return c; } }
  return 'อื่นๆ';
}

function transform(item: any, ingestedAt: string) {
  let lon: number | null = null, lat: number | null = null;
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

async function fetchRange(startOffset: number, count: number, ingestedAt: string) {
  const records: any[] = [];
  let offset = startOffset;
  while (records.length < count) {
    const limit = Math.min(BATCH, count - records.length);
    const res   = await fetch(`${TRAFFY_API}?limit=${limit}&offset=${offset}`, { signal: AbortSignal.timeout(25_000) });
    if (!res.ok) throw new Error(`Traffy API HTTP ${res.status}`);
    const data    = await res.json();
    const results = data.results ?? [];
    if (results.length === 0) break;
    records.push(...results.map((r: any) => transform(r, ingestedAt)).filter((r: any) => r.ticket_id));
    offset += results.length;
    if (results.length < limit) break;
  }
  return records;
}

async function loadToBigQuery(bq: BigQuery, records: any[]) {
  if (records.length === 0) return;
  const tmpFile = resolve(tmpdir(), `traffy_cron_${Date.now()}.jsonl`);
  writeFileSync(tmpFile, records.map(r => JSON.stringify(r)).join('\n'), 'utf-8');
  try {
    await new Promise<void>((resolve, reject) => {
      bq.dataset(process.env.BQ_DATASET!).table('traffy_complaints').createLoadJob(tmpFile, {
        sourceFormat: 'NEWLINE_DELIMITED_JSON',
        writeDisposition: 'WRITE_APPEND',
        location: 'asia-southeast1',
      }, (err: any, job: any) => {
        if (err) return reject(err);
        const poll = setInterval(async () => {
          const [meta] = await job.getMetadata();
          if (meta.status.state === 'DONE') {
            clearInterval(poll);
            if (meta.status.errorResult) reject(new Error(meta.status.errorResult.message));
            else resolve();
          }
        }, 3000);
      });
    });
  } finally {
    try { unlinkSync(tmpFile); } catch {}
  }
}

export async function GET(request: Request) {
  // Allow Vercel cron (Authorization: Bearer <CRON_SECRET>) or explicit secret param
  const authHeader = request.headers.get('authorization');
  const cronSecret = process.env.CRON_SECRET;
  if (cronSecret && authHeader !== `Bearer ${cronSecret}`) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
  }

  if (!process.env.BQ_PROJECT_ID || !process.env.BQ_DATASET || !process.env.BQ_CREDENTIALS) {
    return NextResponse.json({ error: 'BQ env vars not set' }, { status: 503 });
  }

  const t0 = Date.now();
  const ingestedAt = new Date().toISOString();
  const dayNum = Math.floor((Date.now() - ANCHOR_MS) / 86_400_000);

  try {
    let credentials: any;
    try { credentials = JSON.parse(process.env.BQ_CREDENTIALS); }
    catch { return NextResponse.json({ error: 'BQ_CREDENTIALS invalid JSON' }, { status: 503 }); }

    const bq = new BigQuery({ projectId: process.env.BQ_PROJECT_ID, credentials });

    // Get total count
    const firstPage = await fetch(`${TRAFFY_API}?limit=1&offset=0`).then(r => r.json());
    const apiTotal: number = firstPage.total ?? 1_300_000;

    // Tier 1: newest 5,000 records
    const tier1 = await fetchRange(0, NEW_COUNT, ingestedAt);

    // Tier 2: rotating deep scan
    const totalChunks = Math.ceil(apiTotal / DEEP_COUNT);
    const chunkIndex  = dayNum % totalChunks;
    const deepStart   = chunkIndex * DEEP_COUNT < NEW_COUNT ? NEW_COUNT : chunkIndex * DEEP_COUNT;
    const tier2 = await fetchRange(deepStart, DEEP_COUNT, ingestedAt);

    // Dedup within this batch
    const seen = new Set<string>();
    const all  = [...tier1, ...tier2].filter(r => {
      if (seen.has(r.ticket_id)) return false;
      seen.add(r.ticket_id); return true;
    });

    await loadToBigQuery(bq, all);

    return NextResponse.json({
      ok: true,
      ingestedAt,
      apiTotal,
      tier1: tier1.length,
      tier2: tier2.length,
      total: all.length,
      deepChunk: `${chunkIndex + 1}/${totalChunks}`,
      elapsed: Date.now() - t0,
    });

  } catch (err: any) {
    console.error('🔴 /api/cron/traffy-update:', err);
    return NextResponse.json({ error: String(err), elapsed: Date.now() - t0 }, { status: 500 });
  }
}
