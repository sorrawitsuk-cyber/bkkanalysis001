#!/usr/bin/env python3
"""
Yearly satellite data processing pipeline for Bangkok.

Computes yearly mean and max NDVI/NDWI/MNDWI/NDBI composites directly from
Sentinel-2 SR Harmonized for the full calendar year (or YTD for the current year).
Exports GeoTIFFs and WebP previews, uploads to Cloudflare R2, and updates index.json.

Usage:
  python scripts/gee/process-yearly.py [--year YYYY] [--force]

Environment variables: same as process-monthly.py.
"""

import argparse
import io
import json
import logging
import os
import sys
import zipfile
from datetime import date, datetime
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

BKK_WEST   = 100.329
BKK_SOUTH  = 13.494
BKK_EAST   = 100.935
BKK_NORTH  = 13.956
BKK_BOUNDS = [[BKK_SOUTH, BKK_WEST], [BKK_NORTH, BKK_EAST]]

CACHE_PREFIX    = os.environ.get("SATELLITE_CACHE_PREFIX", "satellite-cache")
CLOUD_FILTER    = 30
SCALE           = 100
PREVIEW_DIM     = 512
WEBP_QUALITY    = 82

GEE_SCOPES = [
    "https://www.googleapis.com/auth/earthengine",
    "https://www.googleapis.com/auth/devstorage.full_control",
]

VIS_PARAMS: dict[str, dict] = {
    "ndvi_mean": {
        "min": 0.1, "max": 0.8,
        "palette": ["#7F1D1D", "#B45309", "#FACC15", "#84CC16", "#16A34A", "#065F46"],
    },
    "ndvi_max": {
        "min": 0.1, "max": 0.9,
        "palette": ["#7F1D1D", "#B45309", "#FACC15", "#84CC16", "#16A34A", "#065F46"],
    },
    "ndwi_mean": {
        "min": -0.5, "max": 0.5,
        "palette": ["#92400E", "#F7F7F7", "#0369A1"],
    },
    "ndwi_max": {
        "min": -0.3, "max": 0.8,
        "palette": ["#92400E", "#F7F7F7", "#0369A1"],
    },
    "mndwi_mean": {
        "min": -0.5, "max": 0.5,
        "palette": ["#92400E", "#F7F7F7", "#0284C7"],
    },
    "ndbi_mean": {
        "min": -0.5, "max": 0.5,
        "palette": ["#065F46", "#F7F7F7", "#7F1D1D"],
    },
}


# ---------------------------------------------------------------------------
# Shared helpers (duplicated from process-monthly to keep scripts self-contained)
# ---------------------------------------------------------------------------

def init_gee() -> None:
    sa_json    = json.loads(os.environ["GEE_SERVICE_ACCOUNT_JSON"])
    project_id = sa_json.get("project_id") or os.environ.get("GEE_PROJECT_ID", "")
    creds      = SACredentials.from_service_account_info(sa_json, scopes=GEE_SCOPES)
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
    log.info("Uploaded  s3://%s/%s  (%d bytes)", bucket, key, len(data))


def get_r2_json(s3, bucket: str, key: str) -> Optional[dict]:
    try:
        resp = s3.get_object(Bucket=bucket, Key=key)
        return json.loads(resp["Body"].read())
    except ClientError:
        return None


def download_url(url: str, timeout: int = 300) -> bytes:
    log.info("Downloading %s", url[:80])
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    data = resp.content
    if data[:4] == b"PK\x03\x04":
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            tifs = sorted(n for n in z.namelist() if n.lower().endswith((".tif", ".tiff")))
            if tifs:
                data = z.read(tifs[0])
    return data


def png_bytes_to_webp(png_bytes: bytes, quality: int = WEBP_QUALITY) -> bytes:
    img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=quality)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# GEE processing
# ---------------------------------------------------------------------------

def mask_sentinel2(image):
    scl = image.select("SCL")
    clear = (
        scl.neq(0).And(scl.neq(1)).And(scl.neq(3))
        .And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10)).And(scl.neq(11))
    )
    return image.updateMask(clear)


def add_indices(image):
    nir   = image.select("B8").divide(10000)
    red   = image.select("B4").divide(10000)
    green = image.select("B3").divide(10000)
    swir  = image.select("B11").divide(10000)

    ndvi  = nir.subtract(red).divide(nir.add(red)).rename("NDVI")
    ndwi  = green.subtract(nir).divide(green.add(nir)).rename("NDWI")
    mndwi = green.subtract(swir).divide(green.add(swir)).rename("MNDWI")
    ndbi  = swir.subtract(nir).divide(swir.add(nir)).rename("NDBI")
    return image.addBands([ndvi, ndwi, mndwi, ndbi])


def get_land_mask(geometry):
    """Return a binary mask: 1 = land, 0 = water (JRC GSW occurrence >= 50%)."""
    return (
        ee.Image("JRC/GSW1_4/GlobalSurfaceWater")
        .select("occurrence")
        .gte(50)
        .Not()
        .unmask(1)
        .clip(geometry)
    )


def compute_yearly_composites(year: int, date_start: str, date_end: str, geometry) -> tuple[dict, int]:
    """Return (composites_dict, scene_count)."""
    collection = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(geometry)
        .filterDate(date_start, date_end)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", CLOUD_FILTER))
        .map(mask_sentinel2)
        .map(add_indices)
    )
    count = collection.size().getInfo()
    log.info("Scene count for %s (%s → %s): %d", year, date_start, date_end, count)

    land = get_land_mask(geometry)
    composites = {
        "ndvi_mean":  collection.select("NDVI").mean().updateMask(land).rename("value"),
        "ndvi_max":   collection.select("NDVI").max().updateMask(land).rename("value"),
        "ndwi_mean":  collection.select("NDWI").mean().rename("value"),
        "ndwi_max":   collection.select("NDWI").max().rename("value"),
        "mndwi_mean": collection.select("MNDWI").mean().rename("value"),
        "ndbi_mean":  collection.select("NDBI").mean().updateMask(land).rename("value"),
    }
    return composites, count


# ---------------------------------------------------------------------------
# Per-layer upload
# ---------------------------------------------------------------------------

def export_layer(
    name: str,
    image,
    geometry,
    s3,
    bucket: str,
    base_key: str,
    public_base_url: str,
    force: bool,
) -> dict:
    vis = VIS_PARAMS.get(name, {"min": -1, "max": 1, "palette": ["red", "white", "green"]})
    clipped = image.clip(geometry)

    tif_key     = f"{base_key}/{name}.tif"
    preview_key = f"{base_key}/{name}.webp"

    tif_ok = False
    if not force and r2_object_exists(s3, bucket, tif_key):
        log.info("GeoTIFF already exists: %s (skip)", tif_key)
        tif_ok = True
    else:
        try:
            tif_url = clipped.getDownloadURL({
                "name": name,
                "scale": SCALE,
                "region": geometry,
                "format": "GEO_TIFF",
                "filePerBand": False,
            })
            tif_data = download_url(tif_url)
            upload_bytes(s3, bucket, tif_key, tif_data, "image/tiff")
            tif_ok = True
        except Exception as exc:
            log.error("GeoTIFF export failed for %s: %s", name, exc)

    preview_ok = False
    if not force and r2_object_exists(s3, bucket, preview_key):
        log.info("Preview already exists: %s (skip)", preview_key)
        preview_ok = True
    else:
        try:
            thumb_url = clipped.visualize(
                min=vis["min"],
                max=vis["max"],
                palette=vis["palette"],
            ).getThumbURL({
                "dimensions": PREVIEW_DIM,
                "region": geometry,
                "format": "png",
            })
            png_data  = download_url(thumb_url, timeout=120)
            webp_data = png_bytes_to_webp(png_data)
            upload_bytes(s3, bucket, preview_key, webp_data, "image/webp")
            preview_ok = True
        except Exception as exc:
            log.error("Preview export failed for %s: %s", name, exc)

    base = public_base_url.rstrip("/")
    return {
        "url":         f"{base}/{tif_key}"     if tif_ok     else None,
        "preview_url": f"{base}/{preview_key}" if preview_ok else None,
        "min":         vis["min"],
        "max":         vis["max"],
    }


# ---------------------------------------------------------------------------
# Index management
# ---------------------------------------------------------------------------

def update_index(s3, bucket: str, year: str) -> None:
    index_key = f"{CACHE_PREFIX}/index.json"
    index = get_r2_json(s3, bucket, index_key) or {
        "latest_month": None,
        "latest_year":  None,
        "monthly":      [],
        "yearly":       [],
    }

    if year not in index["yearly"]:
        index["yearly"].append(year)
        index["yearly"].sort()

    if index["yearly"]:
        index["latest_year"] = index["yearly"][-1]
    if index["monthly"]:
        index["latest_month"] = index["monthly"][-1]

    upload_bytes(
        s3, bucket, index_key,
        json.dumps(index, indent=2).encode(),
        "application/json",
    )
    log.info("index.json updated: latest_year=%s", index.get("latest_year"))


# ---------------------------------------------------------------------------
# Main processing
# ---------------------------------------------------------------------------

def process_year(
    year: int,
    s3,
    bucket: str,
    public_base_url: str,
    force: bool = False,
) -> None:
    today = date.today()
    is_current_year = year == today.year

    date_start = f"{year}-01-01"
    date_end   = today.strftime("%Y-%m-%d") if is_current_year else f"{year}-12-31"
    period_str = str(year)

    meta_key = f"{CACHE_PREFIX}/yearly/{period_str}/metadata.json"

    if not force and r2_object_exists(s3, bucket, meta_key):
        existing = get_r2_json(s3, bucket, meta_key)
        if existing and existing.get("status") not in ("pending", "insufficient_data", "error"):
            log.info("Year %s already processed — skipping (pass --force to override)", period_str)
            return

    log.info("Processing yearly composite for %s (%s → %s)", period_str, date_start, date_end)

    bkk = ee.Geometry.BBox(BKK_WEST, BKK_SOUTH, BKK_EAST, BKK_NORTH)
    composites, image_count = compute_yearly_composites(year, date_start, date_end, bkk)

    if image_count < 1:
        log.error("No usable scenes for year %s — writing 'insufficient_data' metadata", period_str)
        meta = {
            "period":       period_str,
            "type":         "yearly",
            "source":       "COPERNICUS/S2_SR_HARMONIZED",
            "date_start":   date_start,
            "date_end":     date_end,
            "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
            "image_count":  image_count,
            "cloud_filter": CLOUD_FILTER,
            "fallback_used": False,
            "bounds":       BKK_BOUNDS,
            "status":       "insufficient_data",
            "layers":       {},
        }
        upload_bytes(s3, bucket, meta_key, json.dumps(meta, indent=2).encode(), "application/json")
        return

    base_key = f"{CACHE_PREFIX}/yearly/{period_str}"
    layers   = {}

    for name, image in composites.items():
        log.info("Exporting layer: %s", name)
        layers[name] = export_layer(
            name, image, bkk, s3, bucket, base_key, public_base_url, force
        )

    meta = {
        "period":       period_str,
        "type":         "yearly",
        "source":       "COPERNICUS/S2_SR_HARMONIZED",
        "date_start":   date_start,
        "date_end":     date_end,
        "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "image_count":  image_count,
        "cloud_filter": CLOUD_FILTER,
        "fallback_used": False,
        "bounds":       BKK_BOUNDS,
        "status":       "ok",
        "layers":       layers,
    }
    upload_bytes(s3, bucket, meta_key, json.dumps(meta, indent=2).encode(), "application/json")
    log.info("metadata.json written for year %s", period_str)

    update_index(s3, bucket, year=period_str)


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Yearly satellite composite processing")
    parser.add_argument(
        "--year",
        type=int,
        help="Target year YYYY (default: previous year)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Reprocess even if metadata already exists in R2",
    )
    args = parser.parse_args()

    force = args.force or os.environ.get("FORCE_REPROCESS", "false").lower() == "true"
    year  = args.year or (date.today().year - 1)

    log.info("Starting yearly processing | year=%d force=%s", year, force)

    required_vars = [
        "GEE_SERVICE_ACCOUNT_JSON",
        "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY",
        "R2_BUCKET", "R2_PUBLIC_BASE_URL",
    ]
    missing = [v for v in required_vars if not os.environ.get(v)]
    if missing:
        log.error("Missing required environment variables: %s", ", ".join(missing))
        sys.exit(1)

    init_gee()
    s3       = init_r2()
    bucket   = os.environ["R2_BUCKET"]
    base_url = os.environ["R2_PUBLIC_BASE_URL"]

    process_year(year, s3, bucket, base_url, force=force)
    log.info("Done.")


if __name__ == "__main__":
    main()
