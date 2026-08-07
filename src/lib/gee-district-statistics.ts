/* eslint-disable @typescript-eslint/no-explicit-any */
import ee from "@/lib/gee";
import geojson from "@/data/bkk_districts.json";
import type { DistrictStatistic } from "@/types/district";

export type LiveDistrictMetric = "lst" | "vegetation" | "builtup";

export type GeeDistrictStatisticsMetadata = {
  source: string;
  observationStart: string;
  observationEnd: string;
  resolutionMeters: number;
  aggregationScaleMeters: number;
  sceneCount: number;
  validDistrictCount: number;
  totalDistrictCount: number;
};

export type GeeDistrictStatisticsResult = {
  rows: DistrictStatistic[];
  metadata: GeeDistrictStatisticsMetadata;
};

type CachedResult = {
  expiresAt: number;
  promise: Promise<GeeDistrictStatisticsResult>;
};

const resultCache = new Map<string, CachedResult>();
const HISTORICAL_TTL_MS = 6 * 60 * 60 * 1000;
const CURRENT_YEAR_TTL_MS = 15 * 60 * 1000;

function evaluateEe<T>(eeObject: any): Promise<T> {
  return new Promise((resolve, reject) => {
    eeObject.evaluate((value: T, error: any) => {
      if (error) reject(error);
      else resolve(value);
    });
  });
}

function observationRange(year: number) {
  const now = new Date();
  const currentYear = now.getFullYear();
  return {
    start: `${year}-01-01`,
    end: year >= currentYear ? now.toISOString().slice(0, 10) : `${year + 1}-01-01`,
    endLabel: year >= currentYear ? now.toISOString().slice(0, 10) : `${year}-12-31`,
  };
}

function districtCollection() {
  return ee.FeatureCollection(
    (geojson.features as any[]).map((feature: any) =>
      ee.Feature(ee.Geometry(feature.geometry).simplify(30), {
        id: feature.properties.id,
        name_th: feature.properties.name_th,
      }),
    ),
  );
}

function bangkokGeometry() {
  return ee.FeatureCollection(geojson as any).geometry();
}

function maskSentinel2(image: any) {
  const scl = image.select("SCL");
  const clearMask = scl
    .neq(0)
    .and(scl.neq(1))
    .and(scl.neq(3))
    .and(scl.neq(8))
    .and(scl.neq(9))
    .and(scl.neq(10))
    .and(scl.neq(11));
  return image.updateMask(clearMask);
}

function sentinelCollection(year: number) {
  const range = observationRange(year);
  return ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
    .filterBounds(bangkokGeometry())
    .filterDate(range.start, range.end)
    .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40))
    .map(maskSentinel2);
}

function landsatCollection(year: number) {
  const range = observationRange(year);
  const landsat8 = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2");
  return (year >= 2022
    ? landsat8.merge(ee.ImageCollection("LANDSAT/LC09/C02/T1_L2"))
    : landsat8)
    .filterBounds(bangkokGeometry())
    .filterDate(range.start, range.end)
    .filter(ee.Filter.lt("CLOUD_COVER", 20));
}

function waterMask() {
  return ee.Image("JRC/GSW1_4/GlobalSurfaceWater")
    .select("occurrence")
    .gte(50)
    .not()
    .unmask(1);
}

function ndviImage(year: number) {
  return sentinelCollection(year)
    .map((image: any) => {
      const nir = image.select("B8").divide(10000);
      const red = image.select("B4").divide(10000);
      return nir.subtract(red).divide(nir.add(red)).rename("ndvi");
    })
    .median()
    .updateMask(waterMask())
    .clip(bangkokGeometry());
}

function ndbiImage(year: number) {
  return sentinelCollection(year)
    .map((image: any) => {
      const swir = image.select("B11").divide(10000);
      const nir = image.select("B8").divide(10000);
      return swir.subtract(nir).divide(swir.add(nir)).rename("ndbi");
    })
    .median()
    .updateMask(waterMask())
    .clip(bangkokGeometry());
}

function lstImage(year: number) {
  const landsatMedian = landsatCollection(year).median().clip(bangkokGeometry());
  const brightnessTemperature = landsatMedian.select("ST_B10").multiply(0.00341802).add(149.0);
  const nir = landsatMedian.select("SR_B5").multiply(0.0000275).add(-0.2);
  const red = landsatMedian.select("SR_B4").multiply(0.0000275).add(-0.2);
  const ndviForEmissivity = nir.subtract(red).divide(nir.add(red)).rename("ndvi");
  const vegetationProportion = ndviForEmissivity.subtract(0.2).divide(0.3).clamp(0, 1).pow(2);
  const emissivity = vegetationProportion.multiply(0.004).add(0.986);
  const correctedKelvin = brightnessTemperature.divide(
    ee.Image(1).add(brightnessTemperature.multiply(10.895 / 14380).multiply(emissivity.log())),
  );
  return correctedKelvin.subtract(273.15).rename("lst").clip(bangkokGeometry());
}

function numberOrNull(value: unknown, digits: number): number | null {
  return typeof value === "number" && Number.isFinite(value)
    ? Number(value.toFixed(digits))
    : null;
}

async function compute(metric: LiveDistrictMetric, year: number): Promise<GeeDistrictStatisticsResult> {
  const range = observationRange(year);
  const districts = districtCollection();
  let image: any;
  let collection: any;
  let reducer: any;
  let resolutionMeters: number;
  let aggregationScaleMeters: number;
  let source: string;

  if (metric === "vegetation") {
    const ndvi = ndviImage(year);
    image = ndvi
      .addBands(ndvi.gte(0.2).rename("green"))
      .addBands(ndvi.lt(0.2).rename("low_green"));
    collection = sentinelCollection(year);
    reducer = ee.Reducer.mean()
      .combine(ee.Reducer.median(), "", true)
      .combine(ee.Reducer.minMax(), "", true);
    resolutionMeters = 10;
    aggregationScaleMeters = 60;
    source = "Google Earth Engine · Sentinel-2 SR Harmonized · yearly median NDVI";
  } else if (metric === "builtup") {
    image = ndbiImage(year);
    collection = sentinelCollection(year);
    reducer = ee.Reducer.mean().combine(ee.Reducer.max(), "", true);
    resolutionMeters = 10;
    aggregationScaleMeters = 60;
    source = "Google Earth Engine · Sentinel-2 SR Harmonized · yearly median NDBI";
  } else {
    image = lstImage(year);
    collection = landsatCollection(year);
    reducer = ee.Reducer.mean().combine(ee.Reducer.max(), "", true);
    resolutionMeters = 30;
    aggregationScaleMeters = 90;
    source = "Google Earth Engine · Landsat 8/9 Collection 2 Level 2 · yearly median LST";
  }

  const reductions = image
    .reduceRegions({
      collection: districts,
      reducer,
      scale: aggregationScaleMeters,
      tileScale: 2,
    })
    .map((feature: any) => ee.Feature(feature).setGeometry(null));
  const [result, sceneCount] = await Promise.all([
    evaluateEe<any>(reductions),
    evaluateEe<number>(collection.size()),
  ]);

  const rows: DistrictStatistic[] = (result?.features ?? []).map((feature: any): DistrictStatistic => {
    const properties = feature.properties ?? {};
    const base: DistrictStatistic = {
      district_id: Number(properties.id),
      district_name: properties.name_th ?? null,
      year,
    };

    if (metric === "vegetation") {
      return {
        ...base,
        ndvi_mean: numberOrNull(properties.ndvi_mean, 6),
        ndvi_median: numberOrNull(properties.ndvi_median, 6),
        ndvi_min: numberOrNull(properties.ndvi_min, 6),
        ndvi_max: numberOrNull(properties.ndvi_max, 6),
        green_area_ratio: numberOrNull(properties.green_mean, 6),
        low_green_ratio: numberOrNull(properties.low_green_mean, 6),
        water_ratio: null,
        ndvi_data_source: source,
        processing_note: "Live district reduction from the same yearly GEE composite used by the raster layer.",
      } satisfies DistrictStatistic;
    }

    if (metric === "builtup") {
      return {
        ...base,
        ndbi_mean: numberOrNull(properties.ndbi_mean ?? properties.mean, 6),
        ndbi_max: numberOrNull(properties.ndbi_max ?? properties.max, 6),
        ndbi_data_source: source,
        processing_note: "Live district reduction from the same yearly GEE composite used by the raster layer.",
      } satisfies DistrictStatistic;
    }

    return {
      ...base,
      mean_lst: numberOrNull(properties.lst_mean ?? properties.mean, 2),
      max_lst: numberOrNull(properties.lst_max ?? properties.max, 2),
      lst_data_source: source,
      processing_note: "Live district reduction from the same yearly GEE composite used by the raster layer.",
    } satisfies DistrictStatistic;
  });

  const validDistrictCount = rows.filter((row: DistrictStatistic) => {
    if (metric === "vegetation") return typeof row.ndvi_mean === "number";
    if (metric === "builtup") return typeof row.ndbi_mean === "number";
    return typeof row.mean_lst === "number";
  }).length;

  return {
    rows,
    metadata: {
      source,
      observationStart: range.start,
      observationEnd: range.endLabel,
      resolutionMeters,
      aggregationScaleMeters,
      sceneCount: Number.isFinite(sceneCount) ? sceneCount : -1,
      validDistrictCount,
      totalDistrictCount: (geojson.features as any[]).length,
    },
  };
}

export function getGeeDistrictStatistics(metric: LiveDistrictMetric, year: number) {
  const key = `${metric}:${year}`;
  const cached = resultCache.get(key);
  if (cached && cached.expiresAt > Date.now()) return cached.promise;

  const promise = compute(metric, year).catch((error) => {
    resultCache.delete(key);
    throw error;
  });
  resultCache.set(key, {
    promise,
    expiresAt: Date.now() + (year < new Date().getFullYear() ? HISTORICAL_TTL_MS : CURRENT_YEAR_TTL_MS),
  });
  return promise;
}
