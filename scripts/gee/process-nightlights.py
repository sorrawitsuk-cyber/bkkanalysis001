#!/usr/bin/env python3
"""
Nighttime Lights cache pipeline for Bangkok.

Computes VIIRS DNB annual or monthly composites in Google Earth Engine, exports
one GeoTIFF + WebP preview, embeds district-level statistics in metadata.json,
then uploads everything to Cloudflare R2.

Object layout:
  satellite-cache/nightlights/index.json
  satellite-cache/nightlights/yearly/2024/metadata.json
  satellite-cache/nightlights/yearly/2024/ntl_mean.webp
  satellite-cache/nightlights/monthly/2025-03/metadata.json
"""

import argparse
import io
import json
import logging
import os
import sys
import zipfile
from datetime import datetime
from pathlib import Path
from typing import Optional

import boto3
import ee
import requests
from botocore.exceptions import ClientError
from google.oauth2.service_account import Credentials as SACredentials
from PIL import Image

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger(__name__)

BKK_WEST = 100.329
BKK_SOUTH = 13.494
BKK_EAST = 100.935
BKK_NORTH = 13.956
BKK_BOUNDS = [[BKK_SOUTH, BKK_WEST], [BKK_NORTH, BKK_EAST]]

CACHE_PREFIX = os.environ.get("SATELLITE_CACHE_PREFIX", "satellite-cache")
PRODUCT_PREFIX = f"{CACHE_PREFIX}/nightlights"
SCALE = 750
PREVIEW_DIM = 512
WEBP_QUALITY = 82
MIN_CLOUD_FREE_COVERAGE = 3

ANNUAL_DATASET_V21 = "NOAA/VIIRS/DNB/ANNUAL_V21"
ANNUAL_DATASET_V22 = "NOAA/VIIRS/DNB/ANNUAL_V22"
ANNUAL_DATASET = ANNUAL_DATASET_V22
MONTHLY_DATASET = "NOAA/VIIRS/DNB/MONTHLY_V1/VCMSLCFG"

VIS_PARAMS = {
    "min": 0,
    "max": 80,
    "palette": ["#030712", "#172554", "#2563EB", "#FACC15", "#F97316", "#FFFFFF"],
}

GEE_SCOPES = [
    "https://www.googleapis.com/auth/earthengine",
    "https://www.googleapis.com/auth/devstorage.full_control",
]


def init_gee() -> None:
    sa_json = json.loads(os.environ["GEE_SERVICE_ACCOUNT_JSON"])
    project_id = sa_json.get("project_id") or os.environ.get("GEE_PROJECT_ID", "")
    creds = SACredentials.from_service_account_info(sa_json, scopes=GEE_SCOPES)
    ee.Initialize(credentials=creds, project=project_id)
    log.info("GEE initialized (project=%s)", project_id)


def init_r2():
    account_id = os.environ["R2_ACCOUNT_ID"]
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def r2_object_exists(s3, bucket: str, key: str) -> bool:
    try:
        s3.head_object(Bucket=bucket, Key=key)
        return True
    except ClientError:
        return False


def upload_bytes(s3, bucket: str, key: str, data: bytes, content_type: str) -> None:
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=data,
        ContentType=content_type,
        CacheControl="public, max-age=86400",
    )
    log.info("Uploaded s3://%s/%s (%d bytes)", bucket, key, len(data))


def get_r2_json(s3, bucket: str, key: str) -> Optional[dict]:
    try:
        resp = s3.get_object(Bucket=bucket, Key=key)
        return json.loads(resp["Body"].read())
    except ClientError:
        return None


def download_url(url: str, timeout: int = 300) -> bytes:
    log.info("Downloading %s", url[:96])
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    data = resp.content
    if data[:4] == b"PK\x03\x04":
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            tifs = sorted(n for n in z.namelist() if n.lower().endswith((".tif", ".tiff")))
            if tifs:
                data = z.read(tifs[0])
    return data


def png_bytes_to_webp(png_bytes: bytes) -> bytes:
    img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=WEBP_QUALITY)
    return buf.getvalue()


def load_districts_feature_collection():
    path = Path(__file__).resolve().parents[2] / "src" / "data" / "bkk_districts.json"
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    features = []
    for feature in data["features"]:
        props = feature.get("properties", {})
        features.append(
            ee.Feature(
                ee.Geometry(feature["geometry"]).simplify(250),
                {
                    "id": props.get("id"),
                    "name_th": props.get("name_th"),
                    "name_en": props.get("name_en", ""),
                },
            )
        )
    return ee.FeatureCollection(features)


def monthly_date_range(period: str) -> tuple[int, int, str, str]:
    year, month = map(int, period.split("-"))
    start = f"{year:04d}-{month:02d}-01"
    if month == 12:
        end = f"{year + 1:04d}-01-01"
    else:
        end = f"{year:04d}-{month + 1:02d}-01"
    return year, month, start, end


def annual_dataset_for_year(year: int) -> str:
    if year < 2013:
        raise ValueError("Annual VIIRS nightlights cache supports 2013 or later")
    # V21 temporal extent: 2012–2021. V22 starts from 2022.
    return ANNUAL_DATASET_V21 if year <= 2021 else ANNUAL_DATASET_V22


def build_image(period_type: str, period: str, geometry):
    if period_type == "yearly":
        year = int(period)
        start = f"{year}-01-01"
        end = f"{year + 1}-01-01"
        dataset = annual_dataset_for_year(year)
        collection = ee.ImageCollection(dataset).filterBounds(geometry).filterDate(start, end)
        image_count = collection.size().getInfo()
        image = collection.first().select("average_masked").max(0).rename("value")
        return image, image_count, start, end, dataset, "average_masked"

    _year, _month, start, end = monthly_date_range(period)
    collection = ee.ImageCollection(MONTHLY_DATASET).filterBounds(geometry).filterDate(start, end)
    image_count = collection.size().getInfo()
    image = (
        collection
        .map(lambda img: img.select("avg_rad").max(0).rename("value").updateMask(img.select("cf_cvg").gte(MIN_CLOUD_FREE_COVERAGE)))
        .mean()
        .rename("value")
    )
    return image, image_count, start, end, MONTHLY_DATASET, "avg_rad"


def _latest_period_from_collection(dataset: str, monthly: bool) -> str:
    timestamps = ee.ImageCollection(dataset).aggregate_array("system:time_start").getInfo()
    if not timestamps:
        raise RuntimeError(f"No timestamps found for {dataset}")
    latest = datetime.utcfromtimestamp(max(timestamps) / 1000)
    return latest.strftime("%Y-%m") if monthly else latest.strftime("%Y")


def compute_district_stats(image, districts) -> list[dict]:
    result = image.reduceRegions(
        collection=districts,
        reducer=ee.Reducer.mean().combine(reducer2=ee.Reducer.max(), sharedInputs=True).combine(reducer2=ee.Reducer.count(), sharedInputs=True),
        scale=SCALE,
        tileScale=2,
    ).getInfo()

    rows = []
    for feature in result.get("features", []):
        props = feature.get("properties", {})
        mean = props.get("mean")
        max_value = props.get("max")
        rows.append({
            "district_id": props.get("id"),
            "district_name": props.get("name_th"),
            "ntl_mean": round(float(mean), 3) if mean is not None else None,
            "ntl_max": round(float(max_value), 3) if max_value is not None else None,
            "pixel_count": int(props.get("count") or 0),
        })
    return rows


def export_layer(image, geometry, s3, bucket: str, base_key: str, public_base_url: str, force: bool) -> dict:
    tif_key = f"{base_key}/ntl_mean.tif"
    preview_key = f"{base_key}/ntl_mean.webp"
    clipped = image.clip(geometry)

    tif_ok = False
    if not force and r2_object_exists(s3, bucket, tif_key):
        tif_ok = True
    else:
        tif_url = clipped.getDownloadURL({
            "name": "ntl_mean",
            "scale": SCALE,
            "region": geometry,
            "format": "GEO_TIFF",
            "filePerBand": False,
        })
        upload_bytes(s3, bucket, tif_key, download_url(tif_url), "image/tiff")
        tif_ok = True

    preview_ok = False
    if not force and r2_object_exists(s3, bucket, preview_key):
        preview_ok = True
    else:
        thumb_url = clipped.visualize(**VIS_PARAMS).getThumbURL({
            "dimensions": PREVIEW_DIM,
            "region": geometry,
            "format": "png",
        })
        upload_bytes(s3, bucket, preview_key, png_bytes_to_webp(download_url(thumb_url, timeout=120)), "image/webp")
        preview_ok = True

    base = public_base_url.rstrip("/")
    return {
        "url": f"{base}/{tif_key}" if tif_ok else None,
        "preview_url": f"{base}/{preview_key}" if preview_ok else None,
        "min": VIS_PARAMS["min"],
        "max": VIS_PARAMS["max"],
    }


def build_summary(rows: list[dict]) -> dict:
    values = [row["ntl_mean"] for row in rows if row.get("ntl_mean") is not None]
    if not values:
        return {"averageRadiance": None, "maxRadiance": None, "minRadiance": None, "maxDistrict": None}
    max_row = max((row for row in rows if row.get("ntl_mean") is not None), key=lambda row: row["ntl_mean"])
    return {
        "averageRadiance": round(sum(values) / len(values), 3),
        "maxRadiance": round(max(values), 3),
        "minRadiance": round(min(values), 3),
        "maxDistrict": max_row.get("district_name"),
    }


def update_index(s3, bucket: str, period_type: str, period: str) -> None:
    index_key = f"{PRODUCT_PREFIX}/index.json"
    index = get_r2_json(s3, bucket, index_key) or {
        "latest_month": None,
        "latest_year": None,
        "monthly": [],
        "yearly": [],
    }
    key = "monthly" if period_type == "monthly" else "yearly"
    if period not in index[key]:
        index[key].append(period)
        index[key].sort()
    if index["monthly"]:
        index["latest_month"] = index["monthly"][-1]
    if index["yearly"]:
        index["latest_year"] = index["yearly"][-1]
    upload_bytes(s3, bucket, index_key, json.dumps(index, ensure_ascii=False, indent=2).encode(), "application/json")


def process_period(period_type: str, period: str, s3, bucket: str, public_base_url: str, force: bool) -> None:
    base_key = f"{PRODUCT_PREFIX}/{period_type}/{period}"
    meta_key = f"{base_key}/metadata.json"
    if not force and r2_object_exists(s3, bucket, meta_key):
        log.info("%s/%s already exists; skipping", period_type, period)
        return

    bkk = ee.Geometry.BBox(BKK_WEST, BKK_SOUTH, BKK_EAST, BKK_NORTH)
    districts = load_districts_feature_collection()
    image, image_count, date_start, date_end, source, band = build_image(period_type, period, bkk)
    if image_count < 1:
        raise RuntimeError(f"No VIIRS images found for {period_type}/{period}")

    rows = compute_district_stats(image, districts)
    layer = export_layer(image, bkk, s3, bucket, base_key, public_base_url, force)
    meta = {
        "period": period,
        "type": "monthly" if period_type == "monthly" else "yearly",
        "product": "nightlights",
        "source": source,
        "band": band,
        "date_start": date_start,
        "date_end": date_end,
        "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "image_count": image_count,
        "cloud_filter": MIN_CLOUD_FREE_COVERAGE if period_type == "monthly" else 0,
        "fallback_used": False,
        "bounds": BKK_BOUNDS,
        "status": "ok",
        "layers": {"ntl_mean": layer},
        "district_stats": rows,
        "summary": build_summary(rows),
        "units": "nW/sr/cm²",
    }
    upload_bytes(s3, bucket, meta_key, json.dumps(meta, ensure_ascii=False, indent=2).encode(), "application/json")
    update_index(s3, bucket, period_type, period)


def default_monthly_period() -> str:
    return _latest_period_from_collection(MONTHLY_DATASET, monthly=True)


def main() -> None:
    parser = argparse.ArgumentParser(description="Process VIIRS nighttime lights cache")
    parser.add_argument("--type", choices=["yearly", "monthly"], default="yearly")
    parser.add_argument("--year", help="Target annual year YYYY")
    parser.add_argument("--period", help="Target monthly period YYYY-MM")
    parser.add_argument("--force", action="store_true")
    args = parser.parse_args()

    required_vars = [
        "GEE_SERVICE_ACCOUNT_JSON",
        "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET", "R2_PUBLIC_BASE_URL",
    ]
    missing = [name for name in required_vars if not os.environ.get(name)]
    if missing:
        log.error("Missing required environment variables: %s", ", ".join(missing))
        sys.exit(1)

    init_gee()

    period = args.period if args.type == "monthly" else (args.year or _latest_period_from_collection(ANNUAL_DATASET, monthly=False))
    if args.type == "monthly" and not period:
        period = default_monthly_period()

    s3 = init_r2()
    process_period(
        args.type,
        period,
        s3,
        os.environ["R2_BUCKET"],
        os.environ["R2_PUBLIC_BASE_URL"],
        args.force or os.environ.get("FORCE_REPROCESS", "false").lower() == "true",
    )
    log.info("Done.")


if __name__ == "__main__":
    main()
