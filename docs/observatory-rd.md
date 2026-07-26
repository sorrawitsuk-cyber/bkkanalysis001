# Bangkok Urban Earth Observatory: R&D Baseline

วันที่สังเคราะห์: 26 กรกฎาคม 2026

เอกสารนี้กำหนดฐานผลิตภัณฑ์ ข้อมูล และสถาปัตยกรรมของ Observatory รุ่นใหม่
ก่อนย้ายงานวิเคราะห์จากระบบ legacy โดยยังไม่ใช้ Traffy

## 1. Product thesis

ผลิตภัณฑ์ใหม่ไม่เป็น catalog ของหน้า NDVI, LST, ฝน หรือข้อมูลรายชุด แต่เป็น
evidence-first workbench ที่ตอบคำถามต่อเนื่อง:

1. ข้อมูลล่าสุดที่มีบ่งชี้ว่าสภาพพื้นที่เป็นอย่างไร
2. เปลี่ยนจากอดีตอย่างไร เมื่อเทียบฤดูกาลและ baseline ที่เหมาะสม
3. คนและโครงสร้างพื้นฐานใดอยู่ในพื้นที่ที่พบสัญญาณ
4. ผลขึ้นกับ coverage, resolution, cloud, aggregation และวิธีคำนวณเพียงใด
5. ควรตรวจร่วมกับข้อมูลหรือการสำรวจภาคสนามชนิดใด

## 2. MVP analytical products

### Urban surface

- Sentinel-2 L2A หรือ HLS seasonal composite
- NDVI สำหรับ vegetation condition
- NDMI สำหรับ vegetation/surface-moisture signal
- NDWI/MNDWI สำหรับ surface-water signal
- NDBI เป็น built-up spectral signal เท่านั้น
- แสดง state, seasonal anomaly, persistence และ clear-observation count

### Urban heat and exposure

- Landsat Collection 2 Level-2 Surface Temperature
- median hot-season LST, seasonal anomaly และ hot-pixel persistence
- ประชากร DOPA และ WorldPop แสดงแยกชนิด ไม่หลอมเป็นจำนวนเดียว
- ผล exposure ต้องแนบ valid coverage

### Green-blue condition

- แยก tree cover ออกจาก NDVI
- ใช้ land-cover baseline หลังตรวจ accuracy และรุ่นข้อมูล
- แสดง continuity, fragmentation และ persistence
- ไม่อ้าง biodiversity, shade หรือ canopy ระดับ parcel จากข้อมูล 10–30 เมตร

### Rain and water events

- สถานี BMA เป็นหลักเมื่อ endpoint, continuity และสิทธิใช้งานผ่าน acceptance
- GPM IMERG เป็น spatial context ระดับประมาณ 10 กิโลเมตร
- แสดง event accumulation, antecedent 1/3/7 วัน, station status และ
  gauge-satellite disagreement
- missing station ต้องเป็น missing

### Flood-surface screening

- Sentinel-1 pre/post backscatter
- optical surface-water signal
- antecedent rain, water level และ drainage context
- เรียกผลว่า “สัญญาณน้ำผิวดิน” หรือ “พื้นที่ควรตรวจสอบ”
- ไม่ใช่ flood depth, official flood extent หรือ forecast

### Urbanization and people context

- GHSL สำหรับ historical coarse baseline
- Sentinel-2/Dynamic World หรือ local classifier หลัง validation
- DOPA, WorldPop/GHSL และจุดบริการเมืองแยกตาม measurement type
- proximity ระยะแรกเป็น straight-line screening ไม่ใช่ routed travel time

## 3. Data acceptance register

ทุก dataset ต้องผ่าน register ต่อไปนี้ก่อนใช้ในผลิตภัณฑ์:

| Field | Acceptance question |
| --- | --- |
| Owner | หน่วยงานใดรับผิดชอบและมีช่องทางอ้างอิงถาวรหรือไม่ |
| Endpoint | ดาวน์โหลดซ้ำได้หรือมี snapshot ที่ตรวจ checksum ได้หรือไม่ |
| Schema | มีตัวอย่าง schema, unit, null behavior และ code list หรือไม่ |
| Geography | CRS, resolution, granularity และ boundary version คืออะไร |
| Time | observation, publication, retrieval และ update cadence คืออะไร |
| License | ใช้ ดัดแปลง แจกจ่าย และ export ได้เพียงใด |
| QA | mask, completeness, accuracy, validation และ known issues คืออะไร |
| Fallback | ใช้ last validated vintage หรือ unavailable เท่านั้น |

## 4. Priority data

### MVP candidates

- [Sentinel-2 L2A](https://documentation.dataspace.copernicus.eu/Data/SentinelMissions/Sentinel2.html),
  10/20/60 เมตร, optical surface reflectance
- [Sentinel-1 SAR](https://documentation.dataspace.copernicus.eu/Data/SentinelMissions/Sentinel1.html),
  cloud-independent water and moisture signal
- [Landsat Collection 2 Level-2](https://www.usgs.gov/landsat-missions/landsat-collection-2-level-2-science-products),
  surface temperature and long-term optical record
- [NASA HLS](https://hls.gsfc.nasa.gov/), harmonized 30-meter time series
- [GPM IMERG](https://gpm.nasa.gov/data/imerg),
  0.1-degree half-hourly rainfall context
- [ERA5-Land](https://www.ecmwf.int/en/era5-land), climate context at roughly
  9-kilometer native resolution
- [BMA Open Data](https://data.bangkok.go.th/), boundaries, drainage,
  transport, public services and environmental records after resource-level
  license and freshness audit
- [DOPA monthly statistics](https://stat.bora.dopa.go.th/stat/statnew/statMONTH/statmonth/),
  registered population and households
- [WorldPop](https://www.worldpop.org/), modeled gridded population with
  explicit model disclaimer
- [Copernicus DEM GLO-30](https://dataspace.copernicus.eu/explore-data/data-collections/copernicus-contributing-missions/collections-description/COP-DEM),
  relative terrain context, not survey-grade drainage DTM

### Phase 2

- Dynamic World, WorldCover and GHSL after Bangkok validation
- MAIAC AOD, Sentinel-5P and ground stations after cross-validation
- GISTDA Disaster API and ThaiWater after license and coverage audit
- VIIRS nighttime lights as activity/light signal only
- network accessibility after road and timetable freshness validation
- CMIP6 ensemble as city-scale scenario with uncertainty, not district forecast

### Research only

- operational InSAR subsidence
- flood depth or hydraulic forecast
- street-level PM2.5/AQI from satellite
- parcel-level canopy, roof or building material
- causal health effects from spatial correlation
- neighborhood climate projection without downscaling and validation

## 5. Method rules

- เก็บ raster ที่ native resolution และใช้ analysis grid 250 เมตรสำหรับ
  cross-source synthesis
- ใช้ UTM 47N หรือ CRS ที่เหมาะสมกับพื้นที่และระยะ ไม่คำนวณพื้นที่บน Web Mercator
- เปรียบเทียบเดือนหรือฤดูกาลเดียวกัน
- ใช้ pixel-area weighting และรายงาน valid coverage
- รายงาน median, percentile และ IQR ไม่ใช้ district mean อย่างเดียว
- change candidate ต้องต่อเนื่องหลาย acquisition
- QA ต้องรวม cloud, shadow, aerosol, scene count, SAR speckle และ orbit direction
- classifier validation ใช้ spatial holdout และ precision/recall ราย class
- ไม่ downscale ERA5/IMERG เป็น 10 เมตรแล้วสื่อว่ามีความละเอียดระดับถนน
- composite score ต้องเปิดสูตร normalization น้ำหนัก และ sensitivity

## 6. Target architecture

```text
Remote sensing + Bangkok/DOPA open data
                 ↓
Immutable raw snapshots and checksums
                 ↓
Versioned processing recipes and QA gates
                 ↓
COG/PMTiles on R2 + observations on PostGIS
                 ↓
Dataset and product catalog with lineage
                 ↓
Fast read-only API
                 ↓
Evidence-first Observatory UI
```

Schema เป้าหมาย:

- `areas` และ geometry version
- `datasets` และ license/update metadata
- `dataset_versions` และ checksum
- `processing_runs` และ method/code version
- `products` และ indicator definition
- `observations` แบบ long-form ต่อ area/product/period/statistic
- `raster_assets` พร้อม CRS, resolution, nodata และ bbox
- `quality_flags` สำหรับ partial, cloud, provisional และ validation

ไม่ใช้ wide `district_statistics` เป็นฐานของ v2

## 7. Migration policy

### Keep after review

- Next.js, TypeScript, Tailwind
- Cloudflare/OpenNext, R2 และ Supabase/PostGIS
- GEE authentication helperสำหรับ ingestion worker
- scheduled processing และ R2 manifest concept
- boundary geometry หลังยืนยันแหล่งและ canonical code
- DOPA updater และ BMA source fetchers
- provenance, accessibility และ export concepts

### Do not migrate automatically

- mock, demo, fallback, seeded หรือ modeled rows ที่ไม่มี method manifest
- deterministic simulated rainfall
- generated LST/vegetation JSON
- NDVI/NDBI-derived tree, built area หรือ land-cover class fallback
- decision-support score เดิม
- live GEE request path

### Security gates

- GEE ไม่อยู่ใน public request path
- public read route ไม่ใช้ Supabase service role
- runtime validation ทุก external response
- rate limit สำหรับ expensive/export endpoint
- security headers และ dependency upgrade
- CI ต้องมี typecheck, ESLint, contract, data QA, build และ browser tests

## 8. Release sequence

1. Freeze legacy และจัด trust class ให้ทุก dataset
2. สร้าง v2 catalog, ontology และ canonical Bangkok areas
3. เขียน product recipe และ golden fixtures
4. สร้าง offline processing, QA และ immutable assets
5. เปิด API v2 แบบ read-only และ no synthetic fallback
6. สร้าง Observatory workspace
7. เชื่อม Bangkok/DOPA open-data context
8. เพิ่ม area profile, compare และ relationship lab
9. validate แบบ parallel ก่อน cutover
10. archive legacy และตัด Traffy/BigQuery หลัง migration ผ่าน

## 9. Implementation checkpoint

สถานะ ณ 26 กรกฎาคม 2026:

- `config/observatory/registry.json` เป็นทะเบียนกลางของ 11 แหล่งข้อมูลและ
  7 ผลิตภัณฑ์วิเคราะห์
- `scripts/observatory/validate-registry.mjs` ตรวจ ID, source reference,
  license gate, method version, coverage gate, checksum และ runtime geometry
- `src/data/observatory/bkk-districts.provisional.json` มีเฉพาะ area code, ชื่อ
  ระดับพื้นที่ และ geometry โดยไม่พก attribute จำลองจาก legacy
- runtime boundary ยังเป็น third-party provisional geometry
  ส่วนไฟล์ 50 เขตจาก BMA ถูกบันทึกเป็น candidate และยังไม่ publish
  เพราะ resource ระบุ license ไม่ชัดเจน
- boundary intake วันที่ 26 กรกฎาคม 2026 พบว่า KML ทางการขนาด 1,837 bytes
  ไม่มี Placemark/Polygon อยู่ภายใน แต่เป็น NetworkLink ไปยัง WMS ผ่าน HTTP
  จึงบันทึกเฉพาะ checksum และรายงานตรวจรับ โดยไม่เก็บ source KML และไม่ promote
  เป็น runtime geometry
- `supabase/migrations/015_observatory_v2_core.sql` สร้าง schema long-form,
  lineage, raster asset, quality flag และ RLS แบบ fail-closed
- `/api/v1/catalog` และ `/api/v1/status` เปิดเผย registry readiness
  โดยไม่อ้างว่าเป็น live source health
- `/api/v1/observations` ไม่เผยแพร่ผลจาก legacy bridge
  จนกว่า product status จะผ่าน publish gate
- สูตร `ndvi-seasonal-v1.0.0` ถูกแยกเป็น offline-batch manifest
  พร้อม golden fixtures 3 กรณี: ผ่าน gate, coverage ต่ำ และ scene count ต่ำ
  ผล QA ผ่านระดับ algorithm fixture แต่ Sentinel-2 dataset version
  และผลภาคสนามยังไม่ผ่าน validation จึงคง product เป็น acceptance
- CI ตรวจ registry, contract, TypeScript, scoped ESLint และ production build

งานข้อมูลลำดับถัดไป:

1. ขอ static KML/Shapefile/GeoPackage ทางการที่ฝัง geometry และใช้ HTTPS
2. ยืนยันสิทธิการใช้ซ้ำและการเผยแพร่ geometry
3. snapshot source, แปลง CRS, validate topology, เทียบพื้นที่/ชื่อ/รหัส และบันทึก checksum
4. seed canonical city/district/subdistrict areas จาก dataset version ที่ผ่านตรวจรับ
5. สร้าง offline Landsat/Sentinel recipes พร้อม golden fixtures และ QA report
6. publish COG/PMTiles และ long-form observations เฉพาะ processing run ที่ผ่าน gate
