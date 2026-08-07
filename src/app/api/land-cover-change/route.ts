/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import ee, { initGEE } from "@/lib/gee";
import bkkDistricts from "@/data/bkk_districts.json";
import {
  LAND_COVER_MIN_YEAR,
  type LandCoverDistrictRow,
} from "@/lib/land-cover";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SOURCE = "Google Dynamic World V1";
const COLLECTION = "GOOGLE/DYNAMICWORLD/V1";
const CONFIDENCE_THRESHOLD = 0.45;
const AGGREGATION_SCALE_METERS = 30;
const CLASS_PALETTE = ["#2563eb", "#166534", "#84cc16", "#14b8a6", "#eab308", "#a3a3a3", "#dc2626", "#d97706", "#e2e8f0"];
const CLASS_LABELS = ["น้ำ", "ต้นไม้", "หญ้า", "พืชชุ่มน้ำ", "พืชเพาะปลูก", "พุ่มไม้", "สิ่งปลูกสร้าง", "พื้นที่โล่ง", "หิมะ/น้ำแข็ง"];
const CHANGE_PALETTE = ["#14532d", "#dc2626", "#fb923c", "#22c55e", "#7f1d1d", "#2563eb", "#a855f7", "#64748b"];
const CHANGE_LABELS = [
  "สีเขียวคงเดิม",
  "สีเขียว → สิ่งปลูกสร้าง",
  "พื้นที่อื่น → สิ่งปลูกสร้าง",
  "สิ่งปลูกสร้าง → สีเขียว",
  "สิ่งปลูกสร้างคงเดิม",
  "น้ำในปีปัจจุบัน",
  "ประเภทพื้นที่เปลี่ยน",
  "พื้นที่อื่นคงเดิม",
];
const PROBABILITY_BANDS = ["water", "trees", "grass", "flooded_vegetation", "crops", "shrub_and_scrub", "built", "bare", "snow_and_ice"];
const sourceFeatures = bkkDistricts.features as any[];

type CacheEntry = { payload: Record<string, unknown>; expiresAt: number };
const CACHE = new Map<string, CacheEntry>();

function evaluateEe<T>(object: any): Promise<T> {
  return new Promise((resolve, reject) => {
    object.evaluate((value: T, error: any) => error ? reject(error) : resolve(value));
  });
}

function getMapId(image: any, visParams: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => {
    image.getMapId(visParams, (result: any, error: any) => error ? reject(error) : resolve(result));
  });
}

function roundOrNull(value: unknown, digits = 2): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Number(value.toFixed(digits))
    : null;
}

function dateRange(year: number) {
  const currentYear = new Date().getUTCFullYear();
  const today = new Date().toISOString().slice(0, 10);
  return {
    start: `${year}-01-01`,
    end: year === currentYear ? today : `${year + 1}-01-01`,
    label: year === currentYear ? `1 ม.ค. - ${today} (YTD)` : `ปี ${year}`,
  };
}

function districtCollection() {
  return ee.FeatureCollection(sourceFeatures.map((feature) => {
    const geometry = ee.Geometry(feature.geometry).simplify(50);
    return ee.Feature(geometry, {
      district_id: feature.properties.id,
      district_name: feature.properties.name_th,
      district_area_m2: geometry.area(1),
    });
  }));
}

function classMask(label: any, classes: number[]) {
  return classes.slice(1).reduce(
    (mask: any, classId) => mask.or(label.eq(classId)),
    label.eq(classes[0]),
  );
}

function annualComposite(year: number, boundary: any) {
  const range = dateRange(year);
  const collection = ee.ImageCollection(COLLECTION)
    .filterBounds(boundary)
    .filterDate(range.start, range.end);
  const probabilityMean = collection.select(PROBABILITY_BANDS).mean();
  const label = probabilityMean
    .toArray()
    .arrayArgmax()
    .arrayGet([0])
    .rename("label");
  const confidence = probabilityMean.reduce(ee.Reducer.max()).rename("confidence");
  const valid = confidence.gte(CONFIDENCE_THRESHOLD);
  return {
    collection,
    label: label.updateMask(valid).clip(boundary),
    confidence: confidence.updateMask(valid).clip(boundary),
    valid,
    range,
  };
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const currentYear = new Date().getUTCFullYear();
  const year = Number.parseInt(searchParams.get("year") || String(currentYear), 10);
  const baselineYear = Number.parseInt(searchParams.get("baseline") || "2020", 10);

  try {
    if (!Number.isInteger(year) || year < LAND_COVER_MIN_YEAR || year > currentYear) {
      return NextResponse.json({ error: `year ต้องอยู่ระหว่าง ${LAND_COVER_MIN_YEAR}-${currentYear}` }, { status: 400 });
    }
    if (!Number.isInteger(baselineYear) || baselineYear < LAND_COVER_MIN_YEAR || baselineYear >= year) {
      return NextResponse.json({ error: `baseline ต้องอยู่ระหว่าง ${LAND_COVER_MIN_YEAR}-${year - 1}` }, { status: 400 });
    }

    const cacheKey = `${baselineYear}-${year}`;
    const cacheSeconds = year === currentYear ? 3600 : 21600;
    const cached = CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.payload, {
        headers: { "Cache-Control": `public, s-maxage=${cacheSeconds}, stale-while-revalidate=3600`, "X-Cache": "HIT" },
      });
    }

    await initGEE();
    const boundary = ee.FeatureCollection(bkkDistricts as any).geometry();
    const current = annualComposite(year, boundary);
    const baseline = annualComposite(baselineYear, boundary);
    const validBoth = current.label.mask().and(baseline.label.mask());
    const pixelArea = ee.Image.pixelArea();

    const currentGreen = classMask(current.label, [1, 2, 3, 4, 5]);
    const baselineGreen = classMask(baseline.label, [1, 2, 3, 4, 5]);
    const currentBuilt = current.label.eq(6);
    const baselineBuilt = baseline.label.eq(6);
    const currentWater = current.label.eq(0);
    const currentBare = current.label.eq(7);
    const currentOther = current.label.eq(8);
    const greenToBuilt = baselineGreen.and(currentBuilt).and(validBoth);
    const builtToGreen = baselineBuilt.and(currentGreen).and(validBoth);
    const changed = current.label.neq(baseline.label).and(validBoth);

    const areaBand = (mask: any, name: string) =>
      pixelArea.updateMask(mask).rename(name).unmask(0);
    const statsImage = areaBand(current.label.mask(), "valid_area")
      .addBands(areaBand(validBoth, "comparison_area"))
      .addBands(areaBand(currentGreen, "green_area"))
      .addBands(areaBand(currentBuilt, "built_area"))
      .addBands(areaBand(currentWater, "water_area"))
      .addBands(areaBand(currentBare, "bare_area"))
      .addBands(areaBand(currentOther, "other_area"))
      .addBands(areaBand(currentGreen.and(validBoth), "comparison_green_area"))
      .addBands(areaBand(currentBuilt.and(validBoth), "comparison_built_area"))
      .addBands(areaBand(currentWater.and(validBoth), "comparison_water_area"))
      .addBands(areaBand(currentBare.and(validBoth), "comparison_bare_area"))
      .addBands(areaBand(currentOther.and(validBoth), "comparison_other_area"))
      .addBands(areaBand(baselineGreen.and(validBoth), "baseline_green_area"))
      .addBands(areaBand(baselineBuilt.and(validBoth), "baseline_built_area"))
      .addBands(areaBand(greenToBuilt, "green_to_built_area"))
      .addBands(areaBand(builtToGreen, "built_to_green_area"))
      .addBands(areaBand(changed, "changed_area"))
      .addBands(pixelArea.multiply(current.confidence).updateMask(current.label.mask()).rename("confidence_area").unmask(0));

    const districtStats = statsImage.reduceRegions({
      collection: districtCollection(),
      reducer: ee.Reducer.sum(),
      scale: AGGREGATION_SCALE_METERS,
      tileScale: 4,
    }).map((feature: any) => ee.Feature(feature).setGeometry(null));

    const changeCode = current.label.multiply(0).add(8).rename("change")
      .where(currentGreen.and(baselineGreen), 1)
      .where(greenToBuilt, 2)
      .where(baselineGreen.not().and(baselineBuilt.not()).and(currentBuilt).and(validBoth), 3)
      .where(builtToGreen, 4)
      .where(currentBuilt.and(baselineBuilt), 5)
      .where(
        changed
          .and(greenToBuilt.not())
          .and(builtToGreen.not())
          .and(currentBuilt.not())
          .and(currentWater.not()),
        7,
      )
      .where(currentWater, 6)
      .updateMask(validBoth)
      .clip(boundary);

    const [statsResult, currentSceneCount, baselineSceneCount, currentMap, baselineMap, changeMap] = await Promise.all([
      evaluateEe<any>(districtStats),
      evaluateEe<number>(current.collection.size()),
      evaluateEe<number>(baseline.collection.size()),
      getMapId(current.label, { min: 0, max: 8, palette: CLASS_PALETTE }),
      getMapId(baseline.label, { min: 0, max: 8, palette: CLASS_PALETTE }),
      getMapId(changeCode, { min: 1, max: 8, palette: CHANGE_PALETTE }),
    ]);

    const rows: LandCoverDistrictRow[] = ((statsResult?.features ?? []).map((feature: any) => {
      const p = feature.properties ?? {};
      const sumAreas = (...values: unknown[]) =>
        values.reduce<number>((sum, value) => sum + (Number(value) || 0), 0);
      const validArea = sumAreas(
        p.green_area,
        p.built_area,
        p.water_area,
        p.bare_area,
        p.other_area,
      ) || Number(p.valid_area) || 0;
      const comparisonArea = sumAreas(
        p.comparison_green_area,
        p.comparison_built_area,
        p.comparison_water_area,
        p.comparison_bare_area,
        p.comparison_other_area,
      ) || Number(p.comparison_area) || 0;
      const districtArea = Number(p.district_area_m2) || validArea;
      const pct = (value: unknown, denominator = validArea) =>
        denominator > 0 && typeof value === "number" ? roundOrNull((value / denominator) * 100) : null;
      const greenPct = pct(p.green_area);
      const builtPct = pct(p.built_area);
      const comparisonGreenPct = pct(p.comparison_green_area, comparisonArea);
      const comparisonBuiltPct = pct(p.comparison_built_area, comparisonArea);
      const baselineGreenPct = pct(p.baseline_green_area, comparisonArea);
      const baselineBuiltPct = pct(p.baseline_built_area, comparisonArea);
      return {
        district_id: Number(p.district_id),
        district_name: String(p.district_name),
        green_pct: greenPct,
        built_pct: builtPct,
        water_pct: pct(p.water_area),
        bare_pct: pct(p.bare_area),
        baseline_green_pct: baselineGreenPct,
        baseline_built_pct: baselineBuiltPct,
        green_change_pp: comparisonGreenPct !== null && baselineGreenPct !== null ? roundOrNull(comparisonGreenPct - baselineGreenPct) : null,
        built_change_pp: comparisonBuiltPct !== null && baselineBuiltPct !== null ? roundOrNull(comparisonBuiltPct - baselineBuiltPct) : null,
        green_to_built_pct: pct(p.green_to_built_area, comparisonArea),
        built_to_green_pct: pct(p.built_to_green_area, comparisonArea),
        changed_pct: pct(p.changed_area, comparisonArea),
        confidence_pct: validArea > 0 ? roundOrNull((Number(p.confidence_area || 0) / validArea) * 100) : null,
        coverage_pct: districtArea > 0 ? roundOrNull(Math.min(100, (validArea / districtArea) * 100)) : null,
      };
    }) as LandCoverDistrictRow[]).sort(
      (a: LandCoverDistrictRow, b: LandCoverDistrictRow) =>
        (b.green_to_built_pct ?? -1) - (a.green_to_built_pct ?? -1),
    );

    const rowById = new Map(rows.map((row) => [row.district_id, row]));
    const geojson = {
      type: "FeatureCollection",
      features: sourceFeatures.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          district_name: feature.properties.name_th,
          ...(rowById.get(Number(feature.properties.id)) ?? {}),
        },
      })),
    };
    const average = (key: keyof LandCoverDistrictRow) => {
      const values = rows.map((row) => row[key]).filter((value): value is number => typeof value === "number");
      return values.length ? roundOrNull(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
    };
    const greenGainRows = [...rows].filter((row) => row.green_change_pp !== null).sort((a, b) => (b.green_change_pp ?? -999) - (a.green_change_pp ?? -999));

    const payload = {
      period: {
        year,
        baselineYear,
        currentLabel: current.range.label,
        baselineLabel: baseline.range.label,
        currentEnd: current.range.end,
        baselineEnd: baseline.range.end,
      },
      rows,
      geojson,
      summary: {
        greenPct: average("green_pct"),
        builtPct: average("built_pct"),
        waterPct: average("water_pct"),
        barePct: average("bare_pct"),
        greenChangePp: average("green_change_pp"),
        builtChangePp: average("built_change_pp"),
        greenToBuiltPct: average("green_to_built_pct"),
        builtToGreenPct: average("built_to_green_pct"),
        changedPct: average("changed_pct"),
        averageConfidencePct: average("confidence_pct"),
        averageCoveragePct: average("coverage_pct"),
        highestConversionDistrict: rows[0]?.district_name ?? null,
        highestGreenGainDistrict: greenGainRows[0]?.district_name ?? null,
        currentSceneCount,
        baselineSceneCount,
        source: SOURCE,
        dataQuality: "modeled",
        aggregationScaleMeters: AGGREGATION_SCALE_METERS,
        processingNote: `ค่าเฉลี่ย probability รายปี เลือก class ที่มี probability สูงสุด และใช้เฉพาะพิกเซล confidence ≥ ${CONFIDENCE_THRESHOLD}`,
      },
      rasters: {
        change: { urlFormat: changeMap?.urlFormat ?? null, palette: CHANGE_PALETTE, labels: CHANGE_LABELS },
        current: { urlFormat: currentMap?.urlFormat ?? null, palette: CLASS_PALETTE, labels: CLASS_LABELS },
        baseline: { urlFormat: baselineMap?.urlFormat ?? null, palette: CLASS_PALETTE, labels: CLASS_LABELS },
      },
    };

    CACHE.set(cacheKey, { payload, expiresAt: Date.now() + cacheSeconds * 1000 });
    return NextResponse.json(payload, {
      headers: { "Cache-Control": `public, s-maxage=${cacheSeconds}, stale-while-revalidate=3600`, "X-Cache": "MISS" },
    });
  } catch (error: any) {
    console.error("Land cover change API error:", error);
    return NextResponse.json(
      { error: "ข้อมูลการเปลี่ยนแปลงสิ่งปกคลุมดินจาก Google Earth Engine ไม่พร้อมใช้งานในขณะนี้", status: "unavailable", source: SOURCE },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
