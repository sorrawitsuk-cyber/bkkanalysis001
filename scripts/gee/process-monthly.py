#!/usr/bin/env python3
"""
Monthly satellite data processing pipeline for Bangkok.

Queries Sentinel-2 SR Harmonized from Google Earth Engine, computes vegetation
and water indices (NDVI, NDWI, MNDWI, NDBI), exports GeoTIFFs and WebP previews,
then uploads everything to Cloudflare R2.

Usage:
  python scripts/gee/process-monthly.py [--period YYYY-MM] [--force]

Environment variables (all required unless noted):
  GEE_SERVICE_ACCOUNT_JSON  Full service account key file content as JSON string
  R2_ACCOUNT_ID             Cloudflare account ID
  R2_ACCESS_KEY_ID          R2 API token (Access Key ID)
  R2_SECRET_ACCESS_KEY      R2 API token (Secret Access Key)
  R2_BUCKET                 R2 bucket name
  R2_PUBLIC_BASE_URL        Public base URL for R2 objects (e.g. https://pub-xxx.r2.dev)
  SATELLITE_CACHE_PREFIX    Object key prefix (default: satellite-cache)
  FORCE_REPROCESS           Set 'true' to reprocess existing periods (default: false)
  GEE_PROJECT_ID            (optional) Override project ID for GEE initialization
"""

import argparse
import calendar
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
from dateutil.relativedelta import relativedelta
from google.oauth2.service_account import Credentials as SACredentials
from PIL import Image

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger(__name__)

# Bangkok bounding box  [W, S, E, N]
BKK_WEST   = 100.329
BKK_SOUTH  = 13.494
BKK_EAST   = 100.935
BKK_NORTH  = 13.956
# Stored as [[S, W], [N, E]] per Leaflet convention
BKK_BOUNDS = [[BKK_SOUTH, BKK_WEST], [BKK_NORTH, BKK_EAST]]

CACHE_PREFIX    = os.environ.get("SATELLITE_CACHE_PREFIX", "satellite-cache")
CLOUD_FILTER    = 30   # max CLOUDY_PIXEL_PERCENTAGE
MIN_IMAGE_COUNT = 3    # minimum images needed for "normal" processing
SCALE           = 100  # metres/pixel for exported GeoTIFFs
PREVIEW_DIM     = 512  # pixel dimension for WebP previews
WEBP_QUALITY    = 82

GEE_SCOPES = [
    "https://www.googleapis.com/auth/earthengine",
    "https://www.googleapis.com/auth/devstorage.full_control",
]

# Visualization parameters for preview generation (min, max, palette)
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
# Initialization helpers
# ---------------------------------------------------------------------------

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


# ---------------------------------------------------------------------------
# R2 helpers
# ---------------------------------------------------------------------------

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
        # Enable public read if the bucket policy allows it
        CacheControl="public, max-age=86400",
    )
    log.info("Uploaded  s3://%s/%s  (%d bytes, %s)", bucket, key, len(data), content_type)


def get_r2_json(s3, bucket: str, key: str) -> Optional[dict]:
    try:
        resp = s3.get_object(Bucket=bucket, Key=key)
        return json.loads(resp["Body"].read())
    except ClientError:
        return None


# ---------------------------------------------------------------------------
# Download helpers
# ---------------------------------------------------------------------------

def download_url(url: str, timeout: int = 300) -> bytes:
    """Download bytes from a URL; auto-extracts GeoTIFF if GEE returns a zip."""
    log.info("Downloading %s", url[:80])
    resp = requests.get(url, timeout=timeout)
    resp.raise_for_status()
    data = resp.content
    # GEE sometimes returns a ZIP even when GEO_TIFF format is requested
    if data[:4] == b"PK\x03\x04":
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            tifs = sorted(n for n in z.namelist() if n.lower().endswith((".tif", ".tiff")))
            if tifs:
                data = z.read(tifs[0])
                log.info("Extracted %s from zip", tifs[0])
    return data


def png_bytes_to_webp(png_bytes: bytes, quality: int = WEBP_QUALITY) -> bytes:
    img = Image.open(io.BytesIO(png_bytes)).convert("RGBA")
    buf = io.BytesIO()
    img.save(buf, "WEBP", quality=quality)
    return buf.getvalue()


# ---------------------------------------------------------------------------
# GEE processing helpers
# ---------------------------------------------------------------------------

def mask_sentinel2(image):
    """Cloud/shadow mask using the SCL (Scene Classification Layer) band."""
    scl = image.select("SCL")
    clear = (
        scl.neq(0)   # NO_DATA
        .And(scl.neq(1))   # SATURATED
        .And(scl.neq(3))   # CLOUD_SHADOW
        .And(scl.neq(8))   # CLOUD_MEDIUM
        .And(scl.neq(9))   # CLOUD_HIGH
        .And(scl.neq(10))  # THIN_CIRRUS
        .And(scl.neq(11))  # SNOW/ICE
    )
    return image.updateMask(clear)


def add_indices(image):
    """Add NDVI, NDWI, MNDWI, NDBI bands to each Sentinel-2 image."""
    nir   = image.select("B8").divide(10000)
    red   = image.select("B4").divide(10000)
    green = image.select("B3").divide(10000)
    swir  = image.select("B11").divide(10000)  # SWIR1 @ 1610 nm

    ndvi  = nir.subtract(red).divide(nir.add(red)).rename("NDVI")
    ndwi  = green.subtract(nir).divide(green.add(nir)).rename("NDWI")
    mndwi = green.subtract(swir).divide(green.add(swir)).rename("MNDWI")
    ndbi  = swir.subtract(nir).divide(swir.add(nir)).rename("NDBI")
    return image.addBands([ndvi, ndwi, mndwi, ndbi])


def build_collection(date_start: str, date_end: str, geometry) -> tuple:
    """Return (collection, image_count) filtered to date range and BKK."""
    col = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(geometry)
        .filterDate(date_start, date_end)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", CLOUD_FILTER))
        .map(mask_sentinel2)
        .map(add_indices)
    )
    count = col.size().getInfo()
    return col, count


def compute_composites(collection) -> dict[str, any]:
    """Return dict of named single-band images for each index/statistic."""
    return {
        "ndvi_mean":  collection.select("NDVI").mean().rename("value"),
        "ndvi_max":   collection.select("NDVI").max().rename("value"),
        "ndwi_mean":  collection.select("NDWI").mean().rename("value"),
        "ndwi_max":   collection.select("NDWI").max().rename("value"),
        "mndwi_mean": collection.select("MNDWI").mean().rename("value"),
        "ndbi_mean":  collection.select("NDBI").mean().rename("value"),
    }


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
    """Download GeoTIFF + preview WebP and upload to R2. Returns layer metadata dict."""
    vis = VIS_PARAMS.get(name, {"min": -1, "max": 1, "palette": ["red", "white", "green"]})
    clipped = image.clip(geometry)

    tif_key     = f"{base_key}/{name}.tif"
    preview_key = f"{base_key}/{name}.webp"

    # --- GeoTIFF ---
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

    # --- Preview WebP ---
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

def update_index(s3, bucket: str, period: str, period_type: str) -> None:
    """Add period to index.json and update latest_month/latest_year."""
    index_key = f"{CACHE_PREFIX}/index.json"
    index = get_r2_json(s3, bucket, index_key) or {
        "latest_month": None,
        "latest_year":  None,
        "monthly":      [],
        "yearly":       [],
    }

    list_key = period_type  # "monthly" or "yearly"
    if period not in index[list_key]:
        index[list_key].append(period)
        index[list_key].sort()

    if index["monthly"]:
        index["latest_month"] = index["monthly"][-1]
    if index["yearly"]:
        index["latest_year"] = index["yearly"][-1]

    upload_bytes(
        s3, bucket, index_key,
        json.dumps(index, indent=2).encode(),
        "application/json",
    )
    log.info("index.json updated: latest_month=%s", index.get("latest_month"))


# ---------------------------------------------------------------------------
# Main processing logic
# ---------------------------------------------------------------------------

def process_period(
    period: str,
    s3,
    bucket: str,
    public_base_url: str,
    force: bool = False,
) -> None:
    year, month = map(int, period.split("-"))
    last_day    = calendar.monthrange(year, month)[1]
    date_start  = f"{year:04d}-{month:02d}-01"
    date_end    = f"{year:04d}-{month:02d}-{last_day:02d}"

    meta_key = f"{CACHE_PREFIX}/monthly/{period}/metadata.json"

    # Skip if already processed (unless forced)
    if not force and r2_object_exists(s3, bucket, meta_key):
        existing = get_r2_json(s3, bucket, meta_key)
        if existing and existing.get("status") not in ("pending", "insufficient_data", "error"):
            log.info("Period %s already processed — skipping (pass --force to override)", period)
            return

    log.info("Processing monthly composite for %s (%s → %s)", period, date_start, date_end)

    bkk = ee.Geometry.BBox(BKK_WEST, BKK_SOUTH, BKK_EAST, BKK_NORTH)
    collection, image_count = build_collection(date_start, date_end, bkk)
    log.info("Scene count (primary range): %d", image_count)

    fallback_used = False
    if image_count < MIN_IMAGE_COUNT:
        log.warning(
            "Only %d scenes found — extending window by ±15 days", image_count
        )
        from datetime import timedelta
        d_start = date(year, month, 1) - timedelta(days=15)
        d_end   = date(year, month, last_day) + timedelta(days=15)
        date_start = str(d_start)
        date_end   = str(d_end)
        collection, image_count = build_collection(date_start, date_end, bkk)
        fallback_used = True
        log.info("Scene count (fallback range): %d", image_count)

    # Write pending metadata if still not enough scenes
    if image_count < 1:
        log.error("No usable scenes for %s — writing 'insufficient_data' metadata", period)
        meta = _build_metadata(
            period, "monthly", date_start, date_end,
            image_count, fallback_used, status="insufficient_data", layers={},
        )
        upload_bytes(s3, bucket, meta_key, json.dumps(meta, indent=2).encode(), "application/json")
        return

    composites = compute_composites(collection)
    base_key   = f"{CACHE_PREFIX}/monthly/{period}"
    layers     = {}

    for name, image in composites.items():
        log.info("Exporting layer: %s", name)
        layers[name] = export_layer(
            name, image, bkk, s3, bucket, base_key, public_base_url, force
        )

    meta = _build_metadata(
        period, "monthly", date_start, date_end,
        image_count, fallback_used, status="ok", layers=layers,
    )
    upload_bytes(s3, bucket, meta_key, json.dumps(meta, indent=2).encode(), "application/json")
    log.info("metadata.json written for %s", period)

    update_index(s3, bucket, period=period, period_type="monthly")


def _build_metadata(
    period: str,
    period_type: str,
    date_start: str,
    date_end: str,
    image_count: int,
    fallback_used: bool,
    status: str,
    layers: dict,
) -> dict:
    return {
        "period":       period,
        "type":         period_type,
        "source":       "COPERNICUS/S2_SR_HARMONIZED",
        "date_start":   date_start,
        "date_end":     date_end,
        "generated_at": datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ"),
        "image_count":  image_count,
        "cloud_filter": CLOUD_FILTER,
        "fallback_used": fallback_used,
        "bounds":       BKK_BOUNDS,
        "status":       status,
        "layers":       layers,
    }


# ---------------------------------------------------------------------------
# Entry point
# ---------------------------------------------------------------------------

def main() -> None:
    parser = argparse.ArgumentParser(description="Monthly satellite composite processing")
    parser.add_argument(
        "--period",
        help="Target period YYYY-MM (default: previous month)",
    )
    parser.add_argument(
        "--force",
        action="store_true",
        help="Reprocess even if metadata already exists in R2",
    )
    args = parser.parse_args()

    force = args.force or os.environ.get("FORCE_REPROCESS", "false").lower() == "true"

    if args.period:
        period = args.period
    else:
        prev   = date.today().replace(day=1) - relativedelta(months=1)
        period = prev.strftime("%Y-%m")

    log.info("Starting monthly processing | period=%s force=%s", period, force)

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
    s3     = init_r2()
    bucket = os.environ["R2_BUCKET"]
    base_url = os.environ["R2_PUBLIC_BASE_URL"]

    process_period(period, s3, bucket, base_url, force=force)
    log.info("Done.")


if __name__ == "__main__":
    main()
