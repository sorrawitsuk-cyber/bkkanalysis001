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

---

## Satellite Data Product Cache (R2)

ระบบ cache ภาพดาวเทียม — ประมวลผล Sentinel-2 ล่วงหน้าผ่าน GEE แล้วเก็บไฟล์ไว้ใน Cloudflare R2 เพื่อให้ frontend โหลดได้เร็วโดยไม่ต้องรอ GEE ทุกครั้ง

### Architecture

```
GitHub Actions (cron)
  ├── scripts/gee/process-monthly.py  →  GEE → R2
  └── scripts/gee/process-yearly.py   →  GEE → R2

Cloudflare R2 (static serving)
  satellite-cache/
    index.json
    monthly/YYYY-MM/
      metadata.json  ndvi_mean.tif  ndvi_mean.webp  ...
    yearly/YYYY/
      metadata.json  ndvi_mean.tif  ...

Next.js API (proxy)
  /api/satellite-cache/index         ← index.json
  /api/satellite-cache/metadata      ← metadata.json for a given period

Frontend (green-space page)
  "Cache" mode  →  ImageOverlay จาก R2 preview URL
```

### ตั้งค่า secrets

**GitHub repository secrets** (Settings → Secrets → Actions):

| Secret | คำอธิบาย |
|---|---|
| `GEE_SERVICE_ACCOUNT_JSON` | JSON key file ของ service account (ทั้งไฟล์ เป็น string) |
| `R2_ACCOUNT_ID` | Cloudflare account ID |
| `R2_ACCESS_KEY_ID` | R2 API token — Access Key ID |
| `R2_SECRET_ACCESS_KEY` | R2 API token — Secret |
| `R2_BUCKET` | ชื่อ R2 bucket |
| `R2_PUBLIC_BASE_URL` | Public URL ของ bucket เช่น `https://pub-xxx.r2.dev` |

**สำหรับ Next.js / Vercel** — ใส่ใน `.env.local` หรือ Vercel environment variables:  
`R2_PUBLIC_BASE_URL`, `SATELLITE_CACHE_PREFIX` (default: `satellite-cache`)

### รัน script ด้วยตนเอง

```bash
# ติดตั้ง Python dependencies (ครั้งแรก)
pip install -r scripts/gee/requirements.txt

# ตั้งค่า env vars
export GEE_SERVICE_ACCOUNT_JSON=$(cat path/to/key.json)
export R2_ACCOUNT_ID=...
export R2_ACCESS_KEY_ID=...
export R2_SECRET_ACCESS_KEY=...
export R2_BUCKET=your-bucket
export R2_PUBLIC_BASE_URL=https://pub-xxx.r2.dev

# ประมวลผลเดือนก่อนหน้า (default)
python scripts/gee/process-monthly.py

# ระบุเดือนเอง
python scripts/gee/process-monthly.py --period 2024-03

# บังคับประมวลผลซ้ำ
python scripts/gee/process-monthly.py --period 2024-03 --force

# ประมวลผลรายปี
python scripts/gee/process-yearly.py --year 2023

# Rebuild index.json จาก R2 listing
node scripts/storage/update-index.mjs
```

### GitHub Actions schedule

| Workflow | ไฟล์ | กำหนดการ |
|---|---|---|
| Monthly | `process-satellite-monthly.yml` | วันที่ 5 และ 10 ของทุกเดือน 05:00 BKK |
| Yearly | `process-satellite-yearly.yml` | 15 ม.ค. ของทุกปี 06:00 BKK |

trigger ด้วยมือได้ที่ **Actions → เลือก workflow → Run workflow**

### R2 object paths

```
satellite-cache/index.json
satellite-cache/monthly/{YYYY-MM}/metadata.json
satellite-cache/monthly/{YYYY-MM}/{layer}.tif
satellite-cache/monthly/{YYYY-MM}/{layer}.webp
satellite-cache/yearly/{YYYY}/metadata.json
satellite-cache/yearly/{YYYY}/{layer}.tif
satellite-cache/yearly/{YYYY}/{layer}.webp
```

Layers: `ndvi_mean`, `ndvi_max`, `ndwi_mean`, `ndwi_max`, `mndwi_mean`, `ndbi_mean`
