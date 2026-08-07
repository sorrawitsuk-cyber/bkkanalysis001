/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import ee, { initGEE } from "@/lib/gee";
import bkkDistricts from "@/data/bkk_districts.json";
import {
  TREE_COVER_MIN_YEAR,
  type TreeCoverDistrictRow,
} from "@/lib/tree-cover";
export const dynamic = "force-dynamic";
export const maxDuration = 60;

const SOURCE = "Google Dynamic World V1";
const COLLECTION = "GOOGLE/DYNAMICWORLD/V1";
const CONFIDENCE_THRESHOLD = 0.45;
const AGGREGATION_SCALE_METERS = 30;
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

function annualComposite(year: number, boundary: any) {
  const range = dateRange(year);
  const collection = ee.ImageCollection(COLLECTION)
    .filterBounds(boundary)
    .filterDate(range.start, range.end);
  const probabilities = collection.select(PROBABILITY_BANDS).mean();
  const label = probabilities.toArray().arrayArgmax().arrayGet([0]).rename("label");
  const confidence = probabilities.reduce(ee.Reducer.max()).rename("confidence");
  const valid = confidence.gte(CONFIDENCE_THRESHOLD);
  return {
    collection,
    label: label.updateMask(valid).clip(boundary),
    confidence: confidence.updateMask(valid).clip(boundary),
    treeProbability: probabilities.select("trees").updateMask(valid).clip(boundary),
    valid,
    range,
  };
}

function tileUrl(map: any): string | null {
  if (map?.urlFormat) return map.urlFormat;
  if (map?.url_format) return map.url_format;
  const fetcher = map?.tile_fetcher;
  if (fetcher?.url_format) return fetcher.url_format;
  if (fetcher?.urlFormat) return fetcher.urlFormat;
  if (map?.mapid && map?.token) {
    return `https://earthengine.googleapis.com/map/${map.mapid}/{z}/{x}/{y}?token=${map.token}`;
  }
  return null;
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const currentYear = new Date().getUTCFullYear();
  const year = Number.parseInt(searchParams.get("year") || String(currentYear), 10);
  const baselineYear = Number.parseInt(searchParams.get("baseline") || "2020", 10);

  try {
    if (!Number.isInteger(year) || year < TREE_COVER_MIN_YEAR || year > currentYear) {
      return NextResponse.json({ error: `year ต้องอยู่ระหว่าง ${TREE_COVER_MIN_YEAR}-${currentYear}` }, { status: 400 });
    }
    if (!Number.isInteger(baselineYear) || baselineYear < TREE_COVER_MIN_YEAR || baselineYear >= year) {
      return NextResponse.json({ error: `baseline ต้องอยู่ระหว่าง ${TREE_COVER_MIN_YEAR}-${year - 1}` }, { status: 400 });
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
    const currentTrees = current.label.eq(1);
    const baselineTrees = baseline.label.eq(1);
    const stableTrees = currentTrees.and(baselineTrees).and(validBoth);
    const treeGain = currentTrees.and(baselineTrees.not()).and(validBoth);
    const treeLoss = baselineTrees.and(currentTrees.not()).and(validBoth);
    const pixelArea = ee.Image.pixelArea();
    const areaBand = (mask: any, name: string) => pixelArea.updateMask(mask).rename(name).unmask(0);

    const statsImage = areaBand(current.label.mask(), "valid_area")
      .addBands(areaBand(validBoth, "comparison_area"))
      .addBands(areaBand(currentTrees, "tree_area"))
      .addBands(areaBand(currentTrees.and(validBoth), "comparison_tree_area"))
      .addBands(areaBand(baselineTrees.and(validBoth), "baseline_tree_area"))
      .addBands(areaBand(stableTrees, "stable_tree_area"))
      .addBands(areaBand(treeGain, "tree_gain_area"))
      .addBands(areaBand(treeLoss, "tree_loss_area"))
      .addBands(pixelArea.multiply(current.confidence).updateMask(current.label.mask()).rename("confidence_area").unmask(0));

    const districtStats = statsImage.reduceRegions({
      collection: districtCollection(),
      reducer: ee.Reducer.sum(),
      scale: AGGREGATION_SCALE_METERS,
      tileScale: 4,
    }).map((feature: any) => ee.Feature(feature).setGeometry(null));

    const changeCode = ee.Image(0)
      .where(stableTrees, 1)
      .where(treeGain, 2)
      .where(treeLoss, 3)
      .updateMask(stableTrees.or(treeGain).or(treeLoss))
      .clip(boundary);

    const [statsResult, currentSceneCount, baselineSceneCount, currentMap, changeMap] = await Promise.all([
      evaluateEe<any>(districtStats),
      evaluateEe<number>(current.collection.size()),
      evaluateEe<number>(baseline.collection.size()),
      getMapId(current.treeProbability, { min: 0, max: 1, palette: ["#f8fafc", "#bbf7d0", "#22c55e", "#065f46"] }),
      getMapId(changeCode, { min: 1, max: 3, palette: ["#166534", "#4ade80", "#dc2626"] }),
    ]);

    const rows: TreeCoverDistrictRow[] = (statsResult?.features ?? []).map((feature: any) => {
      const p = feature.properties ?? {};
      const validArea = Number(p.valid_area) || 0;
      const comparisonArea = Number(p.comparison_area) || 0;
      const districtArea = Number(p.district_area_m2) || validArea;
      const pct = (value: unknown, denominator: number) =>
        denominator > 0 && typeof value === "number" ? roundOrNull((value / denominator) * 100) : null;
      const currentComparablePct = pct(p.comparison_tree_area, comparisonArea);
      const baselinePct = pct(p.baseline_tree_area, comparisonArea);
      return {
        district_id: Number(p.district_id),
        district_name: String(p.district_name),
        tree_cover_pct: pct(p.tree_area, validArea),
        tree_cover_rai: typeof p.tree_area === "number" ? roundOrNull(p.tree_area / 1600, 0) : null,
        baseline_tree_cover_pct: baselinePct,
        tree_cover_change_pp: currentComparablePct !== null && baselinePct !== null
          ? roundOrNull(currentComparablePct - baselinePct)
          : null,
        tree_gain_pct: pct(p.tree_gain_area, comparisonArea),
        tree_loss_pct: pct(p.tree_loss_area, comparisonArea),
        stable_tree_pct: pct(p.stable_tree_area, comparisonArea),
        confidence_pct: validArea > 0 ? roundOrNull((Number(p.confidence_area || 0) / validArea) * 100) : null,
        coverage_pct: districtArea > 0 ? roundOrNull(Math.min(100, (validArea / districtArea) * 100)) : null,
      };
    });

    rows.sort((a, b) => (b.tree_cover_pct ?? -1) - (a.tree_cover_pct ?? -1));
    const rowById = new Map(rows.map((row) => [row.district_id, row]));
    const geojson = {
      type: "FeatureCollection" as const,
      features: sourceFeatures.map((feature) => ({
        ...feature,
        properties: {
          ...feature.properties,
          district_name: feature.properties.name_th,
          ...(rowById.get(Number(feature.properties.id)) ?? {}),
        },
      })),
    };
    const average = (key: keyof TreeCoverDistrictRow) => {
      const values = rows.map((row) => row[key]).filter((value): value is number => typeof value === "number");
      return values.length ? roundOrNull(values.reduce((sum, value) => sum + value, 0) / values.length) : null;
    };
    const sum = (key: keyof TreeCoverDistrictRow) => {
      const values = rows.map((row) => row[key]).filter((value): value is number => typeof value === "number");
      return values.length ? roundOrNull(values.reduce((total, value) => total + value, 0), 0) : null;
    };
    const byGain = [...rows].sort((a, b) => (b.tree_gain_pct ?? -1) - (a.tree_gain_pct ?? -1));
    const byLoss = [...rows].sort((a, b) => (b.tree_loss_pct ?? -1) - (a.tree_loss_pct ?? -1));

    const payload = {
      period: {
        year,
        baselineYear,
        currentLabel: current.range.label,
        baselineLabel: baseline.range.label,
      },
      rows,
      geojson,
      summary: {
        treeCoverPct: average("tree_cover_pct"),
        treeCoverRai: sum("tree_cover_rai"),
        treeCoverChangePp: average("tree_cover_change_pp"),
        treeGainPct: average("tree_gain_pct"),
        treeLossPct: average("tree_loss_pct"),
        averageConfidencePct: average("confidence_pct"),
        averageCoveragePct: average("coverage_pct"),
        highestTreeCoverDistrict: rows[0]?.district_name ?? null,
        lowestTreeCoverDistrict: rows[rows.length - 1]?.district_name ?? null,
        highestTreeGainDistrict: byGain[0]?.district_name ?? null,
        highestTreeLossDistrict: byLoss[0]?.district_name ?? null,
        currentSceneCount,
        baselineSceneCount,
        source: SOURCE,
        dataQuality: "modeled" as const,
        aggregationScaleMeters: AGGREGATION_SCALE_METERS,
        processingNote: "Annual mean Dynamic World probabilities; class with highest probability, confidence >= 45%; trees class only; district statistics aggregated at 30 m.",
      },
      rasters: {
        current: {
          urlFormat: tileUrl(currentMap),
          palette: ["#f8fafc", "#bbf7d0", "#22c55e", "#065f46"],
          labels: ["โอกาสเป็นเรือนยอดไม้ต่ำ", "ปานกลาง", "สูง", "สูงมาก"],
        },
        change: {
          urlFormat: tileUrl(changeMap),
          palette: ["#166534", "#4ade80", "#dc2626"],
          labels: ["ต้นไม้คงเดิม", "ต้นไม้เพิ่ม", "ต้นไม้สูญเสีย"],
        },
      },
    };

    CACHE.set(cacheKey, { payload, expiresAt: Date.now() + cacheSeconds * 1000 });
    return NextResponse.json(payload, {
      headers: { "Cache-Control": `public, s-maxage=${cacheSeconds}, stale-while-revalidate=3600`, "X-Cache": "MISS" },
    });
  } catch (error: any) {
    console.error("Tree cover API error:", error);
    return NextResponse.json(
      { error: "ข้อมูลเรือนยอดไม้จาก Google Earth Engine ไม่พร้อมใช้งานในขณะนี้", status: "unavailable", source: SOURCE },
      { status: 503, headers: { "Cache-Control": "no-store" } },
    );
  }
}
