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
