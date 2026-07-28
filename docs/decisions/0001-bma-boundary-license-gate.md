# Decision 0001: BMA district boundary license gate

Date: 2026-07-28
Status: Accepted

## Context

Bangkok Open Data publishes the “พื้นที่เขตปกครอง 50 เขตของกรุงเทพมหานคร”
dataset in KML, ZIP/Shapefile and GML formats. The KML delegates to a WMS
NetworkLink, while the ZIP and GML resources contain the district geometry.

The GML snapshot retrieved on 2026-07-28 has SHA-256
`4aa2e8d1c9d17d45808fc92984dbebd4ff7093e9e1c4c391d4bf22f52bf3eef2`.
Automated QA confirms:

- 50 features with the complete official district-code set `1001–1050`;
- 50 unique Thai names, English names and Observatory area codes;
- source CRS EPSG:32647, transformed bounds inside Bangkok in EPSG:4326;
- no invalid geometries or estimated district overlap;
- maximum relative delta against source `AREA` is approximately 0.000234%.

The dataset metadata still says `License not specified`. The Bangkok Open Data
manual defines that value as an unidentified license, so publication and
redistribution rights cannot be inferred from the “public data” category alone.

## Decision

The geometry passes technical acceptance but fails the license gate.

Until written reuse terms are confirmed:

- do not commit the raw GML or Shapefile;
- do not persist derived official geometry as a runtime artifact;
- do not seed `observatory_dataset_versions` or `observatory_areas`;
- do not promote the dataset or any dependent product to `validated`;
- retain only source URLs, retrieval metadata, checksum and aggregate QA
  evidence.

## Required clarification

Request written confirmation from Bangkok Metropolitan Administration covering:

1. permission to transform and redistribute district geometry;
2. required attribution wording;
3. whether derived tiles, GeoJSON, COG/PMTiles masks and district statistics may
   be published;
4. the authoritative geometry version/date and update cadence;
5. a stable HTTPS source or versioned snapshot URL.

The dataset resource page lists `saraban.sed.gis@bangkok.go.th` as a contact
channel.
