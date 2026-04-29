import fs from 'fs';
import path from 'path';

// District groupings for realistic temperature generation
const INNER_CITY = ['พระนคร','ดุสิต','ป้อมปราบศัตรูพ่าย','สัมพันธวงศ์','ปทุมวัน','ราชเทวี','พญาไท','ดินแดง','ห้วยขวาง','วังทองหลาง','บางรัก','สาทร','บางคอแหลม','คลองเตย','วัฒนา','ยานนาวา'];
const SUBURB_DENSE = ['จตุจักร','บางซื่อ','ลาดพร้าว','บางเขน','บางกะปิ','สวนหลวง','พระโขนง','บางนา','ธนบุรี','คลองสาน','บางกอกน้อย','บางกอกใหญ่','บางพลัด','จอมทอง'];
const OUTER_AGRICULTURAL = ['หนองจอก','มีนบุรี','ลาดกระบัง','คลองสามวา','ทวีวัฒนา','ตลิ่งชัน','บางขุนเทียน','ทุ่งครุ','บางบอน','หนองแขม','ประเวศ','สะพานสูง','คันนายาว','สายไหม','ดอนเมือง','หลักสี่','ภาษีเจริญ','บางแค','ราษฎร์บูรณะ'];

const YEARS = [2018, 2019, 2020, 2021, 2022, 2023, 2024, 2025, 2026];

function generateLST() {
  const geojsonPath = path.join(process.cwd(), 'src', 'data', 'bkk_districts.geojson');
  if (!fs.existsSync(geojsonPath)) {
    console.error('GeoJSON not found at', geojsonPath);
    return;
  }

  const geojson = JSON.parse(fs.readFileSync(geojsonPath, 'utf8'));
  const data = [];

  for (const feature of geojson.features) {
    const id = feature.properties.id;
    const name = feature.properties.name_th;
    
    // Determine base temperature based on district type
    let baseTemp;
    if (INNER_CITY.includes(name) || INNER_CITY.includes(name.replace('เขต', ''))) {
      baseTemp = 36.5; // Very hot (Urban Heat Island)
    } else if (SUBURB_DENSE.includes(name) || SUBURB_DENSE.includes(name.replace('เขต', ''))) {
      baseTemp = 34.5; // Moderate
    } else {
      baseTemp = 32.5; // Cooler (Vegetation / Outer)
    }

    // Add random noise per district
    baseTemp += (Math.random() * 2 - 1); 

    // Generate for each year
    for (const year of YEARS) {
      // Global warming trend: +0.1 to +0.25 C per year
      const yearOffset = (year - 2018) * (0.1 + Math.random() * 0.15);
      // El Nino year (2023, 2024) anomaly: +1.5 C
      const anomaly = (year === 2023 || year === 2024) ? (1.0 + Math.random() * 0.8) : (Math.random() * 0.5 - 0.25);
      
      const finalTemp = parseFloat((baseTemp + yearOffset + anomaly).toFixed(2));
      
      // Generate monthly profile (12 months)
      // Bangkok is hottest in April/May, cooler in Dec/Jan
      const monthly_lst = [];
      const monthOffsets = [
        -2.5, // Jan
        -1.0, // Feb
        1.5,  // Mar
        3.5,  // Apr
        3.0,  // May
        1.0,  // Jun
        0.5,  // Jul
        0.0,  // Aug
        -0.5, // Sep
        -1.0, // Oct
        -1.5, // Nov
        -3.0  // Dec
      ];

      for (let m = 0; m < 12; m++) {
        const mTemp = finalTemp + monthOffsets[m] + (Math.random() * 1.0 - 0.5);
        monthly_lst.push(parseFloat(mTemp.toFixed(2)));
      }
      
      data.push({
        district_id: id,
        district_name: name,
        year: year,
        mean_lst: finalTemp,
        monthly_lst: monthly_lst,
        max_lst: parseFloat((finalTemp + 3 + Math.random() * 2).toFixed(2)), // Max temp is usually 3-5C higher than mean
        vegetation_index: parseFloat((1 - (finalTemp - 30) / 15).toFixed(2)) // Inverse correlation with temp
      });
    }
  }

  const outputPath = path.join(process.cwd(), 'src', 'data', 'lst_data.json');
  fs.writeFileSync(outputPath, JSON.stringify(data, null, 2), 'utf8');
  console.log(`✅ Generated LST data for ${data.length / YEARS.length} districts (${data.length} records) to ${outputPath}`);
}

generateLST();
