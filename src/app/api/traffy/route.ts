import { NextResponse } from 'next/server';
import { createClient } from '@supabase/supabase-js';

export const dynamic = 'force-dynamic';

// District/problem classification (used only for live fallback)
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
function extractDistrict(addr: string) { if (!addr) return 'ไม่ระบุ'; for (const d of DISTRICT_NAMES) { if (addr.includes(d)) return d; } return 'ไม่ระบุ'; }
function getDistrictGroup(d: string) { for (const [g, ds] of Object.entries(DISTRICT_GROUPS)) { if (ds.includes(d)) return g; } return 'ไม่ระบุ'; }
function classifyProblem(desc: string) { if (!desc) return 'อื่นๆ'; for (const [c, kws] of PROBLEM_KEYWORDS) { for (const k of kws) { if (desc.includes(k)) return c; } } return 'อื่นๆ'; }

export async function GET(request: Request) {
  try {
    // Create Supabase client at request time (ensures env vars are loaded)
    const supabase = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL || '',
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY || ''
    );

    const { searchParams } = new URL(request.url);
    const districtFilter = searchParams.get('district');
    const categoryFilter = searchParams.get('category');
    const districtGroupFilter = searchParams.get('district_group');

    // Call the optimized RPC function that handles all filtering and aggregation in Postgres
    console.log(`📊 Calling RPC get_filtered_dashboard (district=${districtFilter}, category=${categoryFilter}, group=${districtGroupFilter})`);
    
    const { data: rpcData, error: rpcError } = await supabase.rpc('get_filtered_dashboard', {
      p_district: districtFilter,
      p_problem_type: categoryFilter,
      p_district_group: districtGroupFilter
    });

    if (rpcError) {
      console.error('RPC Error:', rpcError);
      // Fallback if RPC doesn't exist yet
      if (rpcError.message.includes('function get_filtered_dashboard() does not exist') || rpcError.code === '42883') {
         return NextResponse.json({ error: 'PLEASE_RUN_RPC_SQL', message: 'Please run the SQL in supabase/statistics_rpc.sql in the Supabase Dashboard.' }, { status: 501 });
      }
      throw new Error(`RPC Failed: ${rpcError.message}`);
    }

    if (rpcData && rpcData.summary) {
      // Build GeoJSON from returned points
      const features = (rpcData.points || [])
        .filter((r: any) => r.lon && r.lat)
        .map((r: any) => ({
          type: "Feature",
          properties: { ticket_id: r.ticket_id, district: r.district, problem_type: r.problem_type, state: r.state, description: r.description, address: r.address, photo_url: r.photo_url, org: r.org, timestamp: r.created_at },
          geometry: { type: "Point", coordinates: [r.lon, r.lat] }
        }));

      // Format summary exactly as expected by the frontend
      const byState: Record<string, number> = {};
      (rpcData.summary.byState || []).forEach((r: any) => { byState[r.state] = r.count; });

      return NextResponse.json({
        source: 'supabase',
        geojson: { type: "FeatureCollection", features },
        summary: {
          totalApi: rpcData.summary.totalApi,
          totalFetched: features.length,
          byState,
          byType: (rpcData.summary.byType || []).map((r: any) => [r.problem_type, r.count]),
          byDistrict: (rpcData.summary.byDistrict || []).map((r: any) => [r.district, r.total]),
          byDistrictGroup: (rpcData.summary.byGroup || []).map((r: any) => [r.district_group, r.total]),
          dailyTrend: (rpcData.summary.dailyTrend || []).map((r: any) => [r.day, r.count]),
        }
      });
    }

    // ===== 2. Fallback: Live Traffy API (slow path) =====
    console.log('⚠️ Supabase empty — falling back to live Traffy API');
    const limit = 1000;
    const response = await fetch(`https://publicapi.traffy.in.th/share/teamchadchart/search?limit=${limit}`);
    if (!response.ok) throw new Error(`Traffy: ${response.status}`);
    const data = await response.json();
    if (!data?.results) throw new Error("Invalid Traffy response");

    const features: any[] = [];
    const byMonth: Record<string, number> = {};
    const byYear: Record<string, number> = {};
    const byDistrict: Record<string, number> = {};
    const byDistrictGroup: Record<string, number> = {};
    const byType: Record<string, number> = {};
    const byState: Record<string, number> = {};
    const dailyTrend: Record<string, number> = {};

    for (const item of data.results) {
      if (!item.coords || item.coords.length !== 2) continue;
      let lon = parseFloat(item.coords[0]), lat = parseFloat(item.coords[1]);
      if (lat > 80 && lat < 120 && lon > 10 && lon < 20) [lon, lat] = [lat, lon];
      if (lon < 99 || lon > 101 || lat < 13 || lat > 14.2) continue;

      const district = extractDistrict(item.address);
      const districtGroup = getDistrictGroup(district);
      const problemType = (item.problem_type_abdul?.[0] && item.problem_type_abdul[0] !== '') ? item.problem_type_abdul[0] : classifyProblem(item.description);
      const state = item.state || 'ไม่ระบุ';
      const ts = item.timestamp ? new Date(item.timestamp) : null;

      if (ts) {
        const mk = `${ts.getFullYear()}-${String(ts.getMonth()+1).padStart(2,'0')}`;
        byMonth[mk] = (byMonth[mk]||0)+1;
        byYear[String(ts.getFullYear())] = (byYear[String(ts.getFullYear())]||0)+1;
        dailyTrend[`${ts.getMonth()+1}/${ts.getDate()}`] = (dailyTrend[`${ts.getMonth()+1}/${ts.getDate()}`]||0)+1;
      }
      byDistrict[district] = (byDistrict[district]||0)+1;
      byDistrictGroup[districtGroup] = (byDistrictGroup[districtGroup]||0)+1;
      byType[problemType] = (byType[problemType]||0)+1;
      byState[state] = (byState[state]||0)+1;

      features.push({
        type: "Feature",
        properties: { ticket_id: item.ticket_id, description: item.description, address: item.address, state, photo_url: item.photo_url, timestamp: item.timestamp, problem_type: problemType, district, district_group: districtGroup, org: item.org },
        geometry: { type: "Point", coordinates: [lon, lat] }
      });
    }

    const sortDesc = (o: Record<string,number>) => Object.entries(o).sort((a,b)=>b[1]-a[1]);
    const sortByKey = (o: Record<string,number>) => Object.entries(o).sort((a,b)=>a[0].localeCompare(b[0]));

    return NextResponse.json({
      source: 'live_api',
      geojson: { type: "FeatureCollection", features },
      summary: {
        totalApi: data.total,
        totalFetched: features.length,
        byState,
        byType: sortDesc(byType).slice(0,10),
        byDistrict: sortDesc(byDistrict).slice(0,50),
        byDistrictGroup: sortDesc(byDistrictGroup),
        byMonth: sortByKey(byMonth).slice(-12),
        byYear: sortByKey(byYear),
        dailyTrend: Object.entries(dailyTrend).slice(-30),
      }
    });

  } catch (err) {
    console.error("🔴 /api/traffy:", err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
