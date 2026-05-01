# Bangkok District Analytics Dashboard

Dashboard สำหรับการวิเคราะห์ข้อมูลระดับเขตของกรุงเทพมหานคร เพื่อเป็นเครื่องมือประกอบการตัดสินใจสำหรับผู้บริหารโครงการ มีฟีเจอร์แผนที่แบบ Choropleth (Leaflet), ข้อมูลเชิงสถิติจาก Supabase, กราฟแสดงแนวโน้มพยากรณ์ (Recharts), และบูรณาการร่วมกับเครื่องมือประมวลผลข้อมูล Google Earth Engine

## โครงสร้างโปรเจกต์ (Project Structure)
- **Frontend**: Next.js 14 App Router, Tailwind CSS, shadcn/ui
- **Map & Visualization**: react-leaflet, Recharts
- **Database Backend**: Supabase (PostgreSQL + PostGIS)
- **Data Extractor**: Python (Google Earth Engine API)

## การติดตั้งและการเริ่มต้น (Installation & Setup)

1. คัดลอกไฟล์ `.env.local.example` เป็น `.env.local`
2. ใส่ค่าตัวแปร `NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_ANON_KEY` ที่ได้จากโปรเจกต์ Supabase ของคุณ
3. ติดตั้ง Dependencies:
   ```bash
   npm install
   ```
4. รัน Development Server:
   ```bash
   npm run dev
   ```

## การตั้งค่า Supabase + PostGIS
1. สร้างโปรเจกต์ใหม่ใน Supabase
2. ใน SQL Editor ของ Supabase รันคำสั่งนี้เพื่อเปิดใช้ PostGIS และสร้างตาราง `districts`:
   ```sql
   CREATE EXTENSION IF NOT EXISTS postgis;

   CREATE TABLE districts (
       id SERIAL PRIMARY KEY,
       name_th VARCHAR(255),
       name_en VARCHAR(255),
       geom GEOMETRY(Polygon, 4326),
       population INT,
       growth_rate FLOAT,
       density FLOAT,
       accessibility_index FLOAT,
       blind_spots INT
   );
   ```

## การดึงข้อมูลจาก Google Earth Engine (Python Bridge)
1. ติดตั้งไลบรารี Python ที่จำเป็น: `pip install earthengine-api pandas`
2. ตั้งค่าการอ้างอิงของ Service Account ในไฟล์ `scripts/gee_extract.py` หรือใช้ `earthengine authenticate`
3. รันสคริปต์เพื่อดึงข้อมูล NDVI รายปี (อ้างอิงจาก GeoJSON ของ กทม.):
   ```bash
   python scripts/gee_extract.py
   ```

## NDVI Methodology

ระบบวิเคราะห์พื้นที่สีเขียวใช้ NDVI จาก Landsat 8 Collection 2 Level 2 Surface Reflectance โดยคำนวณจากสูตร:

```text
NDVI = (NIR - Red) / (NIR + Red)
NIR = SR_B5, Red = SR_B4
```

สคริปต์ `scripts/gee_extract.py` ใช้ cloud mask จาก `QA_PIXEL` และ apply scale factor ของ Landsat L2 reflectance ก่อนคำนวณ NDVI จากนั้นทำ annual median ต่อเขตและต่อปี ค่า `green_area_ratio` คือสัดส่วนพื้นที่ที่ NDVI > 0.30 ส่วน `low_green_ratio` คือพื้นที่ที่ NDVI < 0.20

`ndvi_score` ไม่ได้คูณ NDVI ตรง ๆ แต่ normalize เป็น 0-10 โดยกำหนด NDVI 0.10 = 0 และ NDVI 0.60 = 10 เพื่อให้เหมาะกับบริบทเมือง

## Interpretation of NDVI Classes

- Very Low / เขียวน้อยมาก: NDVI < 0.15
- Low / เขียวน้อย: 0.15 ถึง < 0.25
- Moderate / ปานกลาง: 0.25 ถึง < 0.35
- Good / ดี: 0.35 ถึง < 0.50
- Very Good / ดีมาก: NDVI >= 0.50

## Data Pipeline

1. เตรียม `.env.local` ให้มี `NEXT_PUBLIC_SUPABASE_URL` และ `NEXT_PUBLIC_SUPABASE_ANON_KEY`
2. ติดตั้ง Python dependencies:

```bash
pip install earthengine-api python-dotenv supabase
```

3. Authenticate Google Earth Engine:

```bash
earthengine authenticate
```

4. รัน extraction:

```bash
python scripts/gee_extract.py
```

ผลลัพธ์จะถูก upsert เข้า `district_statistics` ด้วย unique key `(district_id, year)` เพื่อป้องกันข้อมูลซ้ำ

## Supabase Schema

รัน migration ใน Supabase SQL Editor:

```sql
-- supabase/migrations/001_add_ndvi_metrics.sql
```

ตาราง `district_statistics` รองรับ metrics ใหม่ เช่น `ndvi_mean`, `ndvi_median`, `ndvi_min`, `ndvi_max`, `ndvi_score`, `ndvi_class`, `green_area_ratio`, `green_area_rai`, `low_green_ratio`, `water_ratio`, `ntl_mean`, `data_source`, และ `processing_note`

## How to Run Frontend

```bash
npm install
npm run dev
```

เปิดหน้า `/green-space` เพื่อดู dashboard พื้นที่สีเขียว, layer selector, KPI cards, ranking เขต NDVI ต่ำ และ trend รายปี

## Limitations

- `water_ratio` ใช้ NDWI เป็น proxy เบื้องต้น ควรตรวจสอบกับชั้นข้อมูลแม่น้ำ คลอง บึง และพื้นที่น้ำจริงของ กทม.
- ค่า NTL จาก VIIRS ใช้เป็น proxy ของกิจกรรมเมืองเท่านั้น ไม่ใช่ข้อมูลประชากรจริง
- population, density, growth และ accessibility ที่สร้างจาก pipeline นี้เป็นค่า proxy/demo เพื่อ compatibility กับระบบเดิม ไม่ใช่สถิติราชการ
- ผลลัพธ์ remote sensing ควรตรวจสอบร่วมกับข้อมูลภาคสนามและฐานข้อมูลพื้นที่สีเขียวจริงของกรุงเทพมหานครก่อนใช้ตัดสินใจเชิงนโยบาย
