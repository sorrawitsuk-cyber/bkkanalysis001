#!/usr/bin/env python3
"""
Compute yearly Sentinel-5P air-pollution proxy metrics per Bangkok district and
upsert them into Supabase district_statistics.

This intentionally stores district/year summaries in Supabase while the app
loads live raster tiles directly from GEE for sharp map overlays.

Usage:
  python scripts/gee/process-air-pollution.py --year 2024
  python scripts/gee/process-air-pollution.py --years 2019-2026

Environment:
  GEE_SERVICE_ACCOUNT_JSON  JSON string for a GEE service account
  SUPABASE_URL              Supabase project URL
  SUPABASE_SERVICE_KEY      Service-role key for upsert
"""

from __future__ import annotations

import argparse
import json
import math
import os
from datetime import date
from pathlib import Path
from typing import Any

import ee
import requests
from google.oauth2.service_account import Credentials

GEE_SCOPES = ["https://www.googleapis.com/auth/earthengine"]
SCALE = 1000


def parse_years(value: str | None, single_year: int | None) -> list[int]:
    if single_year:
        return [single_year]
    if not value:
        return list(range(2019, date.today().year + 1))
    if "-" in value:
        start, end = value.split("-", 1)
        return list(range(int(start), int(end) + 1))
    return [int(part.strip()) for part in value.split(",") if part.strip()]


def init_gee() -> None:
    raw = os.environ.get("GEE_SERVICE_ACCOUNT_JSON")
    if not raw:
        raise RuntimeError("GEE_SERVICE_ACCOUNT_JSON is required")
    info = json.loads(raw)
    creds = Credentials.from_service_account_info(info, scopes=GEE_SCOPES)
    ee.Initialize(credentials=creds, project=info.get("project_id"))


def supabase_headers() -> dict[str, str]:
    key = os.environ.get("SUPABASE_SERVICE_KEY")
    if not key:
        raise RuntimeError("SUPABASE_SERVICE_KEY is required")
    return {
        "apikey": key,
        "Authorization": f"Bearer {key}",
        "Content-Type": "application/json",
        "Prefer": "resolution=merge-duplicates",
    }


def supabase_url(path: str) -> str:
    base = os.environ.get("SUPABASE_URL")
    if not base:
        raise RuntimeError("SUPABASE_URL is required")
    return f"{base.rstrip('/')}/rest/v1/{path.lstrip('/')}"


def load_supabase_district_ids() -> dict[str, int]:
    res = requests.get(
      supabase_url("districts?select=id,name_th"),
      headers=supabase_headers(),
      timeout=30,
    )
    res.raise_for_status()
    return {row["name_th"]: int(row["id"]) for row in res.json()}


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
                {"name_th": props.get("name_th"), "geo_id": props.get("id")},
            )
        )
    return ee.FeatureCollection(features)


def date_range(year: int) -> tuple[str, str]:
    today = date.today()
    start = f"{year}-01-01"
    end = today.isoformat() if year == today.year else f"{year}-12-31"
    return start, end


def mean_image(collection_id: str, band: str, start: str, end: str, name: str):
    return (
        ee.ImageCollection(collection_id)
        .filterDate(start, end)
        .select(band)
        .mean()
        .rename(name)
    )


def classify(score: float | None) -> str | None:
    if score is None:
        return None
    if score >= 8:
        return "very_high"
    if score >= 6:
        return "high"
    if score >= 4:
        return "moderate"
    if score >= 2:
        return "low"
    return "very_low"


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


def clean_number(value: Any, digits: int) -> float | None:
    if value is None:
        return None
    number = float(value)
    if math.isnan(number) or math.isinf(number):
        return None
    return round(number, digits)


def compute_year(year: int, district_ids: dict[str, int]) -> list[dict[str, Any]]:
    start, end = date_range(year)
    print(f"Processing {year}: {start} to {end}")
    districts = load_districts_feature_collection()

    no2 = mean_image("COPERNICUS/S5P/OFFL/L3_NO2", "tropospheric_NO2_column_number_density", start, end, "no2")
    co = mean_image("COPERNICUS/S5P/OFFL/L3_CO", "CO_column_number_density", start, end, "co")
    so2 = mean_image("COPERNICUS/S5P/OFFL/L3_SO2", "SO2_column_number_density", start, end, "so2")
    aerosol = mean_image("COPERNICUS/S5P/OFFL/L3_AER_AI", "absorbing_aerosol_index", start, end, "aerosol")

    stacked = no2.addBands(co).addBands(so2).addBands(aerosol)
    reducers = ee.Reducer.mean().combine(ee.Reducer.max(), sharedInputs=True)
    result = stacked.reduceRegions(
        collection=districts,
        reducer=reducers,
        scale=SCALE,
        tileScale=2,
    ).getInfo()

    rows: list[dict[str, Any]] = []
    for feature in result.get("features", []):
        props = feature.get("properties", {})
        name = props.get("name_th")
        district_id = district_ids.get(name)
        if not district_id:
            print(f"  skipping district without Supabase id: {name}")
            continue
        row = {
            "district_id": district_id,
            "year": year,
            "no2_mean": clean_number(props.get("no2_mean"), 8),
            "no2_max": clean_number(props.get("no2_max"), 8),
            "co_mean": clean_number(props.get("co_mean"), 6),
            "co_max": clean_number(props.get("co_max"), 6),
            "so2_mean": clean_number(props.get("so2_mean"), 8),
            "so2_max": clean_number(props.get("so2_max"), 8),
            "aerosol_index_mean": clean_number(props.get("aerosol_mean"), 4),
            "aerosol_index_max": clean_number(props.get("aerosol_max"), 4),
            "air_quality_source": "Sentinel-5P OFFL yearly mean via GEE",
            "air_quality_note": "Satellite column-density proxy, not ground-station AQI.",
        }
        score = pollution_score(row)
        row["pollution_score"] = score
        row["pollution_class"] = classify(score)
        rows.append(row)
    return rows


def upsert_rows(rows: list[dict[str, Any]]) -> None:
    if not rows:
        print("No rows to upsert")
        return
    url = supabase_url("district_statistics?on_conflict=district_id,year")
    headers = supabase_headers()
    batch_size = 100
    for index in range(0, len(rows), batch_size):
        batch = rows[index:index + batch_size]
        res = requests.post(url, headers=headers, data=json.dumps(batch), timeout=60)
        if not res.ok:
            print(f"Supabase upsert failed: {res.status_code} {res.text[:500]}")
        res.raise_for_status()
    print(f"Upserted {len(rows)} rows")


def main() -> None:
    parser = argparse.ArgumentParser()
    parser.add_argument("--year", type=int)
    parser.add_argument("--years", type=str)
    args = parser.parse_args()

    years = parse_years(args.years, args.year)
    init_gee()
    district_ids = load_supabase_district_ids()
    for year in years:
        rows = compute_year(year, district_ids)
        upsert_rows(rows)


if __name__ == "__main__":
    main()
