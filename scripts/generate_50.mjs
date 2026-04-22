import fs from 'fs';
import path from 'path';

const districtNames = [
  { th: "พระนคร", en: "Phra Nakhon" }, { th: "ดุสิต", en: "Dusit" }, { th: "หนองจอก", en: "Nong Chok" },
  { th: "บางรัก", en: "Bang Rak" }, { th: "บางเขน", en: "Bang Khen" }, { th: "บางกะปิ", en: "Bang Kapi" },
  { th: "ปทุมวัน", en: "Pathum Wan" }, { th: "ป้อมปราบศัตรูพ่าย", en: "Pom Prap Sattru Phai" },
  { th: "พระโขนง", en: "Phra Khanong" }, { th: "มีนบุรี", en: "Min Buri" }, { th: "ลาดกระบัง", en: "Lat Krabang" },
  { th: "ยานนาวา", en: "Yan Nawa" }, { th: "สัมพันธวงศ์", en: "Samphanthawong" }, { th: "พญาไท", en: "Phaya Thai" },
  { th: "ธนบุรี", en: "Thon Buri" }, { th: "บางกอกใหญ่", en: "Bangkok Yai" }, { th: "ห้วยขวาง", en: "Huai Khwang" },
  { th: "คลองสาน", en: "Khlong San" }, { th: "ตลิ่งชัน", en: "Taling Chan" }, { th: "บางกอกน้อย", en: "Bangkok Noi" },
  { th: "บางขุนเทียน", en: "Bang Khun Thian" }, { th: "ภาษีเจริญ", en: "Phasi Charoen" }, { th: "หนองแขม", en: "Nong Khaem" },
  { th: "ราษฎร์บูรณะ", en: "Rat Burana" }, { th: "บางพลัด", en: "Bang Phlat" }, { th: "ดินแดง", en: "Din Daeng" },
  { th: "บึงกุ่ม", en: "Bueng Kum" }, { th: "สาทร", en: "Sathon" }, { th: "บางซื่อ", en: "Bang Sue" },
  { th: "จตุจักร", en: "Chatuchak" }, { th: "บางคอแหลม", en: "Bang Kho Laem" }, { th: "ประเวศ", en: "Prawet" },
  { th: "คลองเตย", en: "Khlong Toei" }, { th: "สวนหลวง", en: "Suan Luang" }, { th: "จอมทอง", en: "Chom Thong" },
  { th: "ดอนเมือง", en: "Don Mueang" }, { th: "ราชเทวี", en: "Ratchathewi" }, { th: "ลาดพร้าว", en: "Lat Phrao" },
  { th: "วัฒนา", en: "Watthana" }, { th: "บางแค", en: "Bang Khae" }, { th: "หลักสี่", en: "Lak Si" },
  { th: "สายไหม", en: "Sai Mai" }, { th: "คันนายาว", en: "Khan Na Yao" }, { th: "สะพานสูง", en: "Saphan Sung" },
  { th: "วังทองหลาง", en: "Wang Thonglang" }, { th: "คลองสามวา", en: "Khlong Sam Wa" }, { th: "บางนา", en: "Bang Na" },
  { th: "ทวีวัฒนา", en: "Thawi Watthana" }, { th: "ทุ่งครุ", en: "Thung Khru" }, { th: "บางบอน", en: "Bang Bon" }
];

// Start at BKK center approx 13.75, 100.50
const startLat = 13.55;
const startLng = 100.30;
const step = 0.05; // degree offset

const features = districtNames.map((dist, i) => {
  // arrange in a rough 7x8 grid
  const row = Math.floor(i / 7);
  const col = i % 7;
  
  const lat = startLat + (row * step);
  const lng = startLng + (col * step);
  
  const randomPop = Math.floor(Math.random() * 150000) + 30000;
  const randomGrowth = (Math.random() * 5 - 2).toFixed(2); // -2% to 3%
  const randomDensity = Math.floor(Math.random() * 12000) + 1000;
  const randomAccess = (Math.random() * 10).toFixed(1);
  const randomBlind = Math.floor(Math.random() * 8);

  return {
    type: "Feature",
    properties: {
      id: i + 1,
      name_th: dist.th,
      name_en: dist.en,
      population: randomPop,
      growth_rate: parseFloat(randomGrowth),
      density: randomDensity,
      accessibility_index: parseFloat(randomAccess),
      blind_spots: randomBlind
    },
    geometry: {
      type: "Polygon",
      coordinates: [[
        [lng, lat],
        [lng + step * 0.9, lat],
        [lng + step * 0.9, lat + step * 0.9],
        [lng, lat + step * 0.9],
        [lng, lat]
      ]]
    }
  };
});

const geojson = {
  type: "FeatureCollection",
  name: "bkk_50_districts_dummy",
  crs: { type: "name", properties: { name: "urn:ogc:def:crs:OGC:1.3:CRS84" } },
  features: features
};

const filepath = path.join(process.cwd(), 'src', 'data', 'bkk_districts.geojson');
fs.writeFileSync(filepath, JSON.stringify(geojson, null, 2), 'utf8');
console.log(`Generated 50 districts GeoJSON at ${filepath}`);
