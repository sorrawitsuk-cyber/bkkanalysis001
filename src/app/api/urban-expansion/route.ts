/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import ee, { initGEE } from "@/lib/gee";
import bkkDistricts from "@/data/bkk_districts.json";
import {
  URBAN_EXPANSION_MIN_YEAR,
  type UrbanExpansionDistrictRow,
} from "@/lib/urban-expansion";

export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SOURCE = "Google Dynamic World V1";
const COLLECTION = "GOOGLE/DYNAMICWORLD/V1";
const CONFIDENCE_THRESHOLD = 0.45;
const PROBABILITY_BANDS = ["water", "trees", "grass", "flooded_vegetation", "crops", "shrub_and_scrub", "built", "bare", "snow_and_ice"];
const sourceFeatures = bkkDistricts.features as any[];
const CACHE = new Map<string, { payload: Record<string, unknown>; expiresAt: number }>();

function evaluateEe<T>(object: any): Promise<T> {
  return new Promise((resolve, reject) => object.evaluate((value: T, error: any) => error ? reject(error) : resolve(value)));
}

function getMapId(image: any, visParams: Record<string, unknown>): Promise<any> {
  return new Promise((resolve, reject) => image.getMapId(visParams, (result: any, error: any) => error ? reject(error) : resolve(result)));
}

function roundOrNull(value: unknown, digits = 2): number | null {
  return typeof value === "number" && Number.isFinite(value) ? Number(value.toFixed(digits)) : null;
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
  return classes.slice(1).reduce((mask: any, classId) => mask.or(label.eq(classId)), label.eq(classes[0]));
}

function annualComposite(year: number, boundary: any) {
  const range = dateRange(year);
  const collection = ee.ImageCollection(COLLECTION).filterBounds(boundary).filterDate(range.start, range.end);
  const probabilities = collection.select(PROBABILITY_BANDS).mean();
  const label = probabilities.toArray().arrayArgmax().arrayGet([0]).rename("label");
  const confidence = probabilities.reduce(ee.Reducer.max()).rename("confidence");
  const valid = confidence.gte(CONFIDENCE_THRESHOLD);
  return {
    collection,
    label: label.updateMask(valid).clip(boundary),
    confidence: confidence.updateMask(valid).clip(boundary),
    builtProbability: probabilities.select("built").updateMask(valid).clip(boundary),
    range,
  };
}

function tileUrl(map: any): string | null {
  if (map?.urlFormat) return map.urlFormat;
  if (map?.url_format) return map.url_format;
  if (map?.tile_fetcher?.url_format) return map.tile_fetcher.url_format;
  if (map?.tile_fetcher?.urlFormat) return map.tile_fetcher.urlFormat;
  if (map?.mapid && map?.token) return `https://earthengine.googleapis.com/map/${map.mapid}/{z}/{x}/{y}?token=${map.token}`;
  return null;
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const currentYear = new Date().getUTCFullYear();
    const year = Number.parseInt(searchParams.get("year") || String(currentYear), 10);
    const baselineYear = Number.parseInt(searchParams.get("baseline") || "2020", 10);

    if (!Number.isInteger(year) || year < URBAN_EXPANSION_MIN_YEAR || year > currentYear) {
      return NextResponse.json({ error: `year ต้องอยู่ระหว่าง ${URBAN_EXPANSION_MIN_YEAR}-${currentYear}` }, { status: 400 });
    }
    if (!Number.isInteger(baselineYear) || baselineYear < URBAN_EXPANSION_MIN_YEAR || baselineYear >= year) {
      return NextResponse.json({ error: `baseline ต้องอยู่ระหว่าง ${URBAN_EXPANSION_MIN_YEAR}-${year - 1}` }, { status: 400 });
    }

    const cacheKey = `${baselineYear}-${year}`;
    const cacheSeconds = year === currentYear ? 3600 : 21600;
    const cached = CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.payload, { headers: { "Cache-Control": `public, s-maxage=${cacheSeconds}, stale-while-revalidate=3600`, "X-Cache": "HIT" } });
    }

    await initGEE();
    const boundary = ee.FeatureCollection(bkkDistricts as any).geometry();
    const current = annualComposite(year, boundary);
    const baseline = annualComposite(baselineYear, boundary);
    const validBoth = current.label.mask().and(baseline.label.mask());
    const currentBuilt = current.label.eq(6);
    const baselineBuilt = baseline.label.eq(6);
    const currentGreen = classMask(current.label, [1, 2, 3, 4, 5]);
    const baselineGreen = classMask(baseline.label, [1, 2, 3, 4, 5]);
    const baselineBare = baseline.label.eq(7);
    const stableBuilt = currentBuilt.and(baselineBuilt).and(validBoth);
    const builtGain = currentBuilt.and(baselineBuilt.not()).and(validBoth);
    const builtLoss = baselineBuilt.and(currentBuilt.not()).and(validBoth);
    const greenToBuilt = baselineGreen.and(currentBuilt).and(validBoth);
    const bareToBuilt = baselineBare.and(currentBuilt).and(validBoth);
    const builtToGreen = baselineBuilt.and(currentGreen).and(validBoth);
    const pixelArea = ee.Image.pixelArea();
    const areaBand = (mask: any, name: string) => pixelArea.updateMask(mask).rename(name).unmask(0);

    const statsImage = areaBand(current.label.mask(), "valid_area")
      .addBands(areaBand(validBoth, "comparison_area"))
      .addBands(areaBand(currentBuilt, "built_area"))
      .addBands(areaBand(currentBuilt.and(validBoth), "comparison_built_area"))
      .addBands(areaBand(baselineBuilt.and(validBoth), "baseline_built_area"))
      .addBands(areaBand(stableBuilt, "stable_built_area"))
      .addBands(areaBand(builtGain, "built_gain_area"))
      .addBands(areaBand(builtLoss, "built_loss_area"))
      .addBands(areaBand(greenToBuilt, "green_to_built_area"))
      .addBands(areaBand(bareToBuilt, "bare_to_built_area"))
      .addBands(areaBand(builtToGreen, "built_to_green_area"))
      .addBands(pixelArea.multiply(current.confidence).updateMask(current.label.mask()).rename("confidence_area").unmask(0));

    const districtStats = statsImage.reduceRegions({
      collection: districtCollection(),
      reducer: ee.Reducer.sum(),
      scale: 10,
      tileScale: 4,
    });

    const changeCode = ee.Image(0)
      .where(stableBuilt, 1)
      .where(builtGain, 2)
      .where(greenToBuilt, 3)
      .where(bareToBuilt, 4)
      .where(builtLoss, 5)
      .updateMask(stableBuilt.or(builtGain).or(builtLoss))
      .clip(boundary);

    const [statsResult, currentSceneCount, baselineSceneCount, currentMap, changeMap] = await Promise.all([
      evaluateEe<any>(districtStats),
      evaluateEe<number>(current.collection.size()),
      evaluateEe<number>(baseline.collection.size()),
      getMapId(current.builtProbability, { min: 0, max: 1, palette: ["#fff7ed", "#fdba74", "#f97316", "#991b1b"] }),
      getMapId(changeCode, { min: 1, max: 5, palette: ["#7f1d1d", "#fb923c", "#ef4444", "#facc15", "#22c55e"] }),
    ]);

    const rows: UrbanExpansionDistrictRow[] = (statsResult?.features ?? []).map((feature: any) => {
      const p = feature.properties ?? {};
      const validArea = Number(p.valid_area) || 0;
      const comparisonArea = Number(p.comparison_area) || 0;
      const districtArea = Number(p.district_area_m2) || validArea;
      const pct = (value: unknown, denominator: number) =>
        denominator > 0 && typeof value === "number"
          ? roundOrNull(Math.max(0, Math.min(100, (value / denominator) * 100)))
          : null;
      const comparableBuiltPct = pct(p.comparison_built_area, comparisonArea);
      const baselineBuiltPct = pct(p.baseline_built_area, comparisonArea);
      return {
        district_id: Number(p.district_id),
        district_name: String(p.district_name),
        built_cover_pct: pct(p.built_area, validArea),
        built_area_rai: typeof p.built_area === "number" ? roundOrNull(p.built_area / 1600, 0) : null,
        baseline_built_cover_pct: baselineBuiltPct,
        built_change_pp: comparableBuiltPct !== null && baselineBuiltPct !== null ? roundOrNull(comparableBuiltPct - baselineBuiltPct) : null,
        built_gain_pct: pct(p.built_gain_area, comparisonArea),
        built_loss_pct: pct(p.built_loss_area, comparisonArea),
        stable_built_pct: pct(p.stable_built_area, comparisonArea),
        green_to_built_pct: pct(p.green_to_built_area, comparisonArea),
        bare_to_built_pct: pct(p.bare_to_built_area, comparisonArea),
        built_to_green_pct: pct(p.built_to_green_area, comparisonArea),
        confidence_pct: validArea > 0 ? roundOrNull((Number(p.confidence_area || 0) / validArea) * 100) : null,
        coverage_pct: districtArea > 0 ? roundOrNull(Math.min(100, (validArea / districtArea) * 100)) : null,
      };
    }).sort((a: UrbanExpansionDistrictRow, b: UrbanExpansionDistrictRow) => (b.built_cover_pct ?? -1) - (a.built_cover_pct ?? -1));

    const rowById = new Map(rows.map((row) => [row.district_id, row]));
    const geojson = {
      type: "FeatureCollection" as const,
      features: sourceFeatures.map((feature) => ({
        ...feature,
        properties: { ...feature.properties, district_name: feature.properties.name_th, ...(rowById.get(Number(feature.properties.id)) ?? {}) },
      })),
    };
    const average = (key: keyof UrbanExpansionDistrictRow) => {
      const values = rows.map((row) => row[key]).filter((value): value is number => typeof value === "number");
      return values.length ? roundOrNull(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
    };
    const sum = (key: keyof UrbanExpansionDistrictRow) => {
      const values = rows.map((row) => row[key]).filter((value): value is number => typeof value === "number");
      return values.length ? roundOrNull(values.reduce((total, value) => total + value, 0), 0) : null;
    };
    const byGain = [...rows].sort((a, b) => (b.built_gain_pct ?? -1) - (a.built_gain_pct ?? -1));
    const byGreenConversion = [...rows].sort((a, b) => (b.green_to_built_pct ?? -1) - (a.green_to_built_pct ?? -1));
    const payload = {
      period: { year, baselineYear, currentLabel: current.range.label, baselineLabel: baseline.range.label },
      rows,
      geojson,
      summary: {
        builtCoverPct: average("built_cover_pct"),
        builtAreaRai: sum("built_area_rai"),
        builtChangePp: average("built_change_pp"),
        builtGainPct: average("built_gain_pct"),
        builtLossPct: average("built_loss_pct"),
        greenToBuiltPct: average("green_to_built_pct"),
        bareToBuiltPct: average("bare_to_built_pct"),
        averageConfidencePct: average("confidence_pct"),
        averageCoveragePct: average("coverage_pct"),
        highestBuiltCoverDistrict: rows[0]?.district_name ?? null,
        highestBuiltGainDistrict: byGain[0]?.district_name ?? null,
        highestGreenConversionDistrict: byGreenConversion[0]?.district_name ?? null,
        currentSceneCount,
        baselineSceneCount,
        source: SOURCE,
        dataQuality: "modeled" as const,
        processingNote: "Annual mean Dynamic World probabilities; highest-probability class; confidence >= 45%; built class is the primary indicator.",
      },
      rasters: {
        current: { urlFormat: tileUrl(currentMap), palette: ["#fff7ed", "#fdba74", "#f97316", "#991b1b"], labels: ["โอกาสเป็นสิ่งปลูกสร้างต่ำ", "ปานกลาง", "สูง", "สูงมาก"] },
        change: { urlFormat: tileUrl(changeMap), palette: ["#7f1d1d", "#fb923c", "#ef4444", "#facc15", "#22c55e"], labels: ["สิ่งปลูกสร้างคงเดิม", "สิ่งปลูกสร้างเพิ่มจากประเภทอื่น", "พื้นที่สีเขียวเป็นสิ่งปลูกสร้าง", "พื้นที่โล่งเป็นสิ่งปลูกสร้าง", "สิ่งปลูกสร้างลดลง"] },
      },
    };

    CACHE.set(cacheKey, { payload, expiresAt: Date.now() + cacheSeconds * 1000 });
    return NextResponse.json(payload, { headers: { "Cache-Control": `public, s-maxage=${cacheSeconds}, stale-while-revalidate=3600`, "X-Cache": "MISS" } });
  } catch (error: any) {
    console.error("Urban expansion API error:", error);
    return NextResponse.json({ error: error?.message ?? "ไม่สามารถประมวลผลพื้นที่สิ่งปลูกสร้างได้" }, { status: 500 });
  }
}
