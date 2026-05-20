# AGENT.md

## บทบาทของโปรเจกต์

โปรเจกต์นี้เป็นแอพวิเคราะห์ข้อมูลเชิงพื้นที่ของกรุงเทพมหานคร โดยใช้ข้อมูลจาก Google Earth Engine เพื่อเปรียบเทียบข้อมูลรายปีและรายเขต และมีแผนเชื่อมข้อมูล Traffy Fondue กับ Open Data ในอนาคต

## สิ่งที่ Agent ควรรู้ก่อนแก้โค้ด

- แอพนี้เน้นงาน GIS / spatial analysis
- เป้าหมายหลักคือการวิเคราะห์รายปีและรายเขตของ กทม.
- ข้อมูลหลักมาจาก Google Earth Engine
- ในอนาคตจะเชื่อม Traffy Fondue และ Open Data
- ต้องระวังชื่อเขต กทม. ให้ตรงกันทุกชุดข้อมูล
- ต้องระวังพิกัด lat/lon และระบบพิกัดแผนที่

## กฎในการแก้ไข

- อย่าเปลี่ยนโครงสร้างข้อมูลโดยไม่อัปเดต Data Dictionary
- อย่าเปลี่ยนชื่อ field โดยไม่อัปเดต Field Mapping
- ถ้าเพิ่ม layer แผนที่ใหม่ ให้จดใน Layer Plan
- ถ้าแก้ logic วิเคราะห์ ให้จดใน Analysis Workflow
- ถ้าพบ bug ให้เพิ่มใน Known Issues

## ไฟล์ที่ควรอ่านก่อนทำงาน

1. README.md
2. docs/Project Overview.md
3. docs/Data Dictionary.md
4. docs/Field Mapping.md
5. docs/Code Map.md
6. docs/Known Issues.md

## งานที่ต้องทำปัจจุบัน

ดูที่:

- docs/Task Board.md

## ข้อควรระวังด้านข้อมูล

- ข้อมูลแต่ละปีต้องใช้วิธีคำนวณเดียวกัน
- การเปรียบเทียบรายเขตต้องใช้ boundary เดียวกัน
- ข้อมูล Traffy อาจมี bias จากจำนวนผู้ใช้งานในแต่ละพื้นที่
- Open Data อาจมีวันอัปเดตไม่เท่ากัน