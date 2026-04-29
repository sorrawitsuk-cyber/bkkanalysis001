import { createClient } from '@supabase/supabase-js';
import dotenv from 'dotenv';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: path.join(__dirname, '..', '.env.local') });

const supabase = createClient(
  process.env.NEXT_PUBLIC_SUPABASE_URL,
  process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY
);

// ===================== Config =====================
const BATCH_SIZE = 1000;       // Traffy API hard limit per request
const MAX_BATCHES = 50;        // 50 x 1000 = 50,000 records
const DELAY_MS = 2000;         // Delay between batches to be nice to the API
const TRAFFY_API = 'https://publicapi.traffy.in.th/share/teamchadchart/search';

// ===================== District mapping =====================
const DISTRICT_NAMES = [
  'พระนคร','ดุสิต','หนองจอก','บางรัก','บางเขน','บางกะปิ','ปทุมวัน','ป้อมปราบศัตรูพ่าย',
  'พระโขนง','มีนบุรี','ลาดกระบัง','ยานนาวา','สัมพันธวงศ์','พญาไท','ธนบุรี','บางกอกใหญ่',
  'ห้วยขวาง','คลองสาน','ตลิ่งชัน','บางกอกน้อย','บางขุนเทียน','ภาษีเจริญ','หนองแขม','ราษฎร์บูรณะ',
  'บางพลัด','ดินแดง','บึงกุ่ม','สาทร','บางซื่อ','จตุจักร','บางคอแหลม','ประเวศ','คลองเตย',
  'สวนหลวง','จอมทอง','ดอนเมือง','ราชเทวี','ลาดพร้าว','วัฒนา','บางแค','หลักสี่','สายไหม',
  'คันนายาว','สะพานสูง','วังทองหลาง','คลองสามวา','บางนา','ทวีวัฒนา','ทุ่งครุ','บางบอน'
].sort((a, b) => b.length - a.length);

const DISTRICT_GROUPS = {
  'กลุ่มกรุงเทพเหนือ': ['ดอนเมือง','หลักสี่','สายไหม','บางเขน','จตุจักร','ลาดพร้าว','บึงกุ่ม'],
  'กลุ่มกรุงเทพกลาง': ['พระนคร','ดุสิต','ป้อมปราบศัตรูพ่าย','สัมพันธวงศ์','ปทุมวัน','ราชเทวี','พญาไท','ดินแดง','ห้วยขวาง','วังทองหลาง'],
  'กลุ่มกรุงเทพตะวันออก': ['มีนบุรี','คลองสามวา','หนองจอก','ลาดกระบัง','สะพานสูง','คันนายาว','บางกะปิ'],
  'กลุ่มกรุงเทพใต้': ['สาทร','บางรัก','ยานนาวา','บางคอแหลม','วัฒนา','คลองเตย','พระโขนง','สวนหลวง','ประเวศ','บางนา'],
  'กลุ่มกรุงธนเหนือ': ['บางพลัด','บางกอกน้อย','ตลิ่งชัน','ทวีวัฒนา','ธนบุรี','คลองสาน','บางกอกใหญ่'],
  'กลุ่มกรุงธนใต้': ['ภาษีเจริญ','หนองแขม','บางแค','บางบอน','จอมทอง','ราษฎร์บูรณะ','ทุ่งครุ','บางขุนเทียน']
};

const PROBLEM_KEYWORDS = [
  ['ถนน/จราจร', ['ถนน','จราจร','รถ','ขับ','จอด','สัญญาณไฟ','เลน','สะพาน','หลุม','บ่อ','พื้นถนน','ยุบ','ชำรุด']],
  ['ทางเท้า', ['ทางเท้า','ฟุตบาท','กระเบื้อง','บล็อก','เดินเท้า','ทางข้าม','ทางม้าลาย']],
  ['ความสะอาด/ขยะ', ['ขยะ','ถังขยะ','เก็บขยะ','สกปรก','เหม็น','ทิ้งขยะ','ซาก','กลิ่น']],
  ['น้ำท่วม/ระบายน้ำ', ['น้ำท่วม','ท่วม','ระบายน้ำ','ท่อ','คลอง','ฝาท่อ','บ่อพัก','น้ำขัง','น้ำเน่า']],
  ['ไฟฟ้า/แสงสว่าง', ['ไฟฟ้า','แสงสว่าง','โคมไฟ','หลอดไฟ','เสาไฟ','สายไฟ','มืด']],
  ['ต้นไม้/สวน', ['ต้นไม้','กิ่งไม้','ใบไม้','หญ้า','สวน','ตัดต้นไม้','ปลูก','พุ่มไม้']],
  ['สัตว์จรจัด', ['สุนัข','แมว','หมา','จรจัด','สัตว์','งู','คลอด']],
  ['เสียงรบกวน', ['เสียง','รบกวน','ดัง','เพลง','คาราโอเกะ']],
  ['ก่อสร้าง/อาคาร', ['ก่อสร้าง','อาคาร','สร้าง','รื้อ','ต่อเติม']],
];

function extractDistrict(address) {
  if (!address) return 'ไม่ระบุ';
  for (const d of DISTRICT_NAMES) {
    if (address.includes(d) || address.includes(`เขต${d}`)) return d;
  }
  return 'ไม่ระบุ';
}

function getDistrictGroup(district) {
  for (const [group, districts] of Object.entries(DISTRICT_GROUPS)) {
    if (districts.includes(district)) return group;
  }
  return 'ไม่ระบุ';
}

function classifyProblem(desc) {
  if (!desc) return 'อื่นๆ';
  for (const [cat, keywords] of PROBLEM_KEYWORDS) {
    for (const kw of keywords) {
      if (desc.includes(kw)) return cat;
    }
  }
  return 'อื่นๆ';
}

function sleep(ms) {
  return new Promise(resolve => setTimeout(resolve, ms));
}

// ===================== Main ETL =====================
async function main() {
  const isIncremental = process.argv.includes('--incremental');

  console.log('🚀 Traffy Fondue ETL Pipeline');
  console.log(`   Mode: ${isIncremental ? 'INCREMENTAL (new records only)' : 'FULL (up to ' + (MAX_BATCHES * BATCH_SIZE).toLocaleString() + ' records)'}`);
  console.log(`   Target: Supabase (${process.env.NEXT_PUBLIC_SUPABASE_URL})`);
  console.log('');

  let totalInserted = 0;
  let totalSkipped = 0;
  let batchNum = 0;

  for (let offset = 0; offset < MAX_BATCHES * BATCH_SIZE; offset += BATCH_SIZE) {
    batchNum++;
    process.stdout.write(`📦 Batch ${batchNum}/${MAX_BATCHES} (offset=${offset})... `);

    try {
      const res = await fetch(`${TRAFFY_API}?limit=${BATCH_SIZE}&offset=${offset}`);
      if (!res.ok) {
        console.log(`❌ HTTP ${res.status} — stopping.`);
        break;
      }

      let data;
      try {
        data = await res.json();
      } catch (e) {
        console.log(`❌ JSON parse error (likely timeout at high offset) — stopping.`);
        break;
      }

      if (!data?.results || data.results.length === 0) {
        console.log('✅ No more records. Done.');
        break;
      }

      // Transform
      const rows = data.results
        .filter(r => r.coords && r.coords.length === 2)
        .map(r => {
          let lon = parseFloat(r.coords[0]);
          let lat = parseFloat(r.coords[1]);
          if (lat > 80 && lat < 120 && lon > 10 && lon < 20) [lon, lat] = [lat, lon];

          const district = extractDistrict(r.address);
          const problemType = (r.problem_type_abdul?.[0] && r.problem_type_abdul[0] !== '')
            ? r.problem_type_abdul[0]
            : classifyProblem(r.description);

          return {
            ticket_id: r.ticket_id,
            district,
            district_group: getDistrictGroup(district),
            problem_type: problemType,
            state: r.state || 'ไม่ระบุ',
            description: (r.description || '').substring(0, 500),
            address: r.address || '',
            lon,
            lat,
            photo_url: r.photo_url || '',
            org: r.org || '',
            created_at: r.timestamp || null
          };
        });

      // Upsert to Supabase (batch of 1000)
      const { data: upserted, error } = await supabase
        .from('traffy_complaints')
        .upsert(rows, { onConflict: 'ticket_id', ignoreDuplicates: false });

      if (error) {
        console.log(`⚠️ Supabase error: ${error.message}`);
        totalSkipped += rows.length;
      } else {
        totalInserted += rows.length;
        console.log(`✅ ${rows.length} records upserted (total: ${totalInserted.toLocaleString()})`);
      }

      // Delay to be respectful to Traffy API
      if (batchNum < MAX_BATCHES) {
        await sleep(DELAY_MS);
      }

    } catch (err) {
      console.log(`❌ Exception: ${err.message} — stopping.`);
      break;
    }
  }

  console.log('');
  console.log('═══════════════════════════════════════');
  console.log(`✅ ETL Complete!`);
  console.log(`   Inserted/Updated: ${totalInserted.toLocaleString()} records`);
  console.log(`   Skipped/Errors:   ${totalSkipped.toLocaleString()} records`);
  console.log('═══════════════════════════════════════');

  // Verify count
  const { count } = await supabase.from('traffy_complaints').select('*', { count: 'exact', head: true });
  console.log(`📊 Total records in Supabase: ${count?.toLocaleString() || 'unknown'}`);
}

main().catch(console.error);
