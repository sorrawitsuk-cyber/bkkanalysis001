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
  const metric = searchParams.get('metric') === 'vegetation' ? 'vegetation' : 'lst';

  try {
    await initGEE();

    // 1. Load BKK Boundary using direct import so Vercel bundles it
    const bkkBoundary = ee.FeatureCollection(bkkBoundaryData).geometry();

    const getDateRange = (y: number) => {
      const currentYear = new Date().getFullYear();
      const today = new Date().toISOString().split('T')[0];
      return {
        startDate: `${y}-01-01`,
        endDate: y === currentYear ? today : `${y}-12-31`,
      };
    };

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

    const getSentinelNdviImage = (y: number) => {
      const { startDate, endDate } = getDateRange(y);
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

      return collection.median().clip(bkkBoundary);
    };

    const getLandsatImage = (y: number) => {
      const collectionId = y >= 2022 ? "LANDSAT/LC09/C02/T1_L2" : "LANDSAT/LC08/C02/T1_L2";
      const { startDate, endDate } = getDateRange(y);

      const collection = ee.ImageCollection(collectionId)
        .filterBounds(bkkBoundary)
        .filterDate(startDate, endDate)
        .filter(ee.Filter.lt('CLOUD_COVER', 20));

      // Use median to remove clouds/artifacts
      return collection.median().clip(bkkBoundary);
    };

    const getMetricImage = (y: number) => {
      if (metric === 'vegetation') return getSentinelNdviImage(y);

      // ST_B10 is Surface Temperature band (Kelvin)
      // Scale: 0.00341802, Offset: 149.0
      const image = getLandsatImage(y);
      return image.select('ST_B10').multiply(0.00341802).add(149.0).subtract(273.15);
    };

    let resultImage;
    let visParams;

    if (isCompare) {
      // Anomaly Mode: current - baseline
      const current = getMetricImage(year);
      const baseline = getMetricImage(baselineYear);
      resultImage = current.subtract(baseline);
      
      visParams = metric === 'vegetation'
        ? { min: -0.2, max: 0.2, palette: ['#8B1E1E', '#F59E0B', '#F7F7F7', '#86EFAC', '#047857'] }
        : { min: -3, max: 3, palette: ['#2166AC', '#67A9CF', '#F7F7F7', '#EF8A62', '#B2182B'] };
    } else {
      resultImage = getMetricImage(year);
      
      visParams = metric === 'vegetation'
        ? { min: 0.1, max: 0.8, palette: ['#7F1D1D', '#B45309', '#FACC15', '#84CC16', '#16A34A', '#065F46'] }
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
        : 'Landsat 8/9 Collection 2 Level 2 yearly median LST',
      resolutionMeters: metric === 'vegetation' ? 10 : 30,
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
