import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';
import { timingSafeEqual } from 'node:crypto';

export const dynamic = 'force-dynamic';

const TRAFFY_API = 'https://publicapi.traffy.in.th/share/teamchadchart/search';
const DEFAULT_BATCH_SIZE = 500;
const MAX_BATCH_SIZE = 1000;
const NO_STORE_HEADERS = { 'Cache-Control': 'no-store, max-age=0' };

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

function jsonNoStore(body: unknown, init: ResponseInit = {}) {
  const headers = new Headers(init.headers);
  headers.set('Cache-Control', NO_STORE_HEADERS['Cache-Control']);
  return NextResponse.json(body, { ...init, headers });
}

function getAllowedSecrets() {
  return [process.env.TRAFFY_INGEST_SECRET, process.env.CRON_SECRET]
    .filter((secret): secret is string => Boolean(secret));
}

function safeSecretEquals(candidate: string, expected: string) {
  const candidateBuffer = Buffer.from(candidate);
  const expectedBuffer = Buffer.from(expected);
  return candidateBuffer.length === expectedBuffer.length
    && timingSafeEqual(candidateBuffer, expectedBuffer);
}

function getRequestSecret(request: Request, searchParams: URLSearchParams) {
  const authHeader = request.headers.get('authorization') || '';
  const bearerMatch = authHeader.match(/^Bearer\s+(.+)$/i);
  return bearerMatch?.[1]
    || request.headers.get('x-traffy-ingest-secret')
    || request.headers.get('x-cron-secret')
    || searchParams.get('secret')
    || searchParams.get('cronSecret')
    || '';
}

function isAuthorized(request: Request, searchParams: URLSearchParams) {
  const allowedSecrets = getAllowedSecrets();
  if (allowedSecrets.length === 0) return { ok: false, reason: 'missing-secret' as const };

  const requestSecret = getRequestSecret(request, searchParams);
  if (!requestSecret) return { ok: false, reason: 'unauthorized' as const };

  return {
    ok: allowedSecrets.some(secret => safeSecretEquals(requestSecret, secret)),
    reason: 'unauthorized' as const,
  };
}

function parseNonNegativeInt(value: string | null, fallback: number) {
  if (value == null || value === '') return fallback;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

function parseBatchSize(value: string | null) {
  const parsed = parseNonNegativeInt(value, DEFAULT_BATCH_SIZE);
  if (parsed == null || parsed <= 0) return null;
  return Math.min(parsed, MAX_BATCH_SIZE);
}

function transformRecord(item: any) {
  let lon: number | null = null;
  let lat: number | null = null;
  if (Array.isArray(item.coords) && item.coords.length === 2) {
    let c0 = parseFloat(item.coords[0]);
    let c1 = parseFloat(item.coords[1]);
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
    lon,
    lat,
    photo_url:      item.photo_url || null,
    org:            item.org || null,
    // BigQuery TIMESTAMP requires ISO string
    created_at:     item.timestamp ? new Date(item.timestamp).toISOString() : null,
  };
}

export async function GET(request: Request) {
  const t0 = Date.now();
  const { searchParams } = new URL(request.url);

  const auth = isAuthorized(request, searchParams);
  if (!auth.ok) {
    const status = auth.reason === 'missing-secret' ? 503 : 401;
    const error = auth.reason === 'missing-secret' ? 'Ingest secret not configured' : 'Unauthorized';
    return jsonNoStore({ error }, { status });
  }

  if (!process.env.BQ_PROJECT_ID || !process.env.BQ_DATASET || !process.env.BQ_CREDENTIALS) {
    return jsonNoStore({ error: 'BQ env vars not set' }, { status: 503 });
  }

  const start = parseNonNegativeInt(searchParams.get('start'), 0);
  const batchSize = parseBatchSize(searchParams.get('batchSize'));
  if (start == null || batchSize == null) {
    return jsonNoStore({ error: 'Invalid start or batchSize' }, { status: 400 });
  }

  try {
    let credentials: any;
    try { credentials = JSON.parse(process.env.BQ_CREDENTIALS); }
    catch { return jsonNoStore({ error: 'BQ_CREDENTIALS invalid JSON' }, { status: 503 }); }

    // 1. Fetch one batch from Traffy API
    const res = await fetch(`${TRAFFY_API}?limit=${batchSize}&start=${start}`, {
      cache: 'no-store',
      signal: AbortSignal.timeout(30_000),
    });
    if (!res.ok) throw new Error(`Traffy API responded ${res.status}`);

    const data     = await res.json();
    const total: number  = data.total ?? data.count ?? 0;
    const results: any[] = data.results ?? [];

    if (results.length === 0) {
      return jsonNoStore({
        start, batchSize, fetched: 0, inserted: 0, upserted: 0, total,
        nextStart: start, done: true, elapsed: Date.now() - t0,
      });
    }

    // 2. Transform
    const records = results.map(transformRecord).filter(r => r.ticket_id);

    // 3. Insert to BigQuery via streaming inserts
    // Note: streaming inserts are charged ($0.01/200 MB) but suitable for web-triggered ingestion.
    // For bulk historical loads, use scripts/ingest-traffy-bq.mjs (Load Jobs — free tier).
    const bq    = new BigQuery({ projectId: process.env.BQ_PROJECT_ID, credentials });
    const table = bq.dataset(process.env.BQ_DATASET || '').table('traffy_complaints');

    await table.insert(records, { skipInvalidRows: true, ignoreUnknownValues: true });

    const nextStart = start + results.length;
    const done = results.length < batchSize || nextStart >= total;

    return jsonNoStore({
      start, batchSize,
      fetched:   results.length,
      inserted:  records.length,
      upserted:  records.length,
      total, nextStart, done,
      elapsed:   Date.now() - t0,
    });

  } catch (err: any) {
    // BigQuery streaming may return partial errors — treat as non-fatal if most rows inserted
    if (err?.name === 'PartialFailureError') {
      const failed = err.errors?.length ?? 0;
      console.warn(`⚠️ /api/traffy/ingest: ${failed} rows rejected by BigQuery (duplicates or schema mismatch)`);
      const nextStart = start + batchSize;
      return jsonNoStore({
        start, batchSize, total: 0, nextStart,
        done: false, warning: `${failed} rows skipped`,
        elapsed: Date.now() - t0,
      });
    }
    console.error('❌ /api/traffy/ingest (BigQuery):', err);
    return jsonNoStore({ error: String(err), start, nextStart: start, done: false }, { status: 500 });
  }
}
