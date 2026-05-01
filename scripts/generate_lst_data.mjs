import fs from 'fs';
import path from 'path';

const INNER_CITY = ['พระนคร','ดุสิต','ป้อมปราบศัตรูพ่าย','สัมพันธวงศ์','ปทุมวัน','ราชเทวี','พญาไท','ดินแดง','ห้วยขวาง','วังทองหลาง','บางรัก','สาทร','บางคอแหลม','คลองเตย','วัฒนา','ยานนาวา'];
const SUBURB_DENSE = ['จตุจักร','บางซื่อ','ลาดพร้าว','บางเขน','บางกะปิ','สวนหลวง','พระโขนง','บางนา','ธนบุรี','คลองสาน','บางกอกน้อย','บางกอกใหญ่','บางพลัด','จอมทอง'];
const OUTER_AGRICULTURAL = ['หนองจอก','มีนบุรี','ลาดกระบัง','คลองสามวา','ทวีวัฒนา','ตลิ่งชัน','บางขุนเทียน','ทุ่งครุ','บางบอน','หนองแขม','ประเวศ','สะพานสูง','คันนายาว','สายไหม','ดอนเมือง','หลักสี่','ภาษีเจริญ','บางแค','ราษฎร์บูรณะ'];

const YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

// Seasonal LST offsets relative to annual mean (Bangkok climate)
// Apr hottest (+3.5), Dec/Jan coolest (-2.5 to -3.0)
const MONTH_LST_OFFSETS = [-2.5, -1.0, 1.5, 3.5, 3.0, 1.0, 0.5, 0.0, -0.5, -1.0, -1.5, -3.0];

// Realistic NDVI ranges by district type (independent of temperature)
// Inner city: dense concrete, very little vegetation
// Suburb: parks, street trees, mixed
// Outer/Agricultural: orchards, paddy fields, canals
function baseNdvi(name) {
  if (INNER_CITY.includes(name)) return 0.10 + Math.random() * 0.10;     // 0.10–0.20
  if (SUBURB_DENSE.includes(name)) return 0.20 + Math.random() * 0.12;   // 0.20–0.32
  return 0.30 + Math.random() * 0.22;                                     // 0.30–0.52
}

function generateLST() {
  // Support both .json and .geojson filenames
  const candidates = [
    path.join(process.cwd(), 'src', 'data', 'bkk_districts.json'),
    path.join(process.cwd(), 'src', 'data', 'bkk_districts.geojson'),
  ];
  const geojsonPath = candidates.find(fs.existsSync);
  if (!geojsonPath) {
    console.error('GeoJSON not found. Tried:', candidates.join(', '));
    process.exit(1);
  }

  const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
  const data = [];

  for (const feature of geojson.features) {
    const id = feature.properties.id;
    const name = feature.properties.name_th;

    let baseTemp;
    if (INNER_CITY.includes(name)) {
      baseTemp = 36.5;
    } else if (SUBURB_DENSE.includes(name)) {
      baseTemp = 34.5;
    } else {
      baseTemp = 32.5;
    }

    // Fixed noise per district (deterministic-ish from id so re-runs are stable)
    const districtNoise = ((id * 17) % 200) / 100 - 1; // -1 to +1
    baseTemp += districtNoise;

    // Fixed NDVI for this district (independent of temperature)
    const ndvi = parseFloat(baseNdvi(name).toFixed(3));

    for (const year of YEARS) {
      // Global warming trend +0.12 °C/yr
      const yearOffset = (year - 2018) * 0.12;
      // El Niño years (2023, 2024) add ~+1–1.5 °C anomaly
      const anomaly = (year === 2023 || year === 2024)
        ? 1.0 + Math.random() * 0.5
        : (Math.random() * 0.4 - 0.2);

      const annualMean = parseFloat((baseTemp + yearOffset + anomaly).toFixed(2));

      // Monthly LST from seasonal offsets + small noise
      const monthly_lst = MONTH_LST_OFFSETS.map((offset) =>
        parseFloat((annualMean + offset + (Math.random() * 0.6 - 0.3)).toFixed(2))
      );

      // Max is the highest monthly value (not random offset from mean)
      const max_lst = parseFloat(Math.max(...monthly_lst).toFixed(2));

      data.push({
        district_id: id,
        district_name: name,
        year,
        mean_lst: annualMean,
        max_lst,
        monthly_lst,
        // vegetation_index is an independent NDVI estimate, not derived from temperature
        vegetation_index: ndvi,
      });
    }
  }

  const outputPath = path.join(process.cwd(), 'src', 'data', 'lst_data.json');
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
  const districtCount = data.length / YEARS.length;
  console.log(`✅ Generated LST data for ${districtCount} districts (${data.length} records) → ${outputPath}`);
  console.log('   vegetation_index: based on district type (not derived from temperature)');
  console.log('   max_lst: derived from monthly max (not random offset)');
}

generateLST();
