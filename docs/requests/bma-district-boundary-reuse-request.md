# คำขอยืนยันสิทธิ์ใช้ข้อมูลพื้นที่เขตปกครอง 50 เขตของกรุงเทพมหานคร

สถานะ: ยกเลิกตามแนวทางผลิตภัณฑ์เมื่อ 29 กรกฎาคม 2569 — ห้ามส่ง

จัดทำเมื่อ: 29 กรกฎาคม 2569

ผู้รับที่ระบุบนเว็บไซต์ Bangkok Open Data: `saraban.sed.gis@bangkok.go.th`

เอกสารนี้เก็บไว้เป็น audit trail เท่านั้น โครงการเปลี่ยนไปใช้บริการ Bangkok
CityMap ที่เปิดให้เรียกผ่าน ArcGIS REST/WMS โดยตรง และจะไม่ส่งคำขอนี้

## หัวข้ออีเมล

ขอคำยืนยันเงื่อนไขการใช้ซ้ำและเผยแพร่ข้อมูลพื้นที่เขตปกครอง 50 เขตของกรุงเทพมหานคร

## เนื้อหาอีเมลภาษาไทย

เรียน ผู้ดูแลข้อมูล Bangkok Open Data / หน่วยงานเจ้าของข้อมูล

ทีมพัฒนาโครงการ Bangkok Urban Earth Observatory กำลังจัดทำระบบวิเคราะห์ข้อมูล
remote sensing ร่วมกับข้อมูลเปิดของกรุงเทพมหานคร เพื่อสนับสนุนการเปรียบเทียบ
สัญญาณเชิงพื้นที่ระดับเขต โดยแสดงแหล่งที่มา วิธีการ ข้อจำกัด และผลการตรวจสอบ
คุณภาพอย่างชัดเจน

โครงการประสงค์ใช้ชุดข้อมูล “พื้นที่เขตปกครอง 50 เขตของกรุงเทพมหานคร” จาก
Bangkok Open Data โดยตรวจสอบ resource แบบ GML จาก URL ต่อไปนี้:

https://data.bangkok.go.th/dataset/e537025b-1cf6-4c5b-8e46-c2e976f13283/resource/c31ccc0f-c592-46b3-b616-716b20396c60/download/district.gml

สำเนาที่ตรวจสอบเมื่อวันที่ 28 กรกฎาคม 2569 มีค่า SHA-256:
`4aa2e8d1c9d17d45808fc92984dbebd4ff7093e9e1c4c391d4bf22f52bf3eef2`

หน้า resource ปัจจุบันระบุ “License not specified” จึงขอความกรุณายืนยันเป็น
ลายลักษณ์อักษรในประเด็นต่อไปนี้:

1. อนุญาตให้นำข้อมูลไปใช้วิเคราะห์และเก็บสำเนาต้นทางไว้ภายในเพื่อการตรวจสอบ
   ย้อนกลับหรือไม่
2. อนุญาตให้แปลง CRS, ตรวจซ่อม geometry และแปลงเป็น GeoJSON, PMTiles, vector
   tiles หรือ mask สำหรับประมวลผลหรือไม่
3. อนุญาตให้เผยแพร่ geometry ที่ผ่านการแปลงและ derived tiles ต่อสาธารณะหรือไม่
4. อนุญาตให้เผยแพร่สถิติรายเขตที่คำนวณจาก remote sensing โดยใช้ขอบเขตนี้เป็น
   หน่วยสรุปผลหรือไม่
5. อนุญาตให้เผยแพร่ไฟล์ต้นทางซ้ำหรือไม่ หากไม่อนุญาต โครงการจะเผยแพร่เฉพาะ
   ผลลัพธ์ที่ได้รับอนุญาตและลิงก์กลับไปยังแหล่งต้นทาง
6. ต้องใช้ข้อความ attribution อย่างไร และมีชื่อสัญญาอนุญาตหรือ URL
   เงื่อนไขการใช้งานที่ควรอ้างอิงหรือไม่
7. ไฟล์ดังกล่าวเป็นเวอร์ชันอ้างอิงทางการ ณ วันที่ใด และมีรอบการปรับปรุงหรือ
   URL แบบ versioned ที่แนะนำหรือไม่

โครงการจะยังไม่นำ geometry หรือผลลัพธ์รายเขตขึ้นเผยแพร่จนกว่าจะได้รับคำยืนยัน
ครบถ้วน และพร้อมปฏิบัติตามข้อความ attribution หรือข้อจำกัดที่กรุงเทพมหานคร
กำหนด

ขอขอบพระคุณสำหรับคำแนะนำและความอนุเคราะห์

ขอแสดงความนับถือ

[ชื่อผู้ส่ง]

[หน่วยงาน/โครงการ]

[อีเมลและหมายเลขโทรศัพท์]

## English reference

The project requests written confirmation that the identified GML snapshot may
be used for analysis, retained privately for reproducibility, transformed into
derived geometry and tiles, and used to publish district-level remote-sensing
statistics. The response should also state whether the original source may be
redistributed, the required attribution, the authoritative version date, and
the update cadence or preferred versioned URL.

## ขั้นตอนหลังได้รับคำตอบ

1. เก็บต้นฉบับคำตอบในพื้นที่หลักฐานที่จำกัดสิทธิ์เข้าถึง
2. บันทึก reference และ SHA-256 ของต้นฉบับ โดยไม่คัดลอกข้อมูลส่วนบุคคลเกินจำเป็น
3. กรอกผลลง `config/observatory/authorizations/bma-district-boundaries.json`
4. ให้ผู้ตรวจคนที่สองยืนยัน signer, ขอบเขตสิทธิ์, attribution และ checksum
5. รัน `npm run observatory:authorization:require-approved`
6. promote geometry และข้อมูลรายเขตได้เฉพาะเมื่อคำสั่งข้อ 5 ผ่าน
