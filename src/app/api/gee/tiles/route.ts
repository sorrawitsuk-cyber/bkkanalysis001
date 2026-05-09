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
  const metric = metricParam === 'vegetation' ? 'vegetation' : metricParam === 'builtup' ? 'builtup' : metricParam === 'nightlights' ? 'nightlights' : metricParam === 'ndwi' ? 'ndwi' : metricParam === 'mndwi' ? 'mndwi' : metricParam === 'air_pollution' ? 'air_pollution' : 'lst';
  const pollutantParam = searchParams.get('pollutant');
  const pollutant = pollutantParam === 'co' ? 'co' : pollutantParam === 'so2' ? 'so2' : pollutantParam === 'aerosol' ? 'aerosol' : 'no2';
  const nightLightsProduct = searchParams.get('product') === 'monthly' ? 'monthly' : 'annual';
  const nightLightsMonth = Math.max(1, Math.min(3, parseInt(searchParams.get('month') || '3', 10)));

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
          : metric === 'nightlights'
            ? nightLightsProduct === 'monthly'
              ? 'VIIRS DNB monthly avg_rad preview'
              : 'VIIRS DNB Annual V2.2 average_masked'
            : metric === 'air_pollution'
              ? `Sentinel-5P OFFL yearly mean ${pollutant.toUpperCase()}`
            : metric === 'ndwi'
              ? 'Sentinel-2 SR Harmonized yearly median NDWI'
              : metric === 'mndwi'
                ? 'Sentinel-2 SR Harmonized yearly median MNDWI'
                : 'Landsat 8/9 Collection 2 Level 2 yearly median LST',
      resolutionMeters: metric === 'vegetation' || metric === 'builtup' || metric === 'ndwi' || metric === 'mndwi' ? 10 : metric === 'nightlights' || metric === 'air_pollution' ? 1000 : 30,
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
