# Field Mapping

> [!info] วัตถุประสงค์
> ใช้สำหรับจับคู่ชื่อ field จากข้อมูลหลายแหล่งให้กลายเป็นโครงสร้างกลางของโปรเจกต์ เพื่อให้นำไปวิเคราะห์ร่วมกันได้

---

## โครงสร้างกลางระดับเขต

| Standard Field | Google Earth Engine | Traffy Fondue | Open Data | หมายเหตุ |
|---|---|---|---|---|
| district_id | - | - | district_id | ควรใช้รหัสเขตกลาง |
| district_name | district_name | district | district_name | ต้องทำชื่อเขตให้ตรงกัน |
| year | year | created_at year | update_year | ใช้เปรียบเทียบรายปี |
| geometry | geometry | lat/lon | geometry | ใช้ spatial join |
| data_source | GEE dataset | Traffy | Open Data | ระบุที่มา |

---

## ตัวแปรวิเคราะห์จาก Google Earth Engine

| Standard Field | ความหมาย | วิธีได้มา |
|---|---|---|
| ndvi_mean | ค่าเฉลี่ยพื้นที่สีเขียว | คำนวณจาก GEE รายเขต |
| ndbi_mean | ค่าเฉลี่ยพื้นที่เมือง/สิ่งปลูกสร้าง | คำนวณจาก GEE รายเขต |
| lst_mean | ค่าเฉลี่ยอุณหภูมิพื้นผิว | คำนวณจาก GEE รายเขต |
| water_index_mean | ค่าเฉลี่ยดัชนีน้ำ | คำนวณจาก GEE รายเขต |
| change_rate | อัตราการเปลี่ยนแปลง | เปรียบเทียบกับปีก่อน |

---

## ตัวแปรวิเคราะห์จาก Traffy Fondue

| Standard Field | ความหมาย | วิธีได้มา |
|---|---|---|
| complaint_count | จำนวนเรื่องร้องเรียน | นับจำนวน ticket รายเขต |
| complaint_density | ความหนาแน่นเรื่องร้องเรียน | complaint_count / area_sqkm |
| top_problem_type | ประเภทปัญหาที่พบบ่อยสุด | group by type |
| avg_resolved_days | ระยะเวลาแก้ไขเฉลี่ย | resolved_days เฉลี่ย |
| unresolved_count | จำนวนเรื่องที่ยังไม่จบ | filter status |

---

## ตัวแปรจาก Open Data

| Standard Field | ความหมาย | ตัวอย่าง |
|---|---|---|
| road_length_km | ความยาวถนนในเขต | ใช้วิเคราะห์ร่วมกับปัญหาถนน |
| canal_length_km | ความยาวคลองในเขต | ใช้วิเคราะห์ร่วมกับน้ำท่วม/น้ำเสีย |
| population | จำนวนประชากร | ใช้ normalize |
| green_area_sqkm | พื้นที่สีเขียว | เปรียบเทียบกับ NDVI |
| community_count | จำนวนชุมชน | ใช้เป็นบริบทพื้นที่ |

---

## หมายเหตุ

> [!tip] หลักการสำคัญ
> ควรสร้าง field กลางให้ชัดเจนก่อน แล้วค่อยแปลงข้อมูลแต่ละแหล่งให้เข้ากับ field กลางนี้ จะช่วยให้วิเคราะห์ร่วมกันได้ง่ายขึ้น