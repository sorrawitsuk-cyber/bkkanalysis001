#!/usr/bin/env python3
"""
Patch existing R2 satellite cache metadata.json files to add district_stats.

This script is FASTER than full reprocess — it skips TIF/WebP re-export and
only runs GEE reduceRegions to compute per-district water_ratio, ndwi_mean,
and mndwi_mean, then patches the metadata.json in R2.

Usage:
  python scripts/gee/patch-district-stats.py [--year YYYY] [--all] [--force]

  --year YYYY   Patch a single year
  --all         Patch all years found in R2 index (default behaviour)
  --force       Overwrite even if district_stats already present

Environment variables: same as process-yearly.py
  GEE_SERVICE_ACCOUNT_JSON, R2_ACCOUNT_ID, R2_ACCESS_KEY_ID,
  R2_SECRET_ACCESS_KEY, R2_BUCKET, R2_PUBLIC_BASE_URL
  SATELLITE_CACHE_PREFIX (default: satellite-cache)
  NEXT_PUBLIC_SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY  (optional, for Supabase upsert)
"""

import argparse
import json
import logging
import os
import sys
from datetime import date, datetime
from pathlib import Path

import boto3
import ee
import requests
from botocore.exceptions import ClientError
from google.oauth2.service_account import Credentials as SACredentials

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s %(levelname)s %(message)s",
    datefmt="%Y-%m-%dT%H:%M:%S",
)
log = logging.getLogger(__name__)

# ── Config ──────────────────────────────────────────────────────────────────

BKK_WEST  = 100.329
BKK_SOUTH = 13.494
BKK_EAST  = 100.935
BKK_NORTH = 13.956

CACHE_PREFIX = os.environ.get("SATELLITE_CACHE_PREFIX", "satellite-cache")
CLOUD_FILTER = 30
SCALE        = 100

GEE_SCOPES = [
    "https://www.googleapis.com/auth/earthengine",
    "https://www.googleapis.com/auth/devstorage.full_control",
]


# ── GEE helpers ─────────────────────────────────────────────────────────────

def init_gee() -> None:
    sa_json    = json.loads(os.environ["GEE_SERVICE_ACCOUNT_JSON"])
    project_id = sa_json.get("project_id") or os.environ.get("GEE_PROJECT_ID", "")
    creds      = SACredentials.from_service_account_info(sa_json, scopes=GEE_SCOPES)
    ee.Initialize(credentials=creds, project=project_id)
    log.info("GEE initialized (project=%s)", project_id)


def mask_sentinel2(image):
    scl = image.select("SCL")
    clear = (
        scl.neq(0).And(scl.neq(1)).And(scl.neq(3))
        .And(scl.neq(8)).And(scl.neq(9)).And(scl.neq(10)).And(scl.neq(11))
    )
    return image.updateMask(clear)


def add_indices(image):
    nir   = image.select("B8").divide(10000)
    green = image.select("B3").divide(10000)
    swir  = image.select("B11").divide(10000)
    ndwi  = green.subtract(nir).divide(green.add(nir)).rename("NDWI")
    mndwi = green.subtract(swir).divide(green.add(swir)).rename("MNDWI")
    return image.addBands([ndwi, mndwi])


def load_districts_feature_collection():
    path = Path(__file__).resolve().parents[2] / "src" / "data" / "bkk_districts.json"
    with path.open(encoding="utf-8") as f:
        data = json.load(f)
    features = []
    for feat in data["features"]:
        props = feat.get("properties", {})
        features.append(
            ee.Feature(
                ee.Geometry(feat["geometry"]).simplify(250),
                {
                    "id":      props.get("id"),
                    "name_th": props.get("name_th"),
                    "name_en": props.get("name_en", ""),
                },
            )
        )
    return ee.FeatureCollection(features)


def compute_district_stats_for_year(year: int) -> list[dict]:
    """Run GEE composite + reduceRegions for a single year. No raster export."""
    today       = date.today()
    date_start  = f"{year}-01-01"
    date_end    = today.strftime("%Y-%m-%d") if year == today.year else f"{year}-12-31"

    collection = (
        ee.ImageCollection("COPERNICUS/S2_SR_HARMONIZED")
        .filterBounds(ee.Geometry.BBox(BKK_WEST, BKK_SOUTH, BKK_EAST, BKK_NORTH))
        .filterDate(date_start, date_end)
        .filter(ee.Filter.lt("CLOUDY_PIXEL_PERCENTAGE", CLOUD_FILTER))
        .map(mask_sentinel2)
        .map(add_indices)
    )

    count = collection.size().getInfo()
    log.info("Year %s: %d scenes (%s → %s)", year, count, date_start, date_end)
    if count < 1:
        log.warning("No scenes for year %s — skipping", year)
        return []

    ndwi_mean  = collection.select("NDWI").mean().rename("ndwi_mean")
    ndwi_max   = collection.select("NDWI").max().rename("ndwi_max")
    mndwi_mean = collection.select("MNDWI").mean().rename("mndwi_mean")
    water_mask = ndwi_mean.gt(0).rename("water_ratio")

    stacked = ndwi_mean.addBands(ndwi_max).addBands(mndwi_mean).addBands(water_mask)
    districts = load_districts_feature_collection()

    result = stacked.reduceRegions(
        collection=districts,
        reducer=ee.Reducer.mean(),
        scale=SCALE,
        tileScale=2,
    ).getInfo()

    rows = []
    for feat in result.get("features", []):
        props = feat.get("properties", {})
        def _f(key):
            v = props.get(key)
            return round(float(v), 4) if v is not None else None
        rows.append({
            "district_id":   props.get("id"),
            "district_name": props.get("name_th"),
            "ndwi_mean":     _f("ndwi_mean"),
            "ndwi_max":      _f("ndwi_max"),
            "mndwi_mean":    _f("mndwi_mean"),
            "water_ratio":   _f("water_ratio"),
        })

    log.info("Year %s: computed district_stats for %d districts", year, len(rows))
    return rows


# ── R2 helpers ───────────────────────────────────────────────────────────────

def init_r2():
    account_id = os.environ["R2_ACCOUNT_ID"]
    return boto3.client(
        "s3",
        endpoint_url=f"https://{account_id}.r2.cloudflarestorage.com",
        aws_access_key_id=os.environ["R2_ACCESS_KEY_ID"],
        aws_secret_access_key=os.environ["R2_SECRET_ACCESS_KEY"],
        region_name="auto",
    )


def get_r2_json(s3, bucket: str, key: str) -> dict | None:
    try:
        resp = s3.get_object(Bucket=bucket, Key=key)
        return json.loads(resp["Body"].read())
    except ClientError:
        return None


def put_r2_json(s3, bucket: str, key: str, data: dict) -> None:
    body = json.dumps(data, indent=2, ensure_ascii=False).encode()
    s3.put_object(
        Bucket=bucket,
        Key=key,
        Body=body,
        ContentType="application/json",
        CacheControl="public, max-age=300",
    )
    log.info("R2 updated: %s (%d bytes)", key, len(body))


# ── Supabase upsert (optional) ───────────────────────────────────────────────

def upsert_supabase(year: int, rows: list[dict]) -> None:
    """Upsert water_ratio into district_statistics via Supabase REST API."""
    base_url = os.environ.get("NEXT_PUBLIC_SUPABASE_URL") or os.environ.get("SUPABASE_URL")
    api_key  = os.environ.get("SUPABASE_SERVICE_ROLE_KEY")
    if not base_url or not api_key:
        log.info("Supabase env vars not set — skipping Supabase upsert")
        return

    records = [
        {
            "district_id":   row["district_id"],
            "district_name": row["district_name"],
            "year":          year,
            "water_ratio":   row["water_ratio"],
        }
        for row in rows
        if row.get("district_id") is not None and row.get("water_ratio") is not None
    ]
    if not records:
        return

    url = f"{base_url.rstrip('/')}/rest/v1/district_statistics"
    headers = {
        "apikey":        api_key,
        "Authorization": f"Bearer {api_key}",
        "Content-Type":  "application/json",
        "Prefer":        "resolution=merge-duplicates",
    }
    resp = requests.post(url, headers=headers, json=records, timeout=30)
    if resp.status_code in (200, 201):
        log.info("Supabase upsert OK: %d rows for year %s", len(records), year)
    else:
        log.warning("Supabase upsert failed: %s — %s", resp.status_code, resp.text[:200])


# ── Core patch logic ─────────────────────────────────────────────────────────

def patch_year(s3, bucket: str, year: int, force: bool) -> bool:
    """Patch metadata.json for a single year. Returns True if patched."""
    meta_key = f"{CACHE_PREFIX}/yearly/{year}/metadata.json"
    meta = get_r2_json(s3, bucket, meta_key)

    if meta is None:
        log.info("Year %s: no metadata.json found in R2 — skipping", year)
        return False

    if meta.get("status") not in ("ok",):
        log.info("Year %s: status=%s — skipping", year, meta.get("status"))
        return False

    existing_stats = meta.get("district_stats") or []
    has_water = any(
        isinstance(r.get("water_ratio"), (int, float)) for r in existing_stats
    )

    if has_water and not force:
        log.info("Year %s: district_stats already present (%d rows) — skipping (use --force to overwrite)", year, len(existing_stats))
        return False

    log.info("Year %s: computing district_stats via GEE...", year)
    rows = compute_district_stats_for_year(year)
    if not rows:
        return False

    meta["district_stats"] = rows
    meta["patched_at"] = datetime.utcnow().strftime("%Y-%m-%dT%H:%M:%SZ")
    put_r2_json(s3, bucket, meta_key, meta)

    upsert_supabase(year, rows)
    return True


# ── Entry point ──────────────────────────────────────────────────────────────

def main() -> None:
    parser = argparse.ArgumentParser(description="Patch R2 metadata.json with district_stats")
    parser.add_argument("--year",  type=int, help="Single year to patch (YYYY)")
    parser.add_argument("--all",   action="store_true", help="Patch all years in R2 index (default)")
    parser.add_argument("--force", action="store_true", help="Overwrite existing district_stats")
    args = parser.parse_args()

    force = args.force or os.environ.get("FORCE_PATCH", "false").lower() == "true"

    required = ["GEE_SERVICE_ACCOUNT_JSON", "R2_ACCOUNT_ID", "R2_ACCESS_KEY_ID", "R2_SECRET_ACCESS_KEY", "R2_BUCKET", "R2_PUBLIC_BASE_URL"]
    missing  = [v for v in required if not os.environ.get(v)]
    if missing:
        log.error("Missing env vars: %s", ", ".join(missing))
        sys.exit(1)

    init_gee()
    s3     = init_r2()
    bucket = os.environ["R2_BUCKET"]

    if args.year:
        years = [args.year]
    else:
        index_key = f"{CACHE_PREFIX}/index.json"
        index = get_r2_json(s3, bucket, index_key) or {}
        years_raw = index.get("yearly", [])
        years = sorted(int(y) for y in years_raw if str(y).isdigit())
        if not years:
            log.warning("No yearly periods found in R2 index — nothing to patch")
            sys.exit(0)

    log.info("Years to patch: %s (force=%s)", years, force)

    patched = 0
    for yr in years:
        try:
            if patch_year(s3, bucket, yr, force):
                patched += 1
        except Exception as exc:
            log.error("Year %s failed: %s", yr, exc)

    log.info("Done. Patched %d / %d years.", patched, len(years))


if __name__ == "__main__":
    main()
