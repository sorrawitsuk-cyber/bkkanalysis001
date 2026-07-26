# Bangkok Urban Earth Observatory

## Register

product

## Product Purpose

ระบบสังเกตการณ์เมืองกรุงเทพฯ ที่ใช้ข้อมูล remote sensing เป็นแกน แล้วเชื่อมกับ
Open Data เฉพาะบริบทที่มีแหล่งข้อมูลตรวจสอบได้ เพื่อสำรวจสภาพล่าสุดที่มีข้อมูล
ตรวจการเปลี่ยนแปลง เปรียบเทียบพื้นที่ และสร้างหลักฐานสำหรับการตรวจสอบต่อ

ระบบไม่ใช่พยากรณ์อย่างเป็นทางการ ไม่ใช่เครื่องมือยืนยันสภาพภาคสนาม และไม่ควร
สรุปเหตุและผลจากความสัมพันธ์เชิงพื้นที่

## Users

- เจ้าหน้าที่กรุงเทพมหานครที่ต้องคัดกรองพื้นที่ก่อนตรวจเพิ่มเติม
- นักวิเคราะห์เมืองที่ต้องควบคุมพื้นที่ เวลา baseline และวิธีคำนวณ
- ผู้บริหารที่ต้องอ่านข้อค้นพบพร้อมที่มา ความไม่แน่นอน และสิ่งที่ควรตรวจต่อ

## Core Workflow

ตั้งคำถาม → เลือกพื้นที่และเวลา → ตรวจสัญญาณ → เชื่อมบริบท →
ตรวจหลักฐาน → บันทึกข้อค้นพบ

## MVP Workflows

1. สำรวจสภาพล่าสุดที่มีข้อมูล
2. เปรียบเทียบพื้นที่และช่วงเวลา
3. ตรวจการเปลี่ยนแปลงหรือเหตุการณ์
4. ประเมินคนและทรัพย์สินที่อาจอยู่ในพื้นที่ซึ่งพบสัญญาณ

## Product Principles

1. เริ่มจากคำถามเชิงเมือง ไม่เริ่มจากชื่อ sensor หรือดัชนี
2. ทุกค่าต้องมีหน่วย ช่วงสังเกต พื้นที่ แหล่งข้อมูล วิธีคำนวณ และสถานะคุณภาพ
3. แยกข้อมูลสังเกต ข้อมูลทะเบียน ค่าคำนวณ แบบจำลอง และการคาดการณ์
4. ไม่รวมคุณภาพหลายมิติเป็น confidence score เดียว
5. แสดง coverage, freshness, spatial fitness และ validation status แยกกัน
6. ไม่เติมข้อมูลที่ขาดด้วยศูนย์หรือค่าจำลอง
7. ไม่จัดอันดับพื้นที่ที่ coverage ต่ำกว่าข้อกำหนดของ product
8. เปรียบเทียบฤดูกาลเดียวกันและเปิดเผย baseline เสมอ
9. ใช้คำว่า “บ่งชี้”, “สัญญาณ”, “สัมพันธ์” และ “ควรตรวจร่วมกับ”
10. ไม่มี composite priority score จนกว่าจะระบุวัตถุประสงค์ น้ำหนัก การ
    validation และ sensitivity analysis ครบ

## Scientific Language

- LST คืออุณหภูมิผิวดิน ไม่ใช่อุณหภูมิอากาศหรือ heat index
- NDVI คือสัญญาณความเขียวและสภาพพืชพรรณ ไม่ใช่พื้นที่เรือนยอดไม้
- Tree cover คือพื้นที่เรือนยอดไม้หรือ tree class และต้องแยกจาก NDVI
- NDWI/MNDWI คือสัญญาณน้ำบนผิว ไม่ใช่หลักฐานยืนยันน้ำท่วม
- NDBI คือ built-up spectral signal ไม่ใช่แผนที่อาคารหรือ land use ตามกฎหมาย
- Sentinel-5P คือ atmospheric-column proxy ไม่ใช่ AQI ระดับถนน
- GPM IMERG เป็นบริบทฝนระดับเมือง ไม่ใช่ฝนระดับถนน
- ประชากร DOPA คือประชากรตามทะเบียน ไม่ใช่ประชากรที่อยู่จริงทุกช่วงเวลา

## Navigation

1. ภาพรวมเมือง
2. พื้นที่วิเคราะห์
3. พื้นที่ศึกษา
4. หลักฐานข้อมูล

ชื่อ dataset และ indicator อยู่ใน Layer Library ภายใน workspace ไม่เป็นเมนู
ระดับบน

## Evidence Model

ทุกผลลัพธ์ต้องเชื่อมถึง:

- dataset และ product version
- observation period และ publication/retrieval time
- spatial resolution, CRS และ geographic coverage
- QA rules, valid coverage, scene count และ no-data
- method version, parameters และ processing run
- boundary version และ aggregation rule
- license, redistribution และ export permission
- limitations และข้อมูลที่ควรใช้ตรวจร่วม

## Data Failure Policy

เมื่อข้อมูลที่ผ่านการตรวจไม่พร้อม ให้แสดง `unavailable` หรือข้อมูล vintage
ล่าสุดที่ผ่าน validation เท่านั้น ห้ามแสดง synthetic, seeded, modeled fallback
หรือ demo value ให้ดูเหมือนข้อมูลวิเคราะห์จริง

## Scope Boundary

Traffy ไม่อยู่ใน navigation, copy, source registry, workflow, scoring หรือ mock
data ของ Observatory ระยะแรก ระบบเดิมที่เกี่ยวข้องให้ถือเป็น legacy และไม่ถูก
เรียกจากประสบการณ์ใหม่

## Success Criterion

ผู้ใช้ใหม่ต้องเลือกคำถาม พื้นที่ และเวลา ตรวจการเปลี่ยนแปลง เปิดหลักฐาน และ
ส่งออกผลที่ทำซ้ำได้ภายใน 5 นาที โดยไม่มีตัวเลขใดขาดหน่วย ช่วงเวลา หรือที่มา
