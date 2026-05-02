import { NextResponse } from 'next/server';
import ee, { initGEE } from '@/lib/gee';

function evaluateEe<T>(eeObject: any): Promise<T> {
  return new Promise((resolve, reject) => {
    eeObject.evaluate((value: T, error: any) => {
      if (error) reject(error);
      else resolve(value);
    });
  });
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const lat = parseFloat(searchParams.get('lat') || '0');
  const lng = parseFloat(searchParams.get('lng') || '0');
  const year = parseInt(searchParams.get('year') || '2024', 10);
  const baselineYear = parseInt(searchParams.get('baseline') || '2018', 10);
  const isCompare = searchParams.get('compare') === 'true';
  const metric = searchParams.get('metric') === 'vegetation' ? 'vegetation' : 'lst';

  if (!lat || !lng) {
    return NextResponse.json({ error: 'Missing coordinates' }, { status: 400 });
  }

  try {
    await initGEE();

    // 1. Define Point
    const point = ee.Geometry.Point([lng, lat]);

    const today = new Date().toISOString().split('T')[0];
    const todayMMDD = today.slice(5); // "MM-DD"
    const currentYear = new Date().getFullYear();

    const getDateRange = (targetYear: number, endMMDD = '12-31') => ({
      startDate: `${targetYear}-01-01`,
      endDate: `${targetYear}-${targetYear >= currentYear ? todayMMDD : endMMDD}`,
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

    const getSentinelNdviImage = (targetYear: number, endMMDD = '12-31') => {
      const { startDate, endDate } = getDateRange(targetYear, endMMDD);
      return ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
        .filterBounds(point)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
        .map(maskSentinel2)
        .map((image: any) => {
          const nir = image.select('B8').divide(10000);
          const red = image.select('B4').divide(10000);
          return nir.subtract(red).divide(nir.add(red)).rename('NDVI');
        })
        .median()
        .updateMask(waterMask);
    };

    const getLandsatLSTImage = (targetYear: number, endMMDD = '12-31') => {
      const { startDate, endDate } = getDateRange(targetYear, endMMDD);
      const lc08 = ee.ImageCollection('LANDSAT/LC08/C02/T1_L2');
      const collection = (targetYear >= 2022 ? lc08.merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2')) : lc08)
        .filterBounds(point)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUD_COVER', 20));

      const image = collection.median();
      const kelvin = image.select('ST_B10').multiply(0.00341802).add(149.0);
      const celsius = kelvin.subtract(273.15).updateMask(waterMask);
      return celsius.rename('LST');
    };

    const { startDate, endDate } = getDateRange(year);
    const collection = metric === 'vegetation'
      ? ee.ImageCollection('COPERNICUS/S2_SR_HARMONIZED')
          .filterBounds(point)
          .filterDate(startDate, endDate)
          .filter(ee.Filter.lt('CLOUDY_PIXEL_PERCENTAGE', 40))
      : (year >= 2022
          ? ee.ImageCollection('LANDSAT/LC08/C02/T1_L2').merge(ee.ImageCollection('LANDSAT/LC09/C02/T1_L2'))
          : ee.ImageCollection('LANDSAT/LC08/C02/T1_L2'))
          .filterBounds(point)
          .filterDate(startDate, endDate)
          .filter(ee.Filter.lt('CLOUD_COVER', 20));

    const imageCount = await evaluateEe<number>(collection.size());
    if (!imageCount) {
      return NextResponse.json({ error: 'No satellite data found for this location/year' }, { status: 404 });
    }

    const currentImage = metric === 'vegetation' ? getSentinelNdviImage(year, todayMMDD) : getLandsatLSTImage(year, todayMMDD);
    const metricImage = isCompare
      ? currentImage.subtract(metric === 'vegetation' ? getSentinelNdviImage(baselineYear, todayMMDD) : getLandsatLSTImage(baselineYear, todayMMDD))
      : currentImage;

    // 3. Sample the value at the point
    const result = await evaluateEe<Record<string, number | null>>(metricImage.reduceRegion({
      reducer: ee.Reducer.first(),
      geometry: point,
      scale: metric === 'vegetation' ? 10 : 30,
      bestEffort: true,
    }));

    const value = metric === 'vegetation' ? result.NDVI : result.LST;

    return NextResponse.json({ 
      temp: value !== null && value !== undefined ? parseFloat(value.toFixed(metric === 'vegetation' ? 3 : 2)) : null,
      metric,
      lat,
      lng,
      year,
      baselineYear: isCompare ? baselineYear : null,
      compare: isCompare,
      dataSource: metric === 'vegetation'
        ? 'Sentinel-2 SR Harmonized yearly median NDVI'
        : 'Landsat 8/9 Collection 2 Level 2 yearly median LST',
      resolutionMeters: metric === 'vegetation' ? 10 : 30
    });

  } catch (error: any) {
    console.error('❌ GEE Point Query Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
