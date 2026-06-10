/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";
import * as turf from "@turf/turf";
import geojson from "@/data/bkk_districts.json";
import ee, { initGEE } from "@/lib/gee";
import {
  combineComponents,
  minMaxNormalize,
  type DecisionMode,
  type ScoreComponent,
} from "@/lib/decision-support";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const features = geojson.features as any[];
const districtByName = new Map(features.map((feature) => [feature.properties.name_th, feature]));
const districtAreaSqKm = new Map(
  features.map((feature) => [feature.properties.name_th, turf.area(feature) / 1_000_000]),
);

type SourceStatus = {
  key: string;
  label: string;
  source: string;
  status: "available" | "unavailable";
  observationCount: number | null;
  note: string;
};

function evaluateEe<T>(object: any): Promise<T> {
  return new Promise((resolve, reject) => {
    object.evaluate((value: T, error: any) => error ? reject(error) : resolve(value));
  });
}

function withTimeout<T>(promise: Promise<T>, milliseconds: number): Promise<T> {
  return Promise.race([
    promise,
    new Promise<T>((_, reject) =>
      setTimeout(() => reject(new Error("GEE request timed out")), milliseconds),
    ),
  ]);
}

function districtCollection() {
  return ee.FeatureCollection(
    features.map((feature) =>
      ee.Feature(ee.Geometry(feature.geometry).simplify(100), {
        district_id: feature.properties.id,
        district_name: feature.properties.name_th,
      }),
    ),
  );
}

function numberOrNull(value: unknown, digits = 4): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Number(value.toFixed(digits))
    : null;
}

function maskSentinel2(image: any) {
  const scl = image.select("SCL");
  const clear = scl.neq(0).and(scl.neq(1)).and(scl.neq(3))
    .and(scl.neq(7)).and(scl.neq(8)).and(scl.neq(9))
    .and(scl.neq(10)).and(scl.neq(11));
  return image.updateMask(clear);
}

function maskLandsatL2(image: any) {
  const qa = image.select("QA_PIXEL");
  const clear = qa.bitwiseAnd(parseInt("111111", 2)).eq(0);
  const unsaturated = image.select("QA_RADSAT").eq(0);
  return image.updateMask(clear).updateMask(unsaturated);
}

function periodFor(year: number) {
  const now = new Date();
  const end = year === now.getUTCFullYear() ? now : new Date(Date.UTC(year, 11, 31));
  const start = new Date(end);
  start.setUTCDate(start.getUTCDate() - 30);
  const baselineStart = new Date(start);
  baselineStart.setUTCDate(baselineStart.getUTCDate() - 90);
  const iso = (date: Date) => date.toISOString().slice(0, 10);
  return {
    start: iso(start),
    end: iso(new Date(end.getTime() + 86400000)),
    baselineStart: iso(baselineStart),
    label: `${iso(start)} ถึง ${iso(end)}`,
  };
}

async function computeFloodGee(year: number) {
  await initGEE();
  const period = periodFor(year);
  const bounds = ee.Geometry.BBox(100.329, 13.494, 100.935, 13.956);

  const gpmCollection = ee.ImageCollection("NASA/GPM_L3/IMERG_V07")
    .filterBounds(bounds)
    .filterDate(period.start, period.end)
    .select("precipitation");
  // IMERG is a half-hourly collection whose precipitation band is mm/hr.
  const rainfall = gpmCollection.map((image: any) => image.multiply(0.5))
    .sum().rename("rainfall_mm");

  const sentinel1 = (start: string, end: string) => ee.ImageCollection("COPERNICUS/S1_GRD")
    .filterBounds(bounds)
    .filterDate(start, end)
    .filter(ee.Filter.eq("instrumentMode", "IW"))
    .filter(ee.Filter.eq("orbitProperties_pass", "DESCENDING"))
    .filter(ee.Filter.listContains("transmitterReceiverPolarisation", "VV"))
    .select("VV");
  const recentSarCollection = sentinel1(period.start, period.end);
  const baselineSarCollection = sentinel1(period.baselineStart, period.start);
  const sarWetness = baselineSarCollection.median()
    .subtract(recentSarCollection.median())
    .rename("sar_wetness_db");

  const sentinel2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(bounds)
    .filterDate(period.start, period.end)
    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40))
    .map(maskSentinel2)
    .map((image: any) => image.addBands(
      image.normalizedDifference(["B3", "B8"]).rename("NDWI"),
    ));
  const ndwi = sentinel2.select("NDWI").median();
  const permanentWater = ee.Image("JRC/GSW1_4/GlobalSurfaceWater")
    .select("occurrence").gte(70);
  const seasonalWater = ndwi.gt(0.05).and(permanentWater.not()).rename("water_signal");
  const elevation = ee.Image("USGS/SRTMGL1_003").select("elevation").rename("elevation_m");

  const [gpmCount, recentSarCount, baselineSarCount, sentinel2Count] = await Promise.all([
    evaluateEe<number>(gpmCollection.size()),
    evaluateEe<number>(recentSarCollection.size()),
    evaluateEe<number>(baselineSarCollection.size()),
    evaluateEe<number>(sentinel2.size()),
  ]);
  if (!gpmCount || !recentSarCount || !baselineSarCount || !sentinel2Count) {
    throw new Error("GEE collections do not contain enough observations for the selected period");
  }

  const stack = rainfall.addBands(sarWetness).addBands(seasonalWater).addBands(elevation);
  const result = await evaluateEe<any>(stack.reduceRegions({
    collection: districtCollection(),
    reducer: ee.Reducer.mean(),
    scale: 250,
    tileScale: 4,
  }));

  return {
    period,
    counts: { gpm: gpmCount, sarRecent: recentSarCount, sarBaseline: baselineSarCount, sentinel2: sentinel2Count },
    rows: (result?.features ?? []).map((feature: any) => {
      const p = feature.properties ?? {};
      return {
        district_id: p.district_id,
        district_name: p.district_name,
        rainfall: numberOrNull(p.rainfall_mm, 2),
        sar_wetness: numberOrNull(p.sar_wetness_db, 3),
        water_signal: numberOrNull(p.water_signal, 4),
        elevation: numberOrNull(p.elevation_m, 2),
      };
    }),
  };
}

async function computeHeatGee(year: number) {
  await initGEE();
  const bounds = ee.Geometry.BBox(100.329, 13.494, 100.935, 13.956);
  const start = `${year}-01-01`;
  const now = new Date();
  const end = year === now.getUTCFullYear()
    ? now.toISOString().slice(0, 10)
    : `${year + 1}-01-01`;

  const landsat8 = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2");
  const landsat = (year >= 2022
    ? landsat8.merge(ee.ImageCollection("LANDSAT/LC09/C02/T1_L2"))
    : landsat8)
    .filterBounds(bounds)
    .filterDate(start, end)
    .filter(ee.Filter.eq("PROCESSING_LEVEL", "L2SP"))
    .map(maskLandsatL2)
    .map((image: any) => image.select("ST_B10")
      .multiply(0.00341802).add(149).subtract(273.15).rename("LST"));

  const sentinel2 = ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(bounds)
    .filterDate(start, end)
    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40))
    .map(maskSentinel2)
    .map((image: any) => {
      const ndvi = image.normalizedDifference(["B8", "B4"]).rename("NDVI");
      const ndbi = image.normalizedDifference(["B11", "B8"]).rename("NDBI");
      return image.addBands([ndvi, ndbi]);
    });

  const [landsatCount, sentinel2Count] = await Promise.all([
    evaluateEe<number>(landsat.size()),
    evaluateEe<number>(sentinel2.size()),
  ]);
  if (!landsatCount || !sentinel2Count) {
    throw new Error("GEE collections do not contain enough observations for the selected year");
  }

  const heatStack = landsat.select("LST").median().rename("mean_lst")
    .addBands(landsat.select("LST").reduce(ee.Reducer.percentile([90])).rename("lst_p90"))
    .addBands(sentinel2.select("NDVI").median().rename("ndvi"))
    .addBands(sentinel2.select("NDBI").median().rename("ndbi"));
  const result = await evaluateEe<any>(heatStack.reduceRegions({
    collection: districtCollection(),
    reducer: ee.Reducer.mean(),
    scale: 100,
    tileScale: 4,
  }));

  return {
    period: { label: `${start} ถึง ${end}` },
    counts: { landsat: landsatCount, sentinel2: sentinel2Count },
    rows: (result?.features ?? []).map((feature: any) => {
      const p = feature.properties ?? {};
      return {
        district_id: p.district_id,
        district_name: p.district_name,
        mean_lst: numberOrNull(p.mean_lst, 2),
        lst_p90: numberOrNull(p.lst_p90, 2),
        ndvi: numberOrNull(p.ndvi, 4),
        ndbi: numberOrNull(p.ndbi, 4),
      };
    }),
  };
}

function bigQueryClient() {
  if (!process.env.BQ_PROJECT_ID || !process.env.BQ_DATASET || !process.env.BQ_CREDENTIALS) return null;
  try {
    return new BigQuery({
      projectId: process.env.BQ_PROJECT_ID,
      credentials: JSON.parse(process.env.BQ_CREDENTIALS),
    });
  } catch {
    return null;
  }
}

async function loadFloodComplaints(year: number) {
  const client = bigQueryClient();
  if (!client) return { available: false, rows: [] as any[] };
  const table = `\`${process.env.BQ_PROJECT_ID}.${process.env.BQ_DATASET}.traffy_complaints\``;
  const query = `
    WITH deduped AS (
      SELECT * FROM ${table}
      QUALIFY ROW_NUMBER() OVER (
        PARTITION BY ticket_id ORDER BY COALESCE(ingested_at, created_at) DESC
      ) = 1
    )
    SELECT district, COUNT(*) AS total,
      COUNTIF(state IN ('รอรับเรื่อง', 'กำลังดำเนินการ', 'ส่งต่อ(ใหม่)', 'ส่งต่อ')) AS unresolved
    FROM deduped
    WHERE EXTRACT(YEAR FROM created_at AT TIME ZONE 'Asia/Bangkok') = @year
      AND (
        problem_type = 'น้ำท่วม/ระบายน้ำ'
        OR REGEXP_CONTAINS(IFNULL(description, ''), r'น้ำท่วม|น้ำขัง|น้ำรอระบาย|ระบายน้ำ|ท่อตัน|ฝาท่อ|บ่อพัก|คลอง')
      )
    GROUP BY district
  `;
  const [rows] = await client.query({
    query,
    params: { year },
    types: { year: "INT64" },
    location: "asia-southeast1",
  });
  return { available: true, rows };
}

function buildFeature(row: any) {
  const feature = districtByName.get(row.district_name) as any;
  return { ...feature, properties: { ...feature.properties, ...row } };
}

function summarize(rows: any[], sourceStatus: SourceStatus[]) {
  const scored = rows.filter((row) => typeof row.score === "number");
  const averageScore = scored.length
    ? Number((scored.reduce((sum, row) => sum + row.score, 0) / scored.length).toFixed(1))
    : null;
  return {
    totalDistricts: rows.length,
    scoredDistricts: scored.length,
    averageScore,
    highDistricts: scored.filter((row) => row.score >= 60).length,
    averageCoverage: rows.length
      ? Math.round(rows.reduce((sum, row) => sum + row.coverage, 0) / rows.length)
      : 0,
    sourceStatus,
  };
}

async function floodResponse(year: number) {
  const [geeSettled, complaintResult] = await Promise.all([
    withTimeout(computeFloodGee(year), 50000)
      .then((value) => ({ value, error: null as string | null }))
      .catch((error) => ({ value: null, error: error?.message ?? "GEE unavailable" })),
    loadFloodComplaints(year).catch(() => ({ available: false, rows: [] })),
  ]);
  const geeResult = geeSettled.value;
  const complaintByName = new Map(complaintResult.rows.map((row: any) => [row.district, row]));
  const geeByName = new Map((geeResult?.rows ?? []).map((row: any) => [row.district_name, row]));

  const rawRows = features.map((feature) => {
    const name = feature.properties.name_th;
    const geeRow: any = geeByName.get(name);
    const complaint: any = complaintByName.get(name);
    const area = districtAreaSqKm.get(name) ?? null;
    return {
      district_id: feature.properties.id,
      district_name: name,
      rainfall: geeRow?.rainfall ?? null,
      sar_wetness: geeRow?.sar_wetness ?? null,
      water_signal: geeRow?.water_signal ?? null,
      elevation: geeRow?.elevation ?? null,
      complaint_density: complaint && area ? Number(complaint.total) / area : null,
      unresolved: complaint ? Number(complaint.unresolved) : null,
      complaint_total: complaint ? Number(complaint.total) : null,
    };
  });
  const fields = {
    rainfall: rawRows.map((row) => row.rainfall),
    sar: rawRows.map((row) => row.sar_wetness),
    water: rawRows.map((row) => row.water_signal),
    elevation: rawRows.map((row) => row.elevation),
    complaints: rawRows.map((row) => row.complaint_density),
  };
  const rows = rawRows.map((row) => {
    const components: ScoreComponent[] = [
      { key: "rainfall", label: "ฝนสะสม 30 วัน", value: row.rainfall, normalized: minMaxNormalize(row.rainfall, fields.rainfall), weight: 25, source: "NASA GPM IMERG V07", unit: "มม.", status: row.rainfall === null ? "unavailable" : "observed", observationCount: geeResult?.counts.gpm ?? null },
      { key: "sar", label: "การลดลงของ VV backscatter", value: row.sar_wetness, normalized: minMaxNormalize(row.sar_wetness, fields.sar), weight: 20, source: "Copernicus Sentinel-1 GRD", unit: "dB", status: row.sar_wetness === null ? "unavailable" : "derived", observationCount: geeResult ? geeResult.counts.sarRecent + geeResult.counts.sarBaseline : null },
      { key: "water", label: "สัดส่วนสัญญาณน้ำชั่วคราว", value: row.water_signal, normalized: minMaxNormalize(row.water_signal, fields.water), weight: 25, source: "Sentinel-2 SR + JRC Surface Water", unit: "สัดส่วน", status: row.water_signal === null ? "unavailable" : "derived", observationCount: geeResult?.counts.sentinel2 ?? null },
      { key: "elevation", label: "ระดับความสูงเฉลี่ย", value: row.elevation, normalized: minMaxNormalize(row.elevation, fields.elevation, true), weight: 15, source: "USGS SRTMGL1 30 m", unit: "ม.", status: row.elevation === null ? "unavailable" : "observed" },
      { key: "complaints", label: "เหตุร้องเรียนต่อ ตร.กม.", value: row.complaint_density, normalized: minMaxNormalize(row.complaint_density, fields.complaints), weight: 15, source: "Traffy Fondue / BigQuery", unit: "เรื่อง/ตร.กม.", status: row.complaint_density === null ? "unavailable" : "observed" },
    ];
    return { ...row, ...combineComponents(components, 5, 0.55) };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  const sourceStatus: SourceStatus[] = [
    { key: "gpm", label: "ฝนสะสม", source: "NASA GPM IMERG V07", status: geeResult ? "available" : "unavailable", observationCount: geeResult?.counts.gpm ?? null, note: geeResult ? "ผลรวมอัตราฝนครึ่งชั่วโมง คูณ 0.5 เป็นมิลลิเมตร" : "ไม่สามารถเชื่อมต่อหรือประมวลผล Google Earth Engine ในรอบนี้" },
    { key: "sar", label: "เรดาร์", source: "Sentinel-1 GRD", status: geeResult ? "available" : "unavailable", observationCount: geeResult ? geeResult.counts.sarRecent + geeResult.counts.sarBaseline : null, note: "ผลต่าง median VV ระหว่างช่วงฐานและ 30 วันล่าสุด" },
    { key: "water", label: "สัญญาณน้ำ", source: "Sentinel-2 SR + JRC", status: geeResult ? "available" : "unavailable", observationCount: geeResult?.counts.sentinel2 ?? null, note: "NDWI > 0.05 และตัดน้ำถาวร occurrence ≥ 70%" },
    { key: "elevation", label: "ระดับพื้นที่", source: "SRTMGL1", status: geeResult ? "available" : "unavailable", observationCount: null, note: "ระดับความสูงเฉลี่ยรายเขต" },
    { key: "traffy", label: "เหตุร้องเรียน", source: "Traffy Fondue", status: complaintResult.available ? "available" : "unavailable", observationCount: complaintResult.available ? complaintResult.rows.reduce((sum: number, row: any) => sum + Number(row.total || 0), 0) : null, note: "ข้อมูลร้องเรียนจริง มีอคติจากพฤติกรรมการรายงาน" },
  ];
  return {
    mode: "flood" as DecisionMode,
    title: "ลำดับความสำคัญรับมือน้ำท่วม",
    period: geeResult?.period.label ?? `ปี ${year}`,
    rows,
    geojson: { type: "FeatureCollection", features: rows.map(buildFeature) },
    summary: summarize(rows, sourceStatus),
    methodology: "คะแนนสัมพัทธ์ 0-100 จากข้อมูลสังเกตจริงและตัวแปรที่คำนวณจากภาพจริง ต้องมีอย่างน้อย 3 ใน 5 องค์ประกอบจึงออกคะแนน",
    limitations: [
      "ไม่ใช้ district_statistics เป็น fallback เพราะแถวเดิมไม่มี provenance ของข้อมูลน้ำ",
      "ไม่ใช่แบบจำลองชลศาสตร์หรือการพยากรณ์ระดับน้ำ",
      "ควรเพิ่มโครงข่ายท่อ คลอง ความจุสถานีสูบน้ำ และระดับถนนก่อนใช้สั่งการภาคสนาม",
    ],
  };
}

async function heatResponse(year: number) {
  const settled = await withTimeout(computeHeatGee(year), 50000)
    .then((value) => ({ value, error: null as string | null }))
    .catch((error) => ({ value: null, error: error?.message ?? "GEE unavailable" }));
  const geeResult = settled.value;
  const geeByName = new Map((geeResult?.rows ?? []).map((row: any) => [row.district_name, row]));
  const rawRows = features.map((feature) => {
    const row: any = geeByName.get(feature.properties.name_th);
    return {
      district_id: feature.properties.id,
      district_name: feature.properties.name_th,
      mean_lst: row?.mean_lst ?? null,
      lst_p90: row?.lst_p90 ?? null,
      green_deficit: typeof row?.ndvi === "number" ? 1 - ((row.ndvi + 1) / 2) : null,
      ndvi: row?.ndvi ?? null,
      ndbi: row?.ndbi ?? null,
    };
  });
  const fields = {
    lst: rawRows.map((row) => row.mean_lst),
    lstP90: rawRows.map((row) => row.lst_p90),
    green: rawRows.map((row) => row.green_deficit),
    builtup: rawRows.map((row) => row.ndbi),
  };
  const rows = rawRows.map((row) => {
    const components: ScoreComponent[] = [
      { key: "lst", label: "LST median รายปี", value: row.mean_lst, normalized: minMaxNormalize(row.mean_lst, fields.lst), weight: 35, source: "USGS Landsat 8/9 C2 L2", unit: "°C", status: row.mean_lst === null ? "unavailable" : "observed", observationCount: geeResult?.counts.landsat ?? null },
      { key: "lst_p90", label: "LST percentile 90", value: row.lst_p90, normalized: minMaxNormalize(row.lst_p90, fields.lstP90), weight: 20, source: "USGS Landsat 8/9 C2 L2", unit: "°C", status: row.lst_p90 === null ? "unavailable" : "derived", observationCount: geeResult?.counts.landsat ?? null },
      { key: "green", label: "การขาดความเขียว", value: row.green_deficit, normalized: minMaxNormalize(row.green_deficit, fields.green), weight: 25, source: "Sentinel-2 SR NDVI", unit: "ดัชนี", status: row.green_deficit === null ? "unavailable" : "derived", observationCount: geeResult?.counts.sentinel2 ?? null },
      { key: "builtup", label: "NDBI", value: row.ndbi, normalized: minMaxNormalize(row.ndbi, fields.builtup), weight: 20, source: "Sentinel-2 SR NDBI", unit: "ดัชนี", status: row.ndbi === null ? "unavailable" : "derived", observationCount: geeResult?.counts.sentinel2 ?? null },
    ];
    const result = combineComponents(components, 4, 0.5);
    const hasThermal = row.mean_lst !== null || row.lst_p90 !== null;
    const hasLandCover = row.ndvi !== null || row.ndbi !== null;
    return hasThermal && hasLandCover
      ? { ...row, ...result }
      : { ...row, ...result, score: null, level: "ข้อมูลไม่พอ" as const, confidence: "ต่ำ" as const };
  }).sort((a, b) => (b.score ?? -1) - (a.score ?? -1));

  const sourceStatus: SourceStatus[] = [
    { key: "landsat", label: "อุณหภูมิพื้นผิว", source: "Landsat 8/9 Collection 2 Level 2", status: geeResult ? "available" : "unavailable", observationCount: geeResult?.counts.landsat ?? null, note: geeResult ? "ST_B10 ที่ผ่าน QA cloud/saturation และแปลงด้วย scale/offset ของ USGS" : "ไม่สามารถเชื่อมต่อหรือประมวลผล Google Earth Engine ในรอบนี้" },
    { key: "sentinel2", label: "ความเขียวและสิ่งปลูกสร้าง", source: "Sentinel-2 SR Harmonized", status: geeResult ? "available" : "unavailable", observationCount: geeResult?.counts.sentinel2 ?? null, note: "annual median NDVI และ NDBI หลัง SCL cloud mask" },
    { key: "social", label: "ความเปราะบางทางสังคม", source: "ยังไม่มีแหล่งทางการ", status: "unavailable", observationCount: null, note: "ไม่ใช้ population/density จาก pipeline เดิมเพราะไม่มี provenance ที่เชื่อถือได้" },
  ];
  return {
    mode: "heat" as DecisionMode,
    title: "ลำดับพื้นที่เผชิญความร้อนเชิงกายภาพ",
    period: geeResult?.period.label ?? `ปี ${year}`,
    rows,
    geojson: { type: "FeatureCollection", features: rows.map(buildFeature) },
    summary: summarize(rows, sourceStatus),
    methodology: "คะแนนสัมพัทธ์ 0-100 จาก Landsat LST และ Sentinel-2 NDVI/NDBI ที่คำนวณสด ต้องมีอย่างน้อย 2 ใน 4 องค์ประกอบจึงออกคะแนน",
    limitations: [
      "ไม่ใช้ NDVI modeled, NDBI seeded estimate หรือ LST ที่ไม่มี provenance จาก district_statistics",
      "LST คืออุณหภูมิพื้นผิว ไม่ใช่อุณหภูมิอากาศหรือค่าความสบายเชิงความร้อน",
      "ยังไม่ใช่ Heat Vulnerability เพราะไม่มีข้อมูลทางการของผู้สูงอายุ เด็ก ผู้ป่วยติดเตียง รายได้ และการเข้าถึงพื้นที่เย็น",
    ],
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode: DecisionMode = searchParams.get("mode") === "heat" ? "heat" : "flood";
    const year = Number.parseInt(searchParams.get("year") || "2024", 10);
    if (!Number.isInteger(year) || year < 2018 || year > new Date().getUTCFullYear()) {
      return NextResponse.json({ error: "year ไม่อยู่ในช่วงที่รองรับ" }, { status: 400 });
    }
    const payload = mode === "heat" ? await heatResponse(year) : await floodResponse(year);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=300" },
    });
  } catch (error: any) {
    console.error("Decision support API error:", error);
    return NextResponse.json({ error: error?.message ?? "Unknown error" }, { status: 500 });
  }
}
