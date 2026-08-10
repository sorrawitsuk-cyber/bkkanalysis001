/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";
import * as turf from "@turf/turf";
import geojson from "@/data/bkk_districts.json";
import populationData from "@/data/bkk_population.json";
import accessibilityData from "@/data/bkk_accessibility.json";
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
const POPULATION_MIN_YEAR = 2018;
const POPULATION_MAX_YEAR = Number(populationData.metadata.max_year) || 2025;
const accessibilityByName = new Map(
  (accessibilityData.districts as any[]).map((district) => [district.district_name, district]),
);

type SourceStatus = {
  key: string;
  label: string;
  source: string;
  status: "available" | "unavailable";
  observationCount: number | null;
  note: string;
  quality?: "observed" | "administrative" | "model-derived" | "screening";
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

function median(values: Array<number | null | undefined>): number | null {
  const valid = values
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value))
    .sort((a, b) => a - b);
  if (!valid.length) return null;
  const middle = Math.floor(valid.length / 2);
  return valid.length % 2 === 0
    ? (valid[middle - 1] + valid[middle]) / 2
    : valid[middle];
}

function loadRegisteredPopulation(requestedYear: number) {
  const populationYear = Math.max(
    POPULATION_MIN_YEAR,
    Math.min(POPULATION_MAX_YEAR, requestedYear),
  );
  const totals = new Map<string, { population: number; houses: number }>();
  for (const subdistrict of populationData.subdistricts as any[]) {
    const record = subdistrict.records?.find((item: any) => item.year === populationYear);
    if (!record) continue;
    const current = totals.get(subdistrict.district_name) ?? { population: 0, houses: 0 };
    current.population += Number(record.population) || 0;
    current.houses += Number(record.houses) || 0;
    totals.set(subdistrict.district_name, current);
  }
  return { populationYear, totals };
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

async function computeHeatGee(year: number, baselineYear: number) {
  await initGEE();
  const bounds = ee.Geometry.BBox(100.329, 13.494, 100.935, 13.956);
  const now = new Date();
  const currentYear = now.getUTCFullYear();
  const today = now.toISOString().slice(0, 10);
  const selectedWindowEnd = year === currentYear ? today.slice(5) : null;

  const buildComposite = (targetYear: number, capMonthDay: string | null) => {
    const start = `${targetYear}-01-01`;
    const end = capMonthDay
      ? `${targetYear}-${capMonthDay}`
      : targetYear === currentYear
        ? today
        : `${targetYear + 1}-01-01`;
    const landsat8 = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2");
    const landsat = (targetYear >= 2022
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

    const dynamicWorld = ee.ImageCollection("GOOGLE/DYNAMICWORLD/V1")
      .filterBounds(bounds)
      .filterDate(start, end);
    const probabilities = dynamicWorld
      .select(["water", "trees", "grass", "flooded_vegetation", "crops", "shrub_and_scrub", "built", "bare", "snow_and_ice"])
      .mean();
    const label = probabilities.toArray().arrayArgmax().arrayGet([0]);
    const confidence = probabilities.reduce(ee.Reducer.max());
    const treeCoverRatio = label.eq(1)
      .updateMask(confidence.gte(0.45))
      .rename("tree_cover_ratio");

    const image = landsat.select("LST").median().rename("mean_lst")
      .addBands(landsat.select("LST").reduce(ee.Reducer.percentile([90])).rename("lst_p90"))
      .addBands(sentinel2.select("NDVI").median().rename("ndvi"))
      .addBands(sentinel2.select("NDBI").median().rename("ndbi"))
      .addBands(treeCoverRatio);
    return { start, end, landsat, sentinel2, dynamicWorld, image };
  };

  const current = buildComposite(year, selectedWindowEnd);
  const baseline = buildComposite(baselineYear, selectedWindowEnd);
  const [landsatCount, sentinel2Count, dynamicWorldCount, baselineLandsatCount, baselineSentinel2Count, baselineDynamicWorldCount] = await Promise.all([
    evaluateEe<number>(current.landsat.size()),
    evaluateEe<number>(current.sentinel2.size()),
    evaluateEe<number>(current.dynamicWorld.size()),
    evaluateEe<number>(baseline.landsat.size()),
    evaluateEe<number>(baseline.sentinel2.size()),
    evaluateEe<number>(baseline.dynamicWorld.size()),
  ]);
  if (
    !landsatCount || !sentinel2Count || !dynamicWorldCount
    || !baselineLandsatCount || !baselineSentinel2Count || !baselineDynamicWorldCount
  ) {
    throw new Error("GEE collections do not contain enough observations for the selected comparison window");
  }

  const baselineImage = baseline.image.select(
    ["mean_lst", "lst_p90", "ndvi", "ndbi", "tree_cover_ratio"],
    ["baseline_mean_lst", "baseline_lst_p90", "baseline_ndvi", "baseline_ndbi", "baseline_tree_cover_ratio"],
  );
  const result = await evaluateEe<any>(current.image.addBands(baselineImage).reduceRegions({
    collection: districtCollection(),
    reducer: ee.Reducer.mean(),
    scale: 100,
    tileScale: 4,
  }));

  return {
    period: {
      label: `${current.start} ถึง ${current.end}`,
      baselineLabel: `${baseline.start} ถึง ${baseline.end}`,
    },
    counts: {
      landsat: landsatCount,
      sentinel2: sentinel2Count,
      dynamicWorld: dynamicWorldCount,
      baselineLandsat: baselineLandsatCount,
      baselineSentinel2: baselineSentinel2Count,
      baselineDynamicWorld: baselineDynamicWorldCount,
    },
    rows: (result?.features ?? []).map((feature: any) => {
      const p = feature.properties ?? {};
      const currentLst = numberOrNull(p.mean_lst, 2);
      const baselineLst = numberOrNull(p.baseline_mean_lst, 2);
      const currentTreeCover = typeof p.tree_cover_ratio === "number"
        ? numberOrNull(p.tree_cover_ratio * 100, 2)
        : null;
      const baselineTreeCover = typeof p.baseline_tree_cover_ratio === "number"
        ? numberOrNull(p.baseline_tree_cover_ratio * 100, 2)
        : null;
      return {
        district_id: p.district_id,
        district_name: p.district_name,
        mean_lst: currentLst,
        baseline_mean_lst: baselineLst,
        lst_delta: currentLst !== null && baselineLst !== null
          ? numberOrNull(currentLst - baselineLst, 2)
          : null,
        lst_p90: numberOrNull(p.lst_p90, 2),
        baseline_lst_p90: numberOrNull(p.baseline_lst_p90, 2),
        ndvi: numberOrNull(p.ndvi, 4),
        baseline_ndvi: numberOrNull(p.baseline_ndvi, 4),
        ndbi: numberOrNull(p.ndbi, 4),
        baseline_ndbi: numberOrNull(p.baseline_ndbi, 4),
        tree_cover_pct: currentTreeCover,
        baseline_tree_cover_pct: baselineTreeCover,
        tree_cover_delta_pp: currentTreeCover !== null && baselineTreeCover !== null
          ? numberOrNull(currentTreeCover - baselineTreeCover, 2)
          : null,
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

async function heatResponse(year: number, baselineYear: number) {
  const settled = await withTimeout(computeHeatGee(year, baselineYear), 50000)
    .then((value) => ({ value, error: null as string | null }))
    .catch((error) => ({ value: null, error: error?.message ?? "GEE unavailable" }));
  const geeResult = settled.value;
  const geeByName = new Map((geeResult?.rows ?? []).map((row: any) => [row.district_name, row]));
  const registeredPopulation = loadRegisteredPopulation(year);
  const rawRows = features.map((feature) => {
    const row: any = geeByName.get(feature.properties.name_th);
    const population = registeredPopulation.totals.get(feature.properties.name_th);
    const accessibility: any = accessibilityByName.get(feature.properties.name_th);
    const recreation = accessibility?.categories?.recreation;
    const areaSqKm = districtAreaSqKm.get(feature.properties.name_th) ?? null;
    const populationValue = population?.population ?? null;
    const recreationAccessPct = numberOrNull(recreation?.coverage_pct, 1);
    return {
      district_id: feature.properties.id,
      district_name: feature.properties.name_th,
      mean_lst: row?.mean_lst ?? null,
      baseline_mean_lst: row?.baseline_mean_lst ?? null,
      lst_delta: row?.lst_delta ?? null,
      lst_p90: row?.lst_p90 ?? null,
      baseline_lst_p90: row?.baseline_lst_p90 ?? null,
      green_deficit: typeof row?.ndvi === "number" ? 1 - ((row.ndvi + 1) / 2) : null,
      ndvi: row?.ndvi ?? null,
      baseline_ndvi: row?.baseline_ndvi ?? null,
      ndbi: row?.ndbi ?? null,
      baseline_ndbi: row?.baseline_ndbi ?? null,
      tree_cover_pct: row?.tree_cover_pct ?? null,
      baseline_tree_cover_pct: row?.baseline_tree_cover_pct ?? null,
      tree_cover_delta_pp: row?.tree_cover_delta_pp ?? null,
      population: populationValue,
      population_year: registeredPopulation.populationYear,
      houses: population?.houses ?? null,
      population_density: populationValue !== null && areaSqKm
        ? numberOrNull(populationValue / areaSqKm, 1)
        : null,
      recreation_access_pct: recreationAccessPct,
      recreation_access_gap_pct: recreationAccessPct !== null
        ? numberOrNull(100 - recreationAccessPct, 1)
        : null,
      recreation_p90_minutes: numberOrNull(recreation?.p90_minutes, 1),
      recreation_service_count: typeof recreation?.service_count === "number"
        ? recreation.service_count
        : null,
    };
  });
  const thresholds = {
    mean_lst: median(rawRows.map((row) => row.mean_lst)),
    population_density: median(rawRows.map((row) => row.population_density)),
    recreation_access_pct: median(rawRows.map((row) => row.recreation_access_pct)),
  };
  const fields = {
    lst: rawRows.map((row) => row.mean_lst),
    lstP90: rawRows.map((row) => row.lst_p90),
    green: rawRows.map((row) => row.green_deficit),
    builtup: rawRows.map((row) => row.ndbi),
  };
  const rows = rawRows.map((row) => {
    const components: ScoreComponent[] = [
      { key: "lst", label: "LST เฉลี่ยรายเขตจากภาพ median รายปี", value: row.mean_lst, normalized: minMaxNormalize(row.mean_lst, fields.lst), weight: 35, source: "USGS Landsat 8/9 C2 L2", unit: "°C", status: row.mean_lst === null ? "unavailable" : "observed", observationCount: geeResult?.counts.landsat ?? null },
      { key: "lst_p90", label: "LST percentile 90", value: row.lst_p90, normalized: minMaxNormalize(row.lst_p90, fields.lstP90), weight: 20, source: "USGS Landsat 8/9 C2 L2", unit: "°C", status: row.lst_p90 === null ? "unavailable" : "derived", observationCount: geeResult?.counts.landsat ?? null },
      { key: "green", label: "การขาดความเขียว", value: row.green_deficit, normalized: minMaxNormalize(row.green_deficit, fields.green), weight: 25, source: "Sentinel-2 SR NDVI", unit: "ดัชนี", status: row.green_deficit === null ? "unavailable" : "derived", observationCount: geeResult?.counts.sentinel2 ?? null },
      { key: "builtup", label: "NDBI", value: row.ndbi, normalized: minMaxNormalize(row.ndbi, fields.builtup), weight: 20, source: "Sentinel-2 SR NDBI", unit: "ดัชนี", status: row.ndbi === null ? "unavailable" : "derived", observationCount: geeResult?.counts.sentinel2 ?? null },
    ];
    const result = combineComponents(components, 4, 0.5);
    const hasThermal = row.mean_lst !== null || row.lst_p90 !== null;
    const hasLandCover = row.ndvi !== null || row.ndbi !== null;
    const screeningReady = row.mean_lst !== null
      && row.population_density !== null
      && row.recreation_access_pct !== null
      && thresholds.mean_lst !== null
      && thresholds.population_density !== null
      && thresholds.recreation_access_pct !== null;
    const heatHigh = screeningReady ? row.mean_lst >= thresholds.mean_lst! : null;
    const populationHigh = screeningReady
      ? row.population_density! >= thresholds.population_density!
      : null;
    const coolingAccessLow = screeningReady
      ? row.recreation_access_pct! < thresholds.recreation_access_pct!
      : null;
    const activeFlags = [heatHigh, populationHigh, coolingAccessLow].filter(Boolean).length;
    const labelParts = [
      heatHigh ? "อุณหภูมิผิวสูง" : null,
      populationHigh ? "คนหนาแน่น" : null,
      coolingAccessLow ? "เข้าถึงพื้นที่คลายร้อนต่ำ" : null,
    ].filter(Boolean);
    const screening = {
      ready: screeningReady,
      heat_high: heatHigh,
      population_high: populationHigh,
      cooling_access_low: coolingAccessLow,
      flag_count: screeningReady ? activeFlags : null,
      label: screeningReady
        ? labelParts.length
          ? labelParts.join(" · ")
          : "ต่ำกว่าค่ากลางทั้งสามมิติ"
        : "ข้อมูลไม่พอสำหรับคัดกรอง",
    };
    return hasThermal && hasLandCover
      ? { ...row, ...result, screening }
      : { ...row, ...result, screening, score: null, level: "ข้อมูลไม่พอ" as const, confidence: "ต่ำ" as const };
  }).sort((a, b) => {
    const flagDifference = (b.screening.flag_count ?? -1) - (a.screening.flag_count ?? -1);
    if (flagDifference !== 0) return flagDifference;
    return (b.mean_lst ?? -Infinity) - (a.mean_lst ?? -Infinity);
  });

  const sourceStatus: SourceStatus[] = [
    { key: "landsat", label: "อุณหภูมิพื้นผิว", source: "Landsat 8/9 Collection 2 Level 2", status: geeResult ? "available" : "unavailable", observationCount: geeResult?.counts.landsat ?? null, quality: "observed", note: geeResult ? "ST_B10 ผ่าน QA cloud/saturation; เปรียบเทียบกับปีฐานในช่วงปฏิทินเดียวกัน" : "ไม่สามารถเชื่อมต่อหรือประมวลผล Google Earth Engine ในรอบนี้" },
    { key: "sentinel2", label: "สภาพพืชพรรณ", source: "Sentinel-2 SR Harmonized", status: geeResult ? "available" : "unavailable", observationCount: geeResult?.counts.sentinel2 ?? null, quality: "observed", note: "NDVI median หลัง SCL cloud mask; เป็นสัญญาณความเขียว ไม่ใช่พื้นที่เรือนยอดไม้" },
    { key: "dynamic-world", label: "เรือนยอดไม้", source: "Google Dynamic World V1", status: geeResult ? "available" : "unavailable", observationCount: geeResult?.counts.dynamicWorld ?? null, quality: "model-derived", note: "tree class จาก probability เฉลี่ยรายปีและใช้ confidence ≥ 45%; ต้องอ่านแยกจาก NDVI" },
    { key: "population", label: "ประชากรตามทะเบียน", source: String(populationData.metadata.population_source_th), status: registeredPopulation.totals.size === 50 ? "available" : "unavailable", observationCount: registeredPopulation.totals.size, quality: "administrative", note: `ใช้ข้อมูลเดือนธันวาคม ${registeredPopulation.populationYear}; ไม่ใช่จำนวนคนที่อยู่จริงทุกช่วงเวลา` },
    { key: "cooling-access", label: "การเข้าถึงพื้นที่คลายร้อน", source: "BMA Open Data: สวน ห้องสมุด และศูนย์กีฬา", status: accessibilityByName.size === 50 ? "available" : "unavailable", observationCount: accessibilityData.services.filter((service: any) => service.category === "recreation").length, quality: "screening", note: "proximity screening จากจุดตัวอย่าง 250 ม. และระยะเส้นตรงปรับ detour; ไม่ใช่เวลาเดินทางบนโครงข่ายจริง" },
  ];
  const summaryBase = summarize(rows, sourceStatus);
  const screeningRows = rows.filter((row) => row.screening.ready);
  const highExposureRows = screeningRows.filter((row) => row.screening.flag_count === 3);
  return {
    mode: "heat" as DecisionMode,
    title: "คัดกรองการรับสัมผัสความร้อนและการเข้าถึงพื้นที่คลายร้อน",
    period: geeResult?.period.label ?? `ปี ${year}`,
    baselinePeriod: geeResult?.period.baselineLabel ?? `ปี ${baselineYear}`,
    selectedYear: year,
    baselineYear,
    rows,
    geojson: { type: "FeatureCollection", features: rows.map(buildFeature) },
    summary: {
      ...summaryBase,
      heatScreening: {
        readyDistricts: screeningRows.length,
        allThreeFlagsDistricts: highExposureRows.length,
        heatHighDistricts: screeningRows.filter((row) => row.screening.heat_high).length,
        populationHighDistricts: screeningRows.filter((row) => row.screening.population_high).length,
        coolingAccessLowDistricts: screeningRows.filter((row) => row.screening.cooling_access_low).length,
        registeredPopulationInAllThree: highExposureRows.reduce(
          (sum, row) => sum + (row.population ?? 0),
          0,
        ),
        populationYear: registeredPopulation.populationYear,
        accessibilityPopulationYear: Number(accessibilityData.metadata.population_year),
        thresholds: {
          mean_lst: numberOrNull(thresholds.mean_lst, 2),
          population_density: numberOrNull(thresholds.population_density, 1),
          recreation_access_pct: numberOrNull(thresholds.recreation_access_pct, 1),
        },
        averageLst: numberOrNull(
          screeningRows.length
            ? screeningRows.reduce((sum, row) => sum + row.mean_lst, 0) / screeningRows.length
            : null,
          2,
        ),
        averageRecreationAccessPct: numberOrNull(
          screeningRows.length
            ? screeningRows.reduce((sum, row) => sum + row.recreation_access_pct!, 0) / screeningRows.length
            : null,
          1,
        ),
      },
    },
    methodology: "แสดง 3 มิติแยกกัน ได้แก่ LST, ความหนาแน่นประชากรตามทะเบียน และ proximity ไปสวน/พื้นที่นันทนาการ; flag ใช้ค่ามัธยฐานของ 50 เขตเป็นเกณฑ์เปรียบเทียบ ไม่มีการรวมเป็นคะแนน Heat Vulnerability",
    limitations: [
      "ค่าดาวเทียมเป็นสัญญาณจากช่วงเวลาที่เลือกและอาจมีช่องว่างจากเมฆหรือจำนวนภาพที่ใช้ได้",
      "LST คืออุณหภูมิพื้นผิว ไม่ใช่อุณหภูมิอากาศหรือค่าความสบายเชิงความร้อน",
      "ประชากรเป็นข้อมูลตามทะเบียน และ proximity ไม่ใช่เวลาเดินทางจริงหรือการยืนยันคุณภาพ/เวลาเปิดของพื้นที่คลายร้อน",
      "ยังไม่ใช่ Heat Vulnerability เพราะไม่มีข้อมูลทางการของผู้สูงอายุ เด็ก ผู้ป่วยติดเตียง รายได้ ความจุ cooling center และอุณหภูมิอากาศภาคพื้น",
    ],
  };
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const mode: DecisionMode = searchParams.get("mode") === "heat" ? "heat" : "flood";
    const year = Number.parseInt(searchParams.get("year") || "2024", 10);
    const baselineYear = Number.parseInt(searchParams.get("baseline") || String(Math.max(2018, year - 1)), 10);
    if (!Number.isInteger(year) || year < 2018 || year > new Date().getUTCFullYear()) {
      return NextResponse.json({ error: "year ไม่อยู่ในช่วงที่รองรับ" }, { status: 400 });
    }
    if (mode === "heat" && (!Number.isInteger(baselineYear) || baselineYear < 2018 || baselineYear >= year)) {
      return NextResponse.json({ error: "baseline ต้องอยู่ระหว่าง 2018 และน้อยกว่าปีที่เลือก" }, { status: 400 });
    }
    const payload = mode === "heat"
      ? await heatResponse(year, baselineYear)
      : await floodResponse(year);
    return NextResponse.json(payload, {
      headers: { "Cache-Control": "public, s-maxage=900, stale-while-revalidate=300" },
    });
  } catch (error: any) {
    console.error("Decision support API error:", error);
    return NextResponse.json({ error: error?.message ?? "Unknown error" }, { status: 500 });
  }
}
