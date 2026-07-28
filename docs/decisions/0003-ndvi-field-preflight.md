# Decision 0003: NDVI field preflight before canonical boundaries

Date: 2026-07-28
Status: Accepted

## Context

The Sentinel-2 source inventory and the offline NDVI recipe are validated, but
the canonical Bangkok district boundary remains blocked by its separate
license gate. A district product cannot be produced or published yet.

The full research envelope contains roughly 70 million 10-metre pixels.
Running exhaustive synchronous reducers across every pixel and all seasonal
scenes is unsuitable for a quick, retryable preflight.

## Decision

Run a deterministic spatial preflight before the canonical-boundary stage:

- use the exact locked Sentinel-2 scene manifest;
- use the recipe B4, B8 and SCL mask without changing thresholds or formula;
- create 5,000 seeded random points in the Bangkok research envelope;
- sample the composite at the native 10-metre analysis scale;
- estimate valid coverage with a 95% Wilson confidence interval;
- pass the preflight only when the confidence interval's lower bound meets the
  75% coverage gate and the scene count meets the recipe gate.

The 2025 preflight passed:

| Season | Scenes | Coverage estimate | 95% lower bound |
| --- | ---: | ---: | ---: |
| Hot | 92 | 99.90% | 99.77% |
| Wet | 153 | 99.70% | 99.51% |
| Cool | 114 | 100.00% | 99.92% |

## Limits

This is screening evidence, not exhaustive field QA. The sample describes the
research envelope, not Bangkok district statistics. It does not create
observations, rankings, rasters or a public product.

The vegetation product remains at `acceptance`. Publication still requires a
validated canonical boundary version, an exhaustive retryable batch, area-level
coverage checks, immutable derived assets and the required Copernicus
attribution.
