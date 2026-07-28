# Decision 0002: Sentinel-2 source acceptance and scene-manifest version

Date: 2026-07-28
Status: Accepted

## Context

The Observatory NDVI recipe uses
`COPERNICUS/S2_SR_HARMONIZED` from Google Earth Engine. The Earth Engine
catalog identifies the producer as the European Union, ESA and Copernicus,
documents the harmonization applied after processing baseline 04.00, and
provides B4, B8 and SCL for the NDVI and quality-mask contract.

The Copernicus Sentinel Data Legal Notice allows reproduction, distribution,
public communication, adaptation, modification and combination with other
data. Modified outputs require the notice `Contains modified Copernicus
Sentinel data [Year]`.

## Decision

The source dataset is accepted as `validated`. A reproducible input version is
defined by:

- the Earth Engine collection identifier;
- a fixed Bangkok research envelope, which is not a district boundary;
- explicit season start and end dates;
- the ordered scene identifiers and sensing times returned by Earth Engine;
- a SHA-256 checksum of that canonical scene manifest;
- the observed processing-baseline, MGRS-tile and spacecraft distributions.

The 2025 analysis-year inventory spans 1 March 2025 through 1 March 2026 so the
hot, wet and cross-calendar cool seasons are complete. It contains 359 scenes:
92 hot-season, 153 wet-season and 114 cool-season scenes.

## Publication boundary

This decision validates only the source and its scene manifest. It does not
validate or publish NDVI observations.

The vegetation product remains at `acceptance` until:

1. the canonical district boundary passes its separate license gate;
2. a processing run records both exact dataset-version inputs;
3. valid pixel coverage and scene-count gates pass for every published area;
4. the output carries the modified Copernicus attribution;
5. derived raster assets receive immutable checksums.
