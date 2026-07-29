# Decision 0004: Durable checkpoints for exhaustive NDVI QA

Date: 2026-07-29
Status: Accepted

## Context

The deterministic NDVI field preflight passed, but it is still sample-based.
Exhaustive native-grid coverage QA across the complete research envelope is too
large for one synchronous request and must be retryable without repeating
successful work.

Earth Engine, Supabase and R2 credentials are available. This QA stage produces
metrics only, so storing raster objects in R2 would add artifacts without
improving the coverage decision.

## Decision

Split the research envelope into a 4 by 4 non-overlapping grid and process the
hot, wet and cool seasons independently. This creates 48 jobs.

Use `observatory_processing_tiles` as the internal checkpoint store:

- workers claim one queued job atomically with `FOR UPDATE SKIP LOCKED`;
- each job may be attempted at most three times;
- successful metrics and their SHA-256 checksum are preserved;
- failed jobs require an explicit retry action;
- rerunning the queue command never overwrites successful checkpoints;
- the processing run aggregates coverage only after tile results arrive.

The checkpoint table and claim function are service-role only. Anonymous and
authenticated users receive no table grant or RPC execution permission.

## Publication boundary

Tile statistics are QA diagnostics, not Bangkok district observations. The
workflow creates no public product, observation or raster asset. R2 remains
unused at this stage.

Even after all 48 jobs pass, the vegetation product remains blocked until the
canonical district boundary version is validated and area-level production QA
passes.

## Execution result

Run `de900e87-4d5a-5c77-8a96-c5a4085b622d` completed all 48 jobs with no
failure or retry. Every tile passed its coverage and scene-count gates.

Area-weighted valid coverage across the research envelope was:

- hot season: 99.5393%;
- wet season: 99.4872%;
- cool season: 99.6284%.

All 48 stored metric checksums were verified when producing the final evidence
report. Global NDVI percentiles were intentionally not inferred from tile
percentiles because percentiles are not directly mergeable.
