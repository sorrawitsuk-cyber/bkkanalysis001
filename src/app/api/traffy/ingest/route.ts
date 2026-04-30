import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

const TRAFFY_API = 'https://publicapi.traffy.in.th/share/teamchadchart/search';
const UPSERT_CHUNK = 200;

const DISTRICT_NAMES = [
  'พระนคร','ดุสิต','หนองจอก','บางรัก','บางเขน','บางกะปิ','ปทุมวัน','ป้อมปราบศัตรูพ่าย',
  'พระโขนง','มีนบุรี','ลาดกระบัง','ยานนาวา','สัมพันธวงศ์','พญาไท','ธนบุรี','บางกอกใหญ่',
  'ห้วยขวาง','คลองสาน','ตลิ่งชัน','บางกอกน้อย','บางขุนเทียน','ภาษีเจริญ','หนองแขม','ราษฎร์บูรณะ',
  'บางพลัด','ดินแดง','บึงกุ่ม','สาทร','บางซื่อ','จตุจักร','บางคอแหลม','ประเวศ','คลองเตย',
  'สวนหลวง','จอมทอง','ดอนเมือง','ราชเทวี','ลาดพร้าว','วัฒนา','บางแค','หลักสี่','สายไหม',
  'คันนายาว','สะพานสูง','วังทองหลาง','คลองสามวา','บางนา','ทวีวัฒนา','ทุ่งครุ','บางบอน'
].sort((a, b) => b.length - a.length);

const DISTRICT_GROUPS: Record<string, string[]> = {
  'กลุ่มกรุงเทพเหนือ': ['ดอนเมือง','หลักสี่','สายไหม','บางเขน','จตุจักร','ลาดพร้าว','บึงกุ่ม'],
  'กลุ่มกรุงเทพกลาง': ['พระนคร','ดุสิต','ป้อมปราบศัตรูพ่าย','สัมพันธวงศ์','ปทุมวัน','ราชเทวี','พญาไท','ดินแดง','ห้วยขวาง','วังทองหลาง'],
  'กลุ่มกรุงเทพตะวันออก': ['มีนบุรี','คลองสามวา','หนองจอก','ลาดกระบัง','สะพานสูง','คันนายาว','บางกะปิ'],
  'กลุ่มกรุงเทพใต้': ['สาทร','บางรัก','ยานนาวา','บางคอแหลม','วัฒนา','คลองเตย','พระโขนง','สวนหลวง','ประเวศ','บางนา'],
  'กลุ่มกรุงธนเหนือ': ['บางพลัด','บางกอกน้อย','ตลิ่งชัน','ทวีวัฒนา','ธนบุรี','คลองสาน','บางกอกใหญ่'],
  'กลุ่มกรุงธนใต้': ['ภาษีเจริญ','หนองแขม','บางแค','บางบอน','จอมทอง','ราษฎร์บูรณะ','ทุ่งครุ','บางขุนเทียน']
};

const PROBLEM_KEYWORDS: [string, string[]][] = [
  ['ถนน/จราจร', ['ถนน','จราจร','รถ','ขับ','จอด','สัญญาณไฟ','สะพาน','หลุม','บ่อ','พื้นถนน','ยุบ','ชำรุด']],
  ['ทางเท้า', ['ทางเท้า','ฟุตบาท','กระเบื้อง','บล็อก','เดินเท้า','ทางข้าม','ทางม้าลาย']],
  ['ความสะอาด/ขยะ', ['ขยะ','ถังขยะ','เก็บขยะ','สกปรก','เหม็น','ทิ้งขยะ','ซาก','กลิ่น']],
  ['น้ำท่วม/ระบายน้ำ', ['น้ำท่วม','ท่วม','ระบายน้ำ','ท่อ','คลอง','ฝาท่อ','น้ำขัง','น้ำเน่า']],
  ['ไฟฟ้า/แสงสว่าง', ['ไฟฟ้า','แสงสว่าง','โคมไฟ','หลอดไฟ','เสาไฟ','สายไฟ','มืด']],
  ['ต้นไม้/สวน', ['ต้นไม้','กิ่งไม้','ใบไม้','หญ้า','สวน','ตัดต้นไม้','ปลูก','พุ่มไม้']],
  ['สัตว์จรจัด', ['สุนัข','แมว','หมา','จรจัด','สัตว์','งู','คลอด']],
  ['เสียงรบกวน', ['เสียง','รบกวน','ดัง','เพลง','คาราโอเกะ']],
  ['ก่อสร้าง/อาคาร', ['ก่อสร้าง','อาคาร','สร้าง','รื้อ','ต่อเติม']],
];

function extractDistrict(addr: string): string {
  if (!addr) return 'ไม่ระบุ';
  for (const d of DISTRICT_NAMES) { if (addr.includes(d)) return d; }
  return 'ไม่ระบุ';
}

function getDistrictGroup(d: string): string {
  for (const [g, ds] of Object.entries(DISTRICT_GROUPS)) { if (ds.includes(d)) return g; }
  return 'ไม่ระบุ';
}

function classifyProblem(desc: string): string {
  if (!desc) return 'อื่นๆ';
  for (const [c, kws] of PROBLEM_KEYWORDS) { for (const k of kws) { if (desc.includes(k)) return c; } }
  return 'อื่นๆ';
}

function transformRecord(item: any) {
  let lon: number | null = null;
  let lat: number | null = null;

  if (Array.isArray(item.coords) && item.coords.length === 2) {
    let c0 = parseFloat(item.coords[0]);
    let c1 = parseFloat(item.coords[1]);
    // Swap if coords appear reversed (lat/lon instead of lon/lat)
    if (c1 > 80 && c1 < 120 && c0 > 10 && c0 < 20) { lon = c1; lat = c0; }
    else { lon = c0; lat = c1; }
    // Drop points outside Bangkok bounding box
    if (lon < 99 || lon > 101 || lat < 13 || lat > 14.2) { lon = null; lat = null; }
  }

  const district = extractDistrict(item.address || '');
  const district_group = getDistrictGroup(district);
  const problem_type =
    (item.problem_type_abdul?.[0] && item.problem_type_abdul[0] !== '')
      ? item.problem_type_abdul[0]
      : classifyProblem(item.description || '');

  return {
    ticket_id: item.ticket_id,
    district,
    district_group,
    problem_type,
    state: item.state || 'ไม่ระบุ',
    description: item.description || null,
    address: item.address || null,
    lon,
    lat,
    photo_url: item.photo_url || null,
    org: item.org || null,
    created_at: item.timestamp || null,
  };
}

export async function GET(request: Request) {
  const t0 = Date.now();
  const { searchParams } = new URL(request.url);
  const start = parseInt(searchParams.get('start') || '0');
  const batchSize = Math.min(parseInt(searchParams.get('batchSize') || '500'), 1000);

  try {
    // 1. Fetch one batch from Traffy API
    const traffyUrl = `${TRAFFY_API}?limit=${batchSize}&start=${start}`;
    const res = await fetch(traffyUrl, { signal: AbortSignal.timeout(30_000) });
    if (!res.ok) throw new Error(`Traffy API responded ${res.status}`);

    const data = await res.json();
    const total: number = data.total ?? data.count ?? 0;
    const results: any[] = data.results ?? [];

    if (results.length === 0) {
      return NextResponse.json({
        start, batchSize, fetched: 0, upserted: 0,
        total, nextStart: start, done: true,
        elapsed: Date.now() - t0,
      });
    }

    // 2. Transform
    const records = results.map(transformRecord);

    // 3. Upsert to Supabase (prefer service role key for bulk writes)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    );

    let upserted = 0;
    for (let i = 0; i < records.length; i += UPSERT_CHUNK) {
      const chunk = records.slice(i, i + UPSERT_CHUNK);
      const { error } = await supabase
        .from('traffy_complaints')
        .upsert(chunk, { onConflict: 'ticket_id' });
      if (error) throw new Error(`Supabase upsert: ${error.message}`);
      upserted += chunk.length;
    }

    const nextStart = start + results.length;
    const done = results.length < batchSize || nextStart >= total;

    return NextResponse.json({
      start,
      batchSize,
      fetched: results.length,
      upserted,
      total,
      nextStart,
      done,
      elapsed: Date.now() - t0,
    });

  } catch (err) {
    console.error('❌ /api/traffy/ingest:', err);
    return NextResponse.json(
      { error: String(err), start, nextStart: start, done: false },
      { status: 500 }
    );
  }
}
