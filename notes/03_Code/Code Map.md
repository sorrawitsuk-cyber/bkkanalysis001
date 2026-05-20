# Code Map

> [!warning] สถานะเอกสาร
> ยังไม่พบโครงสร้างไฟล์จริงจาก repo ผ่านเครื่องมือค้นหา จึงเป็นโครงร่างสำหรับจดเมื่อเปิด repo ใน VS Code แล้ว

---

## วิธีใช้เอกสารนี้

เมื่อเปิด repo `bkkanalysis001` ใน VS Code ให้ไล่ดูไฟล์หลัก แล้วเติมตารางด้านล่างว่าแต่ละไฟล์ทำหน้าที่อะไร

---

## โครงสร้างไฟล์ที่ต้องตรวจ

| ไฟล์/โฟลเดอร์ | หน้าที่ | สถานะ | หมายเหตุ |
|---|---|---|---|
| README.md | อธิบายโปรเจกต์ | ยังต้องตรวจ | ควรมีวิธีติดตั้ง/ใช้งาน |
| package.json | dependency และ script | ยังต้องตรวจ | ถ้าเป็นเว็บ JS/React/Next |
| requirements.txt | dependency Python | ยังต้องตรวจ | ถ้าเป็น Python |
| src/ | โค้ดหลัก | ยังต้องตรวจ | |
| app/ | หน้าเว็บ / route | ยังต้องตรวจ | ถ้าใช้ Next.js |
| components/ | UI components | ยังต้องตรวจ | |
| data/ | ข้อมูลที่ใช้ | ยังต้องตรวจ | |
| public/ | static files | ยังต้องตรวจ | |
| scripts/ | script ประมวลผล | ยังต้องตรวจ | |
| docs/ | เอกสาร | ยังต้องตรวจ | |

---

## คำสั่งที่ต้องลอง

### ถ้าเป็น Node.js / React / Next.js

```bash
npm install
npm run dev
npm run build

### ถ้าเป็น Python

```
pip install -r requirements.txtpython main.py
```

### ถ้าใช้ Jupyter

```
jupyter notebook
```

---

## สิ่งที่ต้องจดเมื่ออ่านโค้ด

> [!todo] Code Reading Checklist
> 
> - [ ]  โปรเจกต์ใช้ภาษาอะไร
> - [ ]  ใช้ framework อะไร
> - [ ]  entry point คือไฟล์ไหน
> - [ ]  ข้อมูลถูกโหลดจากที่ไหน
> - [ ]  มีการเชื่อม Google Earth Engine หรือยัง
> - [ ]  มีการเชื่อม Traffy หรือยัง
> - [ ]  แสดงผลเป็นเว็บ แผนที่ หรือ notebook
> - [ ]  deploy ด้วยอะไร
> - [ ]  มี environment variable อะไรบ้าง