/* eslint-disable @typescript-eslint/no-explicit-any */
import { NextResponse } from "next/server";
import * as turf from "@turf/turf";
import ee, { initGEE } from "@/lib/gee";
import geojson from "@/data/bkk_districts.json";

export const dynamic = "force-dynamic";

const ALL_DISTRICTS = "ทั้งหมด";
// V22 covers 2022+; V21 covers 2012-2021 (band: average vs average_masked)
const ANNUAL_V22_DATASET_ID = "NOAA/VIIRS/DNB/ANNUAL_V22";
const ANNUAL_V21_DATASET_ID = "NOAA/VIIRS/DNB/ANNUAL_V21";
const MONTHLY_DATASET_ID = "NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG";
const FIRST_YEAR = 2014;
const ANNUAL_V22_START_YEAR = 2022;
const LATEST_ANNUAL_YEAR = 2024;
const LATEST_MONTHLY_YEAR = 2025;
const LATEST_MONTHLY_MONTH = 3;
const MIN_CLOUD_FREE_COVERAGE = 3;
type NightLightsProduct = "annual" | "monthly";

function evaluateEe<T>(eeObject: any): Promise<T> {
  return new Promise((resolve, reject) => {
    eeObject.evaluate((value: T, error: any) => {
      if (error) reject(error);
      else resolve(value);
    });
  });
}

function getYearRange() {
  return Array.from({ length: LATEST_ANNUAL_YEAR - FIRST_YEAR + 1 }, (_, index) => FIRST_YEAR + index);
}

function getDateRange(year: number) {
  return {
    startDate: `${year}-01-01`,
    endDate: `${year + 1}-01-01`,
  };
}

function getNightLightsImage(product: NightLightsProduct, year: number, month: number, geometry: any) {
  if (product === "monthly") {
    const startDate = `${year}-${String(month).padStart(2, "0")}-01`;
    const endDate = month === 12
      ? `${year + 1}-01-01`
      : `${year}-${String(month + 1).padStart(2, "0")}-01`;
    return ee.ImageCollection(MONTHLY_DATASET_ID)
      .filterBounds(geometry)
      .filterDate(startDate, endDate)
      .map((image: any) => image
        .select("avg_rad")
        .max(0)
        .rename("ntl")
        .updateMask(image.select("cf_cvg").gte(MIN_CLOUD_FREE_COVERAGE)))
      .mean()
      .rename("ntl");
  }

  const { startDate, endDate } = getDateRange(year);
  const useV22 = year >= ANNUAL_V22_START_YEAR;
  const datasetId = useV22 ? ANNUAL_V22_DATASET_ID : ANNUAL_V21_DATASET_ID;
  const band = useV22 ? "average_masked" : "average";
  return ee.ImageCollection(datasetId)
    .filterBounds(geometry)
    .filterDate(startDate, endDate)
    .first()
    .select(band)
    .max(0)
    .rename("ntl");
}

function getNightLightsImageForEeYear(year: any, geometry: any) {
  const start = ee.Date.fromYMD(year, 1, 1);
  const end = ee.Date.fromYMD(ee.Number(year).add(1), 1, 1);
  // Note: this uses V22 only; callers should pass years >= 2022 for correct data
  return ee.ImageCollection(ANNUAL_V22_DATASET_ID)
    .filterBounds(geometry)
    .filterDate(start, end)
    .first()
    .select("average_masked")
    .max(0)
    .rename("ntl");
}

function getFeatureCollection() {
  return ee.FeatureCollection(geojson.features.map((feature: any) => (
    ee.Feature(ee.Geometry(feature.geometry).simplify(250), {
      id: feature.properties.id,
      name_th: feature.properties.name_th,
      name_en: feature.properties.name_en || "",
    })
  )));
}

function getNumber(value: any) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function normalizeDistrictName(value: string | null) {
  if (!value) return "";
  return value.replace(/^เขต/, "").trim();
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const product: NightLightsProduct = searchParams.get("product") === "monthly" ? "monthly" : "annual";
    const maxYear = product === "monthly" ? LATEST_MONTHLY_YEAR : LATEST_ANNUAL_YEAR;
    const defaultYear = product === "monthly" ? LATEST_MONTHLY_YEAR : LATEST_ANNUAL_YEAR;
    const rawYear = parseInt(searchParams.get("year") || `${defaultYear}`, 10);
    const year = Math.max(FIRST_YEAR, Math.min(maxYear, rawYear));
    const rawMonth = parseInt(searchParams.get("month") || `${LATEST_MONTHLY_MONTH}`, 10);
    const month = product === "monthly"
      ? Math.max(1, Math.min(year === LATEST_MONTHLY_YEAR ? LATEST_MONTHLY_MONTH : 12, rawMonth))
      : 1;
    const compareYearParam = searchParams.get("compareYear");
    const compareYear = product === "annual" && compareYearParam
      ? Math.max(FIRST_YEAR, Math.min(LATEST_ANNUAL_YEAR, parseInt(compareYearParam, 10)))
      : null;
    const districtFilter = searchParams.get("district") || ALL_DISTRICTS;

    await initGEE();

    const districtFeatures = getFeatureCollection();
    const bkkGeometry = districtFeatures.geometry();

    let invertedMask = null;
    try {
      let bkkPolygon: any = geojson.features[0];
      for (let i = 1; i < geojson.features.length; i += 1) {
        bkkPolygon = turf.union(turf.featureCollection([bkkPolygon, geojson.features[i]]));
      }
      invertedMask = turf.mask(bkkPolygon);
    } catch (error) {
      console.error("Nighttime lights mask generation failed:", error);
    }

    const currentImage = getNightLightsImage(product, year, month, bkkGeometry);
    const currentStats = await evaluateEe<any>(currentImage.reduceRegions({
      collection: districtFeatures,
      reducer: ee.Reducer.mean()
        .combine({ reducer2: ee.Reducer.max(), sharedInputs: true })
        .combine({ reducer2: ee.Reducer.count(), sharedInputs: true }),
      scale: 750,
      tileScale: 2,
    }));

    const compareStats = compareYear
      ? await evaluateEe<any>(getNightLightsImage("annual", compareYear, 1, bkkGeometry).reduceRegions({
          collection: districtFeatures,
          reducer: ee.Reducer.mean(),
          scale: 750,
          tileScale: 2,
        }))
      : null;

    const compareById = new Map<number, number | null>();
    (compareStats?.features || []).forEach((feature: any) => {
      compareById.set(Number(feature.properties.id), getNumber(feature.properties.mean));
    });

    const rows = (currentStats?.features || []).map((feature: any) => {
      const id = Number(feature.properties.id);
      const mean = getNumber(feature.properties.mean);
      const max = getNumber(feature.properties.max);
      const count = getNumber(feature.properties.count);
      const baseline = compareById.get(id) ?? null;
      const delta = mean !== null && baseline !== null ? mean - baseline : null;
      const pctDelta = delta !== null && baseline && baseline !== 0 ? (delta / baseline) * 100 : null;

      return {
        district_id: id,
        district_name: feature.properties.name_th,
        ntl_mean: mean,
        ntl_max: max,
        pixel_count: count,
        baseline_ntl_mean: baseline,
        delta,
        pct_delta: pctDelta,
      };
    });

    const rowById = new Map<number, any>(rows.map((row: any) => [row.district_id, row]));
    let minValue = Infinity;
    let maxValue = -Infinity;
    let minDelta = Infinity;
    let maxDelta = -Infinity;

    const features = (geojson.features as any[]).map((feature: any) => {
      const row = rowById.get(feature.properties.id) || null;
      const value = row?.ntl_mean ?? null;
      const delta = row?.delta ?? null;
      if (value !== null) {
        minValue = Math.min(minValue, value);
        maxValue = Math.max(maxValue, value);
      }
      if (delta !== null) {
        minDelta = Math.min(minDelta, delta);
        maxDelta = Math.max(maxDelta, delta);
      }

      return {
        ...feature,
        properties: {
          ...feature.properties,
          ntl_mean: value,
          ntl_max: row?.ntl_max ?? null,
          ntl_delta: delta,
          ntl_pct_delta: row?.pct_delta ?? null,
          pixel_count: row?.pixel_count ?? null,
        },
      };
    });

    const rankingSource = [...rows].filter((row) => row.ntl_mean !== null);
    const ranking = compareYear
      ? rankingSource
          .sort((a, b) => (b.delta ?? -Infinity) - (a.delta ?? -Infinity))
          .map((row) => [row.district_name, row.delta, row.pct_delta])
      : rankingSource
          .sort((a, b) => (b.ntl_mean ?? -Infinity) - (a.ntl_mean ?? -Infinity))
          .map((row) => [row.district_name, row.ntl_mean, row.ntl_max]);

    const selectedFeature = districtFilter !== ALL_DISTRICTS
      ? geojson.features.find((feature: any) => normalizeDistrictName(feature.properties.name_th) === normalizeDistrictName(districtFilter))
      : null;
    const trendGeometry = selectedFeature ? ee.Feature(selectedFeature.geometry).geometry() : bkkGeometry;

    // Keep the interactive endpoint focused on the selected/comparison years.
    // Full historical trend is better materialized as a cache job because GEE
    // reduceRegions over 50 Bangkok districts for every year is slow enough to
    // make the dashboard feel broken on first load.
    const values = rankingSource.map((row) => row.ntl_mean).filter((value): value is number => value !== null);
    const deltas = rankingSource.map((row) => row.delta).filter((value): value is number => value !== null);
    const average = values.length ? values.reduce((sum, value) => sum + value, 0) / values.length : null;
    const yearlyTrend = product === "annual" ? [[year, average !== null ? Number(average.toFixed(3)) : null, null]] : [];
    const monthlyTrend = product === "monthly"
      ? Array.from({ length: LATEST_MONTHLY_MONTH }, (_, index) => [index + 1, index + 1 === month && average !== null ? Number(average.toFixed(3)) : null, index + 1 === month ? "selected" : "available"])
      : Array.from({ length: 12 }, (_, index) => [index + 1, null, "annual-only"]);
    const maxDistrict = rankingSource.sort((a, b) => (b.ntl_mean ?? -Infinity) - (a.ntl_mean ?? -Infinity))[0] || null;
    const fastestGrowthDistrict = compareYear
      ? [...rankingSource].sort((a, b) => (b.delta ?? -Infinity) - (a.delta ?? -Infinity))[0] || null
      : null;

    return NextResponse.json({
      geojson: { type: "FeatureCollection", features },
      invertedMask,
      summary: {
        metric: "nightlights",
        product,
        selectedYear: year,
        selectedMonth: product === "monthly" ? month : null,
        compareYear,
        availableYears: getYearRange(),
        latestDataYear: LATEST_ANNUAL_YEAR,
        latestAnnualYear: LATEST_ANNUAL_YEAR,
        latestMonthlyYear: LATEST_MONTHLY_YEAR,
        latestMonthlyMonth: LATEST_MONTHLY_MONTH,
        availableMonthlyMonths: product === "monthly" && year === LATEST_MONTHLY_YEAR
          ? Array.from({ length: LATEST_MONTHLY_MONTH }, (_, index) => index + 1)
          : Array.from({ length: 12 }, (_, index) => index + 1),
        averageRadiance: average !== null ? Number(average.toFixed(3)) : null,
        maxRadiance: values.length ? Number(Math.max(...values).toFixed(3)) : null,
        minRadiance: values.length ? Number(Math.min(...values).toFixed(3)) : null,
        maxDistrict: maxDistrict?.district_name ?? null,
        fastestGrowthDistrict: fastestGrowthDistrict?.district_name ?? null,
        avgDelta: deltas.length ? Number((deltas.reduce((sum, value) => sum + value, 0) / deltas.length).toFixed(3)) : null,
        maxDelta: deltas.length ? Number(Math.max(...deltas).toFixed(3)) : null,
        minDelta: deltas.length ? Number(Math.min(...deltas).toFixed(3)) : null,
        ranking,
        yearlyTrend,
        monthlyTrend,
        min_ntl: minValue !== Infinity ? Number(minValue.toFixed(3)) : 0,
        max_ntl: maxValue !== -Infinity ? Number(maxValue.toFixed(3)) : 80,
        min_delta: minDelta !== Infinity ? Number(minDelta.toFixed(3)) : -10,
        max_delta: maxDelta !== -Infinity ? Number(maxDelta.toFixed(3)) : 10,
        dataSource: product === "monthly"
          ? `${MONTHLY_DATASET_ID} monthly avg_rad, cf_cvg >= ${MIN_CLOUD_FREE_COVERAGE}`
          : `${ANNUAL_DATASET_ID} annual average_masked`,
        units: "nW/sr/cm²",
      },
    }, {
      headers: {
        "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=43200",
      },
    });
  } catch (error: any) {
    console.error("Nighttime Lights API Error:", error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
