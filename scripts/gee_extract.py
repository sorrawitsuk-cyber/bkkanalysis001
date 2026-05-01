"""
Google Earth Engine extraction pipeline for Bangkok district NDVI and NTL metrics.

The script calculates annual Landsat Collection 2 Level 2 NDVI metrics per district
and upserts the results into Supabase `district_statistics` using `(district_id, year)`
as the conflict key.
"""

import json
import os
from typing import Any, Dict, Optional

import ee
from dotenv import load_dotenv
from supabase import Client, create_client


load_dotenv(dotenv_path=os.path.join(os.path.dirname(__file__), "../.env.local"))

SUPABASE_URL = os.getenv("NEXT_PUBLIC_SUPABASE_URL")
SUPABASE_KEY = os.getenv("NEXT_PUBLIC_SUPABASE_ANON_KEY")

if not SUPABASE_URL or not SUPABASE_KEY:
    raise ValueError("Missing Supabase credentials in .env.local")

supabase: Client = create_client(SUPABASE_URL, SUPABASE_KEY)


def init_gee() -> None:
    """Initialize Google Earth Engine, prompting auth only when needed."""
    try:
        ee.Initialize()
        print("[gee] Initialized successfully")
    except Exception:
        print("[gee] Not authenticated. Running earthengine authentication flow...")
        ee.Authenticate()
        ee.Initialize()
        print("[gee] Initialized successfully after authentication")


def get_bkk_geojson() -> Dict[str, Any]:
    """Load Bangkok district GeoJSON from the repository data folder."""
    candidates = [
        os.path.join(os.path.dirname(__file__), "../src/data/bkk_districts.geojson"),
        os.path.join(os.path.dirname(__file__), "../src/data/bkk_districts.json"),
    ]
    for filepath in candidates:
        if os.path.exists(filepath):
            with open(filepath, "r", encoding="utf-8") as f:
                return json.load(f)
    raise FileNotFoundError("Could not find bkk_districts.geojson or bkk_districts.json")


def normalize_ndvi_score(ndvi: Optional[float]) -> Optional[float]:
    """Normalize urban NDVI to a 0-10 score where 0.10=0 and 0.60=10."""
    if ndvi is None:
        return None
    score = ((ndvi - 0.10) / (0.60 - 0.10)) * 10
    return round(max(0, min(10, score)), 2)


def classify_ndvi(ndvi: Optional[float]) -> str:
    if ndvi is None:
        return "Unknown"
    if ndvi < 0.15:
        return "Very Low"
    if ndvi < 0.25:
        return "Low"
    if ndvi < 0.35:
        return "Moderate"
    if ndvi < 0.50:
        return "Good"
    return "Very Good"


def safe_get_info(value: Any, default: Any = None) -> Any:
    """Safely call getInfo on an EE object without crashing the district loop."""
    try:
        if value is None:
            return default
        result = value.getInfo() if hasattr(value, "getInfo") else value
        return default if result is None else result
    except Exception as exc:
        print(f"[warn] Earth Engine getInfo failed: {exc}")
        return default


def safe_float(value: Any, digits: int = 4) -> Optional[float]:
    if value is None:
        return None
    try:
        return round(float(value), digits)
    except (TypeError, ValueError):
        return None


def create_ee_geometry(feature: Dict[str, Any]) -> ee.Geometry:
    """Create an EE geometry from Polygon or MultiPolygon GeoJSON."""
    geometry = feature.get("geometry")
    if not geometry:
        raise ValueError("Feature has no geometry")
    return ee.Geometry(geometry)


def mask_landsat_l2(image: ee.Image) -> ee.Image:
    """
    Apply Landsat C2 L2 cloud/shadow mask and reflectance scale factor.

    QA_PIXEL bits used here: fill, dilated cloud, cirrus, cloud, cloud shadow, snow.
    Optical SR bands are scaled using USGS Collection 2 Level 2 factors:
    reflectance = DN * 0.0000275 - 0.2.
    """
    qa = image.select("QA_PIXEL")
    clear_mask = (
        qa.bitwiseAnd(1 << 0)
        .eq(0)
        .And(qa.bitwiseAnd(1 << 1).eq(0))
        .And(qa.bitwiseAnd(1 << 2).eq(0))
        .And(qa.bitwiseAnd(1 << 3).eq(0))
        .And(qa.bitwiseAnd(1 << 4).eq(0))
        .And(qa.bitwiseAnd(1 << 5).eq(0))
    )
    optical = image.select("SR_B.").multiply(0.0000275).add(-0.2)
    return image.addBands(optical, None, True).updateMask(clear_mask)


def add_ndvi_ndwi(image: ee.Image) -> ee.Image:
    ndvi = image.normalizedDifference(["SR_B5", "SR_B4"]).rename("NDVI")
    ndwi = image.normalizedDifference(["SR_B3", "SR_B5"]).rename("NDWI")
    return image.addBands([ndvi, ndwi])


def calculate_area_metrics(ndvi_image: ee.Image, geom: ee.Geometry) -> Dict[str, Optional[float]]:
    pixel_area = ee.Image.pixelArea()
    total_area = safe_get_info(pixel_area.reduceRegion(
        reducer=ee.Reducer.sum(),
        geometry=geom,
        scale=30,
        maxPixels=1e10,
        bestEffort=True,
    ).get("area"), 0) or 0

    # NDWI > 0 is a conservative water proxy for this dashboard. It should be
    # validated against Bangkok waterbody/open-space layers before operational use.
    water_mask = ndvi_image.select("NDWI").gt(0)
    green_mask = ndvi_image.select("NDVI").gt(0.30).And(water_mask.Not())
    low_green_mask = ndvi_image.select("NDVI").lt(0.20).And(water_mask.Not())

    area_image = ee.Image.cat([
        pixel_area.updateMask(green_mask).rename("green_area"),
        pixel_area.updateMask(low_green_mask).rename("low_green_area"),
        pixel_area.updateMask(water_mask).rename("water_area"),
    ])

    areas = safe_get_info(area_image.reduceRegion(
        reducer=ee.Reducer.sum(),
        geometry=geom,
        scale=30,
        maxPixels=1e10,
        bestEffort=True,
    ), {}) or {}

    green_area = float(areas.get("green_area") or 0)
    low_green_area = float(areas.get("low_green_area") or 0)
    water_area = float(areas.get("water_area") or 0)
    land_area = max(float(total_area) - water_area, 0)
    green_denominator = land_area if land_area > 0 else float(total_area or 0)

    return {
        "green_area_ratio": safe_float(green_area / green_denominator if green_denominator else None),
        "green_area_rai": safe_float(green_area / 1600, 2),
        "low_green_ratio": safe_float(low_green_area / total_area if total_area else None),
        "water_ratio": safe_float(water_area / total_area if total_area else 0),
    }


def extract_district_year_stats(feature: Dict[str, Any], year: int) -> Dict[str, Any]:
    props = feature.get("properties", {})
    dist_id = props.get("id")
    dist_name = props.get("name_th") or props.get("name_en") or f"district {dist_id}"
    geom = create_ee_geometry(feature)

    landsat = (
        ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
        .filterBounds(geom)
        .filterDate(f"{year}-01-01", f"{year}-12-31")
        .map(mask_landsat_l2)
        .map(add_ndvi_ndwi)
    )
    annual = landsat.select(["NDVI", "NDWI"]).median().clip(geom)

    ndvi_stats = safe_get_info(annual.select("NDVI").reduceRegion(
        reducer=(
            ee.Reducer.mean()
            .combine(ee.Reducer.median(), sharedInputs=True)
            .combine(ee.Reducer.minMax(), sharedInputs=True)
        ),
        geometry=geom,
        scale=30,
        maxPixels=1e10,
        bestEffort=True,
    ), {}) or {}

    viirs = (
        ee.ImageCollection("NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG")
        .filterBounds(geom)
        .filterDate(f"{year}-01-01", f"{year}-12-31")
        .select("avg_rad")
        .mean()
    )
    ntl_mean = safe_float(safe_get_info(viirs.reduceRegion(
        reducer=ee.Reducer.mean(),
        geometry=geom,
        scale=500,
        maxPixels=1e10,
        bestEffort=True,
    ).get("avg_rad")), 4)

    ndvi_mean = safe_float(ndvi_stats.get("NDVI_mean"))
    ndvi_median = safe_float(ndvi_stats.get("NDVI_median"))
    ndvi_min = safe_float(ndvi_stats.get("NDVI_min"))
    ndvi_max = safe_float(ndvi_stats.get("NDVI_max"))
    area_metrics = calculate_area_metrics(annual, geom)

    ntl_proxy = ntl_mean or 0
    # These values are proxy/demo estimates from nighttime lights, not official
    # population, density, growth, or accessibility statistics.
    mock_population = int(ntl_proxy * 5000)
    mock_density = int(ntl_proxy * 150)
    mock_growth = round((ntl_proxy / 10) - 1.0, 2)
    mock_access = round(min(ntl_proxy / 2, 10.0), 1)

    return {
        "district_id": dist_id,
        "year": year,
        "ndvi_mean": ndvi_mean,
        "ndvi_median": ndvi_median,
        "ndvi_min": ndvi_min,
        "ndvi_max": ndvi_max,
        "ndvi_score": normalize_ndvi_score(ndvi_mean),
        "ndvi_class": classify_ndvi(ndvi_mean),
        "green_area_ratio": area_metrics["green_area_ratio"],
        "green_area_rai": area_metrics["green_area_rai"],
        "low_green_ratio": area_metrics["low_green_ratio"],
        "water_ratio": area_metrics["water_ratio"],
        "ntl_mean": ntl_mean,
        "population": mock_population,
        "density": mock_density,
        "growth_rate": mock_growth,
        "accessibility_index": mock_access,
        "data_source": "Landsat 8 C2 L2 SR + VIIRS VCMSLCFG",
        "processing_note": (
            "NDVI uses cloud-masked annual median Landsat L2 reflectance. "
            "Population/density/growth/accessibility are proxy/demo estimates from NTL, not official census data."
        ),
    }


def extract_and_upload_stats(start_year: int = 2020, end_year: int = 2024) -> None:
    print(f"[start] Bangkok NDVI extraction {start_year}-{end_year}")
    bkk_geojson = get_bkk_geojson()
    features = bkk_geojson.get("features", [])

    for year in range(start_year, end_year + 1):
        print(f"\n[year {year}] Processing {len(features)} districts")
        records = []
        for feature in features:
            props = feature.get("properties", {})
            dist_id = props.get("id")
            dist_name = props.get("name_th") or props.get("name_en") or dist_id
            try:
                record = extract_district_year_stats(feature, year)
                records.append(record)
                print(
                    f"[ok] {year} {dist_name}: "
                    f"NDVI={record['ndvi_mean']} score={record['ndvi_score']} "
                    f"green={record['green_area_ratio']} NTL={record['ntl_mean']}"
                )
            except Exception as exc:
                print(f"[error] {year} {dist_name} ({dist_id}) skipped: {exc}")

        if not records:
            print(f"[year {year}] No records to upload")
            continue

        try:
            print(f"[upload] Upserting {len(records)} records into district_statistics")
            supabase.table("district_statistics").upsert(
                records,
                on_conflict="district_id,year",
            ).execute()
            print(f"[done] Year {year} uploaded")
        except Exception as exc:
            print(f"[error] Supabase upsert failed for {year}: {exc}")


if __name__ == "__main__":
    print("--- Bangkok Analytics GEE Pipeline ---")
    init_gee()
    extract_and_upload_stats(2020, 2024)
    print("[done] Script execution finished")
