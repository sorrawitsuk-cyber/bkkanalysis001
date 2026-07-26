# Observatory Design System

## Physical Scene

นักวิเคราะห์ใช้จอ 24 นิ้วในสำนักงานที่มีแสงสว่างตลอดวัน เจ้าหน้าที่เปิดบนแท็บเล็ต
ระหว่างประชุม และผลต้องฉายบนจอประชุมได้โดยไม่สูญเสียความหมาย อินเทอร์เฟซจึง
เป็น light-first, อ่านต่อเนื่องได้นาน และให้สีข้อมูลทำหน้าที่เฉพาะบนแผนที่กับกราฟ

## Design Register

Product UI, restrained color strategy.

## Visual Direction

- ใช้ canvas สีขาวและ neutral ที่ไม่มี warm cream tint
- สีหลักเป็น violet-indigo เข้ม ใช้เฉพาะ action, selected state และ focus
- สีข้อมูลเป็น palette แยกตามความหมาย ไม่ใช้เป็น decoration
- ใช้ pane, toolbar, annotated map, table และ divider เป็นโครงสร้างหลัก
- ไม่มี gradient text, glow, glassmorphism, hero metrics หรือ identical card grid
- radius ของ panel และ control อยู่ที่ 6–10px
- ไม่มี shadow กว้างบนองค์ประกอบที่มี border

## Typography

- ใช้ sans-serif family เดียวตลอดระบบ
- ภาษาไทยเป็นภาษาหลัก ชื่อ sensor และคำสากลเป็นบรรทัดรอง
- ข้อความ dense UI ไม่ต่ำกว่า 13px
- ตัวเลขใช้ tabular numerals
- heading ใช้ fixed scale ไม่ใช้ fluid display typography

## Core Layout

Desktop:

```text
┌ Global navigation and data state ┐
├ Query bar: question | area | time | baseline | unit ┤
├ Layer library ┬ Map / chart / table ┬ Evidence inspector ┤
└ Timeline, coverage and missing-data state ┘
```

Tablet ยุบ inspector เป็น side sheet และสลับ Map / Chart / Table ด้วย tab
มือถือเป็น list-first และเปิดแผนที่เต็มจอเมื่อผู้ใช้ร้องขอ

## Interaction

- Hover เชื่อม highlight แต่ไม่เปลี่ยน filter
- Click เป็น selection ชั่วคราว
- ผู้ใช้ยืนยันก่อนนำ selection ไปเป็น global filter
- No-data เป็นสถานะแยกและไม่ถูกซ่อน
- Primary raster แสดงได้หนึ่งชั้น และ context overlay ไม่เกินสองชั้น
- State transition ใช้เวลา 150–200ms และรองรับ reduced motion

## Evidence Strip

ผลทุกชิ้นต้องมีแถบหลักฐานที่อ่านเป็นลำดับ:

`ชนิดค่า | แหล่งข้อมูล | resolution | ช่วงสังเกต | coverage | method`

เมื่อข้อมูลไม่พร้อม ให้แสดงเหตุผลและสิ่งที่ต้องตรวจเพิ่มแทนตัวเลข

## Accessibility

- WCAG 2.2 AA เป็นขั้นต่ำ
- touch target อย่างน้อย 44px
- focus ring เห็นชัด
- ไม่ใช้สีเพียงอย่างเดียวสื่อ selected, warning, missing หรือ high/low
- แผนที่มี district list และ table alternative
- chart มี textual summary และ data table
- ทุก animation มี reduced-motion alternative
- รายงานพิมพ์ได้โดยไม่พึ่ง background color
