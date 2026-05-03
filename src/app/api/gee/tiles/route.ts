import { NextResponse } from 'next/server';
import ee, { initGEE } from '@/lib/gee';
import bkkBoundaryData from '@/data/bkk_districts.json';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  
  // Handle 'null' or 'NaN' strings from frontend
  const yearParam = searchParams.get('year');
  const baselineParam = searchParams.get('baseline');
  
  const year = yearParam && yearParam !== 'null' ? parseInt(yearParam, 10) : 2024;
  const baselineYear = baselineParam && baselineParam !== 'null' ? parseInt(baselineParam, 10) : 2018;
  const isCompare = searchParams.get('compare') === 'true';
  const metricParam = searchParams.get('metric');
  const metric = metricParam === 'vegetation' ? 'vegetation' : metricParam === 'builtup' ? 'builtup' : 'lst';

  try {
    await initGEE();

    // 1. Load BKK Boundary using direct import so Vercel bundles it
    const bkkBoundary = ee.FeatureCollection(bkkBoundaryData).geometry();

    const today = new Date().toISOString().split('T')[0];
    const todayMMDD = today.slice(5); // "MM-DD"
    const currentYear = new Date().getFullYear();

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

      // ST_B10 is Surface Temperature band (Kelvin)
      // Scale: 0.00341802, Offset: 149.0
      const image = getLandsatImage(y, endMMDD);
      return image.select('ST_B10').multiply(0.00341802).add(149.0).subtract(273.15);
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
          : { min: -3, max: 3, palette: ['#2166AC', '#67A9CF', '#F7F7F7', '#EF8A62', '#B2182B'] };
    } else {
      resultImage = getMetricImage(year);
      
      visParams = metric === 'vegetation'
        ? { min: 0.1, max: 0.8, palette: ['#7F1D1D', '#B45309', '#FACC15', '#84CC16', '#16A34A', '#065F46'] }
        : metric === 'builtup'
          ? { min: -0.2, max: 0.4, palette: ['#16A34A', '#84CC16', '#FACC15', '#F59E0B', '#EF4444', '#7F1D1D'] }
          : { min: 25, max: 45, palette: ['#FFEDA0', '#FED976', '#FD8D3C', '#E31A1C', '#BD0026', '#800026'] };
    }

    // Get Map ID from GEE
    const mapIdData: any = await new Promise((resolve, reject) => {
      resultImage.getMapId(visParams, (data: any, err: any) => {
        if (err) reject(err);
        else resolve(data);
      });
    });

    return NextResponse.json({
      urlFormat: mapIdData.urlFormat,
      mapid: mapIdData.mapid,
      token: mapIdData.token,
      dataSource: metric === 'vegetation'
        ? 'Sentinel-2 SR Harmonized yearly median NDVI'
        : metric === 'builtup'
          ? 'Sentinel-2 SR Harmonized yearly median NDBI'
          : 'Landsat 8/9 Collection 2 Level 2 yearly median LST',
      resolutionMeters: metric === 'vegetation' || metric === 'builtup' ? 10 : 30,
    }, {
      headers: {
        'Cache-Control': 'public, s-maxage=3600, stale-while-revalidate=1800'
      }
    });

  } catch (error: any) {
    console.error('❌ GEE API Error:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}
