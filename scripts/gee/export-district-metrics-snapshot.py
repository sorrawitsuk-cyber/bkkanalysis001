"""Export verified Bangkok district metrics from Google Earth Engine.

The output is a repository-friendly JSON snapshot used only when both the
database and live GEE request are unavailable. It contains real reductions,
source labels, periods, and scene counts; it never creates modeled values.
"""

from __future__ import annotations

import argparse
import json
import math
import os
from datetime import date, datetime, timezone
from pathlib import Path
from typing import Any

import ee
from google.oauth2 import service_account


ROOT = Path(__file__).resolve().parents[2]
GEE_SCOPES = ["https://www.googleapis.com/auth/earthengine"]


def init_gee() -> None:
    service_account_json = os.environ.get("GEE_SERVICE_ACCOUNT_JSON")
    if not service_account_json:
        raise RuntimeError("GEE_SERVICE_ACCOUNT_JSON is required")
    info = json.loads(service_account_json)
    credentials = service_account.Credentials.from_service_account_info(
        info,
        scopes=GEE_SCOPES,
    )
    ee.Initialize(credentials=credentials, project=info.get("project_id"))


def load_districts() -> tuple[ee.FeatureCollection, list[dict[str, Any]]]:
    data = json.loads((ROOT / "src/data/bkk_districts.json").read_text("utf-8"))
    features = []
    districts = []
    for feature in data["features"]:
        props = feature["properties"]
        districts.append({
            "id": int(props["id"]),
            "name_th": props["name_th"],
        })
        features.append(
            ee.Feature(
                ee.Geometry(feature["geometry"]).simplify(30),
                {"id": props["id"], "name_th": props["name_th"]},
            )
        )
    return ee.FeatureCollection(features), districts


def date_range(year: int) -> tuple[str, str, str]:
    today = date.today()
    start = f"{year}-01-01"
    if year >= today.year:
        end_exclusive = today.isoformat()
        end_label = today.isoformat()
    else:
        end_exclusive = f"{year + 1}-01-01"
        end_label = f"{year}-12-31"
    return start, end_exclusive, end_label


def mask_sentinel2(image: ee.Image) -> ee.Image:
    scl = image.select("SCL")
    clear = (
        scl.neq(0)
        .And(scl.neq(1))
        .And(scl.neq(3))
        .And(scl.neq(8))
        .And(scl.neq(9))
        .And(scl.neq(10))
        .And(scl.neq(11))
    )
    return image.updateMask(clear)


def sentinel_collection(year: int, geometry: ee.Geometry) -> ee.ImageCollection:
    start, end, _ = date_range(year)
    return (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(geometry)
        .filterDate(start, end)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", 40))
        .map(mask_sentinel2)
    )


def landsat_collection(year: int, geometry: ee.Geometry) -> ee.ImageCollection:
    start, end, _ = date_range(year)
    landsat8 = ee.ImageCollection("LANDSAT/LC08/C02/T1_L2")
    collection = (
        landsat8.merge(ee.ImageCollection("LANDSAT/LC09/C02/T1_L2"))
        if year >= 2022
        else landsat8
    )
    return (
        collection.filterBounds(geometry)
        .filterDate(start, end)
        .filter(ee.Filter.lt("CLOUD_COVER", 20))
    )


def sentinel_images(year: int, geometry: ee.Geometry) -> tuple[ee.Image, ee.Image, int]:
    collection = sentinel_collection(year, geometry)
    scene_count = int(collection.size().getInfo())
    water_mask = (
        ee.Image("JRC/GSW1_4/GlobalSurfaceWater")
        .select("occurrence")
        .gte(50)
        .Not()
        .unmask(1)
    )

    def add_indices(image: ee.Image) -> ee.Image:
        scaled = image.divide(10000)
        ndvi = scaled.normalizedDifference(["B8", "B4"]).rename("ndvi")
        ndbi = scaled.normalizedDifference(["B11", "B8"]).rename("ndbi")
        return ndvi.addBands(ndbi)

    median = collection.map(add_indices).median().updateMask(water_mask).clip(geometry)
    ndvi = median.select("ndvi")
    vegetation = (
        ndvi.addBands(ndvi.gte(0.2).rename("green"))
        .addBands(ndvi.lt(0.2).rename("low_green"))
    )
    return vegetation, median.select("ndbi"), scene_count


def lst_image(year: int, geometry: ee.Geometry) -> tuple[ee.Image, int]:
    collection = landsat_collection(year, geometry)
    scene_count = int(collection.size().getInfo())
    median = collection.median().clip(geometry)
    brightness_temperature = median.select("ST_B10").multiply(0.00341802).add(149.0)
    nir = median.select("SR_B5").multiply(0.0000275).add(-0.2)
    red = median.select("SR_B4").multiply(0.0000275).add(-0.2)
    ndvi = nir.subtract(red).divide(nir.add(red))
    vegetation_proportion = ndvi.subtract(0.2).divide(0.3).clamp(0, 1).pow(2)
    emissivity = vegetation_proportion.multiply(0.004).add(0.986)
    corrected_kelvin = brightness_temperature.divide(
        ee.Image(1).add(
            brightness_temperature.multiply(10.895 / 14380).multiply(emissivity.log())
        )
    )
    return corrected_kelvin.subtract(273.15).rename("lst").clip(geometry), scene_count


def air_image(year: int, geometry: ee.Geometry) -> ee.Image:
    start, end, _ = date_range(year)

    def mean(collection_id: str, band: str, name: str) -> ee.Image:
        return (
            ee.ImageCollection(collection_id)
            .filterBounds(geometry)
            .filterDate(start, end)
            .select(band)
            .mean()
            .rename(name)
        )

    return (
        mean(
            "COPERNICUS/S5P/OFFL/L3_NO2",
            "tropospheric_NO2_column_number_density",
            "no2",
        )
        .addBands(mean("COPERNICUS/S5P/OFFL/L3_CO", "CO_column_number_density", "co"))
        .addBands(mean("COPERNICUS/S5P/OFFL/L3_SO2", "SO2_column_number_density", "so2"))
        .addBands(mean("COPERNICUS/S5P/OFFL/L3_AER_AI", "absorbing_aerosol_index", "aerosol"))
        .clip(geometry)
    )


def reduce_image(
    image: ee.Image,
    districts: ee.FeatureCollection,
    scale: int,
    reducer: ee.Reducer,
) -> dict[int, dict[str, Any]]:
    result = image.reduceRegions(
        collection=districts,
        reducer=reducer,
        scale=scale,
        tileScale=2,
    ).getInfo()
    return {
        int(feature["properties"]["id"]): feature["properties"]
        for feature in result.get("features", [])
    }


def clean(value: Any, digits: int) -> float | None:
    if value is None:
        return None
    number = float(value)
    if math.isnan(number) or math.isinf(number):
        return None
    return round(number, digits)


def pollution_score(row: dict[str, Any]) -> float | None:
    parts: list[tuple[float, float]] = []
    if row.get("no2_mean") is not None:
        parts.append((min(max(row["no2_mean"] / 0.00030, 0), 1), 0.50))
    if row.get("co_mean") is not None:
        parts.append((min(max((row["co_mean"] - 0.015) / 0.04, 0), 1), 0.20))
    if row.get("so2_mean") is not None:
        parts.append((min(max(row["so2_mean"] / 0.00060, 0), 1), 0.15))
    if row.get("aerosol_index_mean") is not None:
        parts.append((min(max((row["aerosol_index_mean"] + 1) / 3, 0), 1), 0.15))
    if not parts:
        return None
    weighted = sum(value * weight for value, weight in parts)
    total_weight = sum(weight for _, weight in parts)
    return round((weighted / total_weight) * 10, 2)


def process_year(year: int, districts: ee.FeatureCollection, district_list: list[dict[str, Any]]):
    geometry = districts.geometry()
    start, _, end_label = date_range(year)
    vegetation_image, builtup_image, sentinel_scenes = sentinel_images(year, geometry)
    temperature_image, landsat_scenes = lst_image(year, geometry)
    atmospheric_image = air_image(year, geometry)

    vegetation = reduce_image(
        vegetation_image,
        districts,
        60,
        ee.Reducer.mean().combine(ee.Reducer.minMax(), sharedInputs=True),
    )
    builtup = reduce_image(
        builtup_image,
        districts,
        60,
        ee.Reducer.mean().combine(ee.Reducer.max(), sharedInputs=True),
    )
    temperature = reduce_image(
        temperature_image,
        districts,
        90,
        ee.Reducer.mean().combine(ee.Reducer.max(), sharedInputs=True),
    )
    air = reduce_image(
        atmospheric_image,
        districts,
        1000,
        ee.Reducer.mean().combine(ee.Reducer.max(), sharedInputs=True),
    )

    rows = []
    for district in district_list:
        district_id = district["id"]
        ndvi = vegetation.get(district_id, {})
        ndbi = builtup.get(district_id, {})
        lst = temperature.get(district_id, {})
        pollution = air.get(district_id, {})
        row = {
            "district_id": district_id,
            "district_name": district["name_th"],
            "year": year,
            "mean_lst": clean(lst.get("lst_mean"), 2),
            "max_lst": clean(lst.get("lst_max"), 2),
            "lst_data_source": f"Landsat 8/9 C2 L2 yearly median {start}/{end_label}",
            "ndvi_mean": clean(ndvi.get("ndvi_mean"), 6),
            "ndvi_min": clean(ndvi.get("ndvi_min"), 6),
            "ndvi_max": clean(ndvi.get("ndvi_max"), 6),
            "green_area_ratio": clean(ndvi.get("green_mean"), 6),
            "low_green_ratio": clean(ndvi.get("low_green_mean"), 6),
            "ndvi_data_source": f"Sentinel-2 SR Harmonized yearly median {start}/{end_label}",
            "ndbi_mean": clean(ndbi.get("ndbi_mean"), 6),
            "ndbi_max": clean(ndbi.get("ndbi_max"), 6),
            "ndbi_data_source": f"Sentinel-2 SR Harmonized yearly median {start}/{end_label}",
            "no2_mean": clean(pollution.get("no2_mean"), 8),
            "no2_max": clean(pollution.get("no2_max"), 8),
            "co_mean": clean(pollution.get("co_mean"), 6),
            "co_max": clean(pollution.get("co_max"), 6),
            "so2_mean": clean(pollution.get("so2_mean"), 8),
            "so2_max": clean(pollution.get("so2_max"), 8),
            "aerosol_index_mean": clean(pollution.get("aerosol_mean"), 4),
            "aerosol_index_max": clean(pollution.get("aerosol_max"), 4),
            "air_quality_source": f"Sentinel-5P OFFL yearly mean {start}/{end_label}",
            "air_quality_note": "Satellite column-density proxy, not ground-station AQI.",
            "scene_count": sentinel_scenes,
            "lst_scene_count": landsat_scenes,
        }
        row["pollution_score"] = pollution_score(row)
        rows.append(row)
    return rows


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--years", default="2018,2024,2025")
    parser.add_argument("--output", required=True)
    args = parser.parse_args()
    years = sorted({int(value.strip()) for value in args.years.split(",") if value.strip()})

    init_gee()
    districts, district_list = load_districts()
    rows = []
    for year in years:
        print(f"Processing verified district snapshot for {year}", flush=True)
        rows.extend(process_year(year, districts, district_list))

    output = {
        "schemaVersion": "district-metrics-snapshot/v1",
        "generatedAt": datetime.now(timezone.utc).isoformat(),
        "methodVersion": "gee-district-snapshot-v1.0.0",
        "years": years,
        "districtCount": len(district_list),
        "rows": rows,
    }
    output_path = ROOT / args.output
    output_path.parent.mkdir(parents=True, exist_ok=True)
    output_path.write_text(json.dumps(output, ensure_ascii=False, indent=2) + "\n", "utf-8")
    print(f"Wrote {len(rows)} rows to {output_path}", flush=True)


if __name__ == "__main__":
    main()
