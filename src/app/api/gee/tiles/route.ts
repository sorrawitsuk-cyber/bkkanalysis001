import { NextResponse } from 'next/server';
import ee, { initGEE } from '@/lib/gee';
import bkkBoundaryData from '@/data/bkk_districts.json';

// In-process tile cache: keyed by canonical param string, TTL 55 min (GEE tokens expire in ~60 min)
interface TileCacheEntry { payload: Record<string, unknown>; expiresAt: number; }
const TILE_CACHE = new Map<string, TileCacheEntry>();
const TILE_TTL_MS = 55 * 60 * 1000;

function makeCacheKey(params: Record<string, string | number | boolean>): string {
  return Object.keys(params).sort().map((k) => `${k}=${params[k]}`).join('&');
}

function pruneExpiredEntries() {
  const now = Date.now();
  for (const [key, entry] of TILE_CACHE) {
    if (entry.expiresAt < now) TILE_CACHE.delete(key);
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  // Handle 'null' or 'NaN' strings from frontend
  const yearParam = searchParams.get('year');
  const baselineParam = searchParams.get('baseline');
  
  const year = yearParam && yearParam !== 'null' ? parseInt(yearParam, 10) : 2024;
  const baselineYear = baselineParam && baselineParam !== 'null' ? parseInt(baselineParam, 10) : 2018;
  const isCompare = searchParams.get('compare') === 'true';
  const metricParam = searchParams.get('metric');
  const metric = metricParam === 'vegetation' ? 'vegetation' : metricParam === 'builtup' ? 'builtup' : metricParam === 'nightlights' ? 'nightlights' : metricParam === 'ndwi' ? 'ndwi' : metricParam === 'mndwi' ? 'mndwi' : metricParam === 'air_pollution' ? 'air_pollution' : 'lst';
  const pollutantParam = searchParams.get('pollutant');
  const pollutant = pollutantParam === 'co' ? 'co' : pollutantParam === 'so2' ? 'so2' : pollutantParam === 'aerosol' ? 'aerosol' : 'no2';
  const nightLightsProduct = searchParams.get('product') === 'monthly' ? 'monthly' : 'annual';
  const nightLightsMonth = Math.max(1, Math.min(3, parseInt(searchParams.get('month') || '3', 10)));

  // Sentinel-5P TROPOMI launched April 2018; data quality acceptable from July 2018 onward
  const S5P_MIN_YEAR = 2018;
  if (metric === 'air_pollution' && year < S5P_MIN_YEAR) {
    return NextResponse.json(
      { error: `Sentinel-5P TROPOMI ไม่มีข้อมูลก่อนปี ${S5P_MIN_YEAR} (เปิดตัว เมษายน 2018)` },
      { status: 400 }
    );
  }

  // Cache lookup — skip cache for current year (data changes daily)
  const currentYear = new Date().getFullYear();
  const cacheKey = makeCacheKey({ year, baselineYear, isCompare: String(isCompare), metric, pollutant, nightLightsProduct, nightLightsMonth });
  pruneExpiredEntries();
  if (year < currentYear) {
    const cached = TILE_CACHE.get(cacheKey);
    if (cached && cached.expiresAt > Date.now()) {
      return NextResponse.json(cached.payload, {
        headers: { 'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=1800', 'X-Cache': 'HIT' }
      });
    }
  }

  try {
    await initGEE();

    // 1. Load BKK Boundary using direct import so Vercel bundles it
    const bkkBoundary = ee.FeatureCollection(bkkBoundaryData).geometry();

    const today = new Date().toISOString().split('T')[0];
    const todayMMDD = today.slice(5); // "MM-DD"
    // currentYear already declared above for cache logic

    // endMMDD lets compare mode cap both years to the same seasonal window
    const getDateRange = (y: number, endMMDD = '12-31') => ({
      startDate: `${y}-01-01`,
      endDate: `${y}-${y >= currentYear ? todayMMDD : endMMDD}`,
    });

    const waterMask = ee.Image("JRC/GSW1_4/GlobalSurfaceWater")
      .select("occurrence")
      .gte(50)
      .not()
      .unmask(1);

    const maskSentinel2 = (image: any) => {
      const scl = image.select('SCL');
      const clearMask = scl
        .neq(0)
        .and(scl.neq(1))
        .and(scl.neq(3))
        .and(scl.neq(8))
        .and(scl.neq(9))
        .and(scl.neq(10))
        .and(scl.neq(11));
      return image.updateMask(clearMask);
    };

    const getSentinelNdviImage = (y: number, endMMDD = '12-31') => {
      const { startDate, endDate } = getDateRange(y, endMMDD);
      const collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(bkkBoundary)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
        .map(maskSentinel2)
        .map((image: any) => {
          const nir = image.select('B8').divide(10000);
          const red = image.select('B4').divide(10000);
          return nir.subtract(red).divide(nir.add(red)).rename('NDVI');
        });

      return collection.median().updateMask(waterMask).clip(bkkBoundary);
    };

    const getSentinelNdwiImage = (y: number, endMMDD = '12-31') => {
      const { startDate, endDate } = getDateRange(y, endMMDD);
      const collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(bkkBoundary)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
        .map(maskSentinel2)
        .map((image: any) => {
          const green = image.select('B3').divide(10000);
          const nir = image.select('B8').divide(10000);
          return green.subtract(nir).divide(green.add(nir)).rename('NDWI');
        });
      return collection.median().clip(bkkBoundary);
    };

    const getSentinelMndwiImage = (y: number, endMMDD = '12-31') => {
      const { startDate, endDate } = getDateRange(y, endMMDD);
      const collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(bkkBoundary)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
        .map(maskSentinel2)
        .map((image: any) => {
          const green = image.select('B3').divide(10000);
          const swir = image.select('B11').divide(10000);
          return green.subtract(swir).divide(green.add(swir)).rename('MNDWI');
        });
      return collection.median().clip(bkkBoundary);
    };

    const getSentinelNdbiImage = (y: number, endMMDD = '12-31') => {
      const { startDate, endDate } = getDateRange(y, endMMDD);
      const collection = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(bkkBoundary)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
        .map(maskSentinel2)
        .map((image: any) => {
          const swir = image.select('B11').divide(10000);
          const nir = image.select('B8').divide(10000);
          return swir.subtract(nir).divide(swir.add(nir)).rename('NDBI');
        });

      return collection.median().updateMask(waterMask).clip(bkkBoundary);
    };

    const getLandsatImage = (y: number, endMMDD = '12-31') => {
      const { startDate, endDate } = getDateRange(y, endMMDD);
      // From 2022 both LC08 and LC09 operate simultaneously — merge for better temporal coverage
      const lc08 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2');
      const collection = (y >= 2022 ? lc08.merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')) : lc08)
        .filterBounds(bkkBoundary)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUD_COVER', 20));

      return collection.median().clip(bkkBoundary);
    };

    const getMetricImage = (y: number, endMMDD = '12-31') => {
      if (metric === 'vegetation') return getSentinelNdviImage(y, endMMDD);
      if (metric === 'builtup') return getSentinelNdbiImage(y, endMMDD);
      if (metric === 'ndwi') return getSentinelNdwiImage(y, endMMDD);
      if (metric === 'mndwi') return getSentinelMndwiImage(y, endMMDD);
      if (metric === 'air_pollution') {
        const { startDate, endDate } = getDateRange(y, endMMDD);
        if (pollutant === 'co') {
          return ee.ImageCollection('COPERNICUS/S5P/OFFL/L3_CO')
            .filterBounds(bkkBoundary)
            .filterDate(startDate, endDate)
            .select('CO_column_number_density')
            .mean()
            .rename('CO')
            .clip(bkkBoundary);
        }
        if (pollutant === 'so2') {
          return ee.ImageCollection('COPERNICUS/S5P/OFFL/L3_SO2')
            .filterBounds(bkkBoundary)
            .filterDate(startDate, endDate)
            .select('SO2_column_number_density')
            .mean()
            .rename('SO2')
            .clip(bkkBoundary);
        }
        if (pollutant === 'aerosol') {
          return ee.ImageCollection('COPERNICUS/S5P/OFFL/L3_AER_AI')
            .filterBounds(bkkBoundary)
            .filterDate(startDate, endDate)
            .select('absorbing_aerosol_index')
            .mean()
            .rename('AEROSOL')
            .clip(bkkBoundary);
        }
        return ee.ImageCollection('COPERNICUS/S5P/OFFL/L3_NO2')
          .filterBounds(bkkBoundary)
          .filterDate(startDate, endDate)
          .select('tropospheric_NO2_column_number_density')
          .mean()
          .rename('NO2')
          .clip(bkkBoundary);
      }
      if (metric === 'nightlights') {
        if (nightLightsProduct === 'monthly') {
          const targetYear = Math.max(2014, Math.min(2025, y));
          const endDate = nightLightsMonth === 12 ? `${targetYear + 1}-01-01` : `${targetYear}-${String(nightLightsMonth + 1).padStart(2, '0')}-01`;
          return ee.ImageCollection('NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG')
            .filterBounds(bkkBoundary)
            .filterDate(`${targetYear}-${String(nightLightsMonth).padStart(2, '0')}-01`, endDate)
            .map((image: any) => image
              .select('avg_rad')
              .max(0)
              .rename('NTL')
              .updateMask(image.select('cf_cvg').gte(3)))
            .mean()
            .rename('NTL')
            .clip(bkkBoundary);
        }

        const targetYear = Math.max(2014, Math.min(2024, y));
        return ee.ImageCollection('NOAA/VIIRS/DNB/ANNUAL_V22')
          .filterBounds(bkkBoundary)
          .filterDate(`${targetYear}-01-01`, `${targetYear + 1}-01-01`)
          .first()
          .select('average_masked')
          .max(0)
          .rename('NTL')
          .clip(bkkBoundary);
      }

      // LST retrieval following Wan & Dozier (1996) emissivity correction:
      // 1. Convert DN → Brightness Temperature (K)
      // 2. Estimate emissivity from NDVI (Sobrino et al. 2004):
      //    pv = ((NDVI - 0.2) / (0.5 - 0.2))²  (clamped 0–1)
      //    ε = 0.004 * pv + 0.986
      // 3. LST = BT / (1 + (λ*BT/ρ)*ln(ε)) where λ=10.895μm, ρ=14380 μm·K
      const landsatImg = getLandsatImage(y, endMMDD);
      const bt = landsatImg.select('ST_B10').multiply(0.00341802).add(149.0); // Kelvin

      const ndviForEmis = ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(bkkBoundary)
        .filterDate(...Object.values(getDateRange(y, endMMDD)) as [string, string])
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
        .map(maskSentinel2)
        .map((img: any) => {
          const nir = img.select('B8').divide(10000);
          const red = img.select('B4').divide(10000);
          return nir.subtract(red).divide(nir.add(red)).rename('NDVI');
        })
        .median()
        .reproject({ crs: 'EPSG:4326', scale: 30 });

      const pv = ndviForEmis.subtract(0.2).divide(0.3).clamp(0, 1).pow(2);
      const emissivity = pv.multiply(0.004).add(0.986);
      const lambda = 10.895; // μm (Landsat 8/9 Band 10 central wavelength)
      const rho = 14380;     // μm·K (h*c/σ)
      const lstK = bt.divide(
        ee.Image(1).add(bt.multiply(lambda / rho).multiply(emissivity.log()))
      );
      return lstK.subtract(273.15).rename('LST').clip(bkkBoundary);
    };

    let resultImage;
    let visParams;

    if (isCompare) {
      // Both years use the same seasonal window (Jan 1 – today's MM-DD) for a fair comparison
      const current = getMetricImage(year, todayMMDD);
      const baseline = getMetricImage(baselineYear, todayMMDD);
      resultImage = current.subtract(baseline);
      
      visParams = metric === 'vegetation'
        ? { min: -0.2, max: 0.2, palette: ['#8B1E1E', '#F59E0B', '#F7F7F7', '#86EFAC', '#047857'] }
        : metric === 'builtup'
          ? { min: -0.2, max: 0.2, palette: ['#047857', '#86EFAC', '#F7F7F7', '#F59E0B', '#8B1E1E'] }
          : metric === 'nightlights'
            ? { min: -12, max: 12, palette: ['#08306B', '#4292C6', '#F7F7F7', '#F59E0B', '#B45309'] }
            : metric === 'air_pollution'
              ? { min: pollutant === 'co' ? -0.01 : pollutant === 'aerosol' ? -0.4 : -0.00008, max: pollutant === 'co' ? 0.01 : pollutant === 'aerosol' ? 0.4 : 0.00008, palette: ['#2166AC', '#67A9CF', '#F7F7F7', '#F59E0B', '#B2182B'] }
            : (metric === 'ndwi' || metric === 'mndwi')
              ? { min: -0.5, max: 0.5, palette: ['#78350F', '#C4974A', '#F7F7F7', '#7EC8E3', '#075985'] }
              : { min: -3, max: 3, palette: ['#2166AC', '#67A9CF', '#F7F7F7', '#EF8A62', '#B2182B'] };
    } else {
      resultImage = getMetricImage(year);

      visParams = metric === 'vegetation'
        ? { min: 0.1, max: 0.8, palette: ['#7F1D1D', '#B45309', '#FACC15', '#84CC16', '#16A34A', '#065F46'] }
        : metric === 'builtup'
          ? { min: -0.2, max: 0.4, palette: ['#16A34A', '#84CC16', '#FACC15', '#F59E0B', '#EF4444', '#7F1D1D'] }
          : metric === 'nightlights'
            ? { min: 0, max: 80, palette: ['#030712', '#172554', '#2563EB', '#FACC15', '#F97316', '#FFFFFF'] }
            : metric === 'air_pollution'
              ? pollutant === 'co'
                ? { min: 0.015, max: 0.055, palette: ['#ECFEFF', '#67E8F9', '#22C55E', '#FACC15', '#F97316', '#7F1D1D'] }
                : pollutant === 'so2'
                  ? { min: -0.0001, max: 0.0006, palette: ['#F8FAFC', '#A7F3D0', '#FDE047', '#FB923C', '#B91C1C'] }
                  : pollutant === 'aerosol'
                    ? { min: -1, max: 2, palette: ['#0F766E', '#E0F2FE', '#FDE68A', '#FB923C', '#7F1D1D'] }
                    : { min: 0, max: 0.0003, palette: ['#ECFEFF', '#67E8F9', '#22C55E', '#FACC15', '#F97316', '#7F1D1D'] }
            : (metric === 'ndwi' || metric === 'mndwi')
              ? { min: -0.5, max: 0.5, palette: ['#78350F', '#C4974A', '#F7F7F7', '#7EC8E3', '#075985'] }
              : { min: 25, max: 45, palette: ['#FFEDA0', '#FED976', '#FD8D3C', '#E31A1C', '#BD0026', '#800026'] };
    }

    // Scene count for the primary year collection (Sentinel-2 / Landsat)
    const MIN_SCENE_COUNT = 5;
    const getPrimaryCollection = () => {
      const { startDate, endDate } = getDateRange(year, isCompare ? todayMMDD : '12-31');
      if (metric === 'vegetation' || metric === 'builtup' || metric === 'ndwi' || metric === 'mndwi') {
        return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
          .filterBounds(bkkBoundary)
          .filterDate(startDate, endDate)
          .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40));
      }
      if (metric === 'lst') {
        const lc08 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2');
        return (year >= 2022 ? lc08.merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')) : lc08)
          .filterBounds(bkkBoundary)
          .filterDate(startDate, endDate)
          .filter(ee.Filter.lt('CLOUD_COVER', 20));
      }
      return null;
    };

    const primaryCol = getPrimaryCollection();
    const [mapIdData, sceneCount]: [any, number] = await Promise.all([
      new Promise((resolve, reject) => {
        resultImage.getMapId(visParams, (data: any, err: any) => {
          if (err) reject(err);
          else resolve(data);
        });
      }),
      primaryCol
        ? new Promise<number>((resolve) => {
            primaryCol.size().evaluate((val: number, err: any) => resolve(err || val == null ? -1 : val));
          })
        : Promise.resolve(-1),
    ]);

    const responsePayload: Record<string, unknown> = {
      urlFormat: mapIdData.urlFormat,
      mapid: mapIdData.mapid,
      token: mapIdData.token,
      sceneCount,
      lowSceneWarning: sceneCount >= 0 && sceneCount < MIN_SCENE_COUNT,
      dataSource: metric === 'vegetation'
        ? 'Sentinel-2 SR Harmonized yearly median NDVI'
        : metric === 'builtup'
          ? 'Sentinel-2 SR Harmonized yearly median NDBI'
          : metric === 'nightlights'
            ? nightLightsProduct === 'monthly'
              ? 'VIIRS DNB monthly avg_rad preview'
              : 'VIIRS DNB Annual V2.2 average_masked'
            : metric === 'air_pollution'
              ? `Sentinel-5P OFFL yearly mean ${pollutant.toUpperCase()} (ความละเอียด 1,000m — ตีความระดับเขตด้วยความระมัดระวัง)`
            : metric === 'ndwi'
              ? 'Sentinel-2 SR Harmonized yearly median NDWI'
              : metric === 'mndwi'
                ? 'Sentinel-2 SR Harmonized yearly median MNDWI'
                : 'Landsat 8/9 C2 L2 yearly median LST (emissivity-corrected)',
      resolutionMeters: metric === 'vegetation' || metric === 'builtup' || metric === 'ndwi' || metric === 'mndwi' ? 10 : metric === 'nightlights' || metric === 'air_pollution' ? 1000 : 30,
    };

    // Store in cache for past years (current year excluded — data changes daily)
    if (year < currentYear) {
      TILE_CACHE.set(cacheKey, { payload: responsePayload, expiresAt: Date.now() + TILE_TTL_MS });
    }

    return NextResponse.json(responsePayload, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=1800',
        'X-Cache': 'MISS',
      }
    });

  } catch (error: any) {
    const msg: string = error?.message ?? String(error);
    console.error('❌ GEE API Error:', msg);
    const isAuthError = msg.includes('auth') || msg.includes('token') || msg.includes('credentials') || msg.includes('401') || msg.includes('403');
    return NextResponse.json(
      { error: isAuthError ? 'GEE authentication failed — check service account credentials' : msg },
      { status: isAuthError ? 503 : 500 }
    );
  }
}
