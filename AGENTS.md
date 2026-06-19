# Agent Handoff

This document is the primary brief for any future coding agent working on this
repository.

## Product

Bangkok District Analytics is a geospatial operations dashboard for Bangkok. It
combines satellite indicators, public data, population records, rainfall,
complaints, and decision-support scores so users can compare districts and decide
where to investigate next.

Primary users:

- Bangkok officers who need a clear operational starting point.
- Urban analysts comparing districts, years, and spatial patterns.
- Project leads who need exportable, source-aware evidence.

## Current UX Direction

The app should guide users through a workflow:

1. Choose the work to do.
2. Choose area and time.
3. Inspect map, statistics, and table.
4. Read interpretation and limitations.
5. Export or continue to a deeper module.

The home page should stay workflow-first. Do not turn it back into a flat module
catalog. Module cards may remain below the workflow entry points, grouped by
work area.

Plain-language guide pages should read like short articles, not SWOT/checklist
cards. The order should be:

1. What this page tells the user.
2. What the currently displayed data says.
3. How to interpret the value.
4. Where the data comes from.
5. How to use it and what to be careful about.

## Important Files

- `src/app/page.tsx` - home workflow entry and grouped module cards.
- `src/components/ui/ViewTabs.tsx` - shared Map / Stats / Table / Guide tabs.
- `src/components/analysis/PlainLanguageGuide.tsx` - shared article-style
  interpretation view.
- `src/components/map/MapView.tsx` - Traffy point and heatmap view.
- `src/components/gee/DistrictMetricsMapView.tsx` - shared satellite metric map.
- `src/app/api/district-metrics/route.ts` - shared district metric API.
- `src/app/api/gee/tiles/route.ts` and `src/app/api/gee/point/route.ts` - live
  Google Earth Engine raster/pixel endpoints.

## Main Routes

- `/` - workflow-first home page.
- `/decision-support` - multi-source priority scoring for flood and heat work.
- `/district-analysis` - cross-module district profile.
- `/traffy` - complaint dashboard from Traffy data.
- `/heat-island` - land surface temperature.
- `/green-space` - tree cover.
- `/ndvi` - vegetation condition.
- `/urban-expansion` - built-up cover and urban expansion.
- `/land-cover-change` - land-cover transitions.
- `/rainfall` - GPM IMERG rainfall.
- `/flood-risk` - water signal and flood-risk screening.
- `/population` - DOPA population and households.
- `/nighttime-lights` - VIIRS nighttime lights.
- `/air-quality` - satellite air-pollution proxy.
- `/accessibility` - proximity screening for city services.

## Data And Methodology Rules

- Do not change formulas, thresholds, scoring weights, or ranking logic just to
  make UI simpler.
- Do not hide source status, coverage, confidence, or limitations.
- Use terms such as "บ่งชี้", "สัญญาณ", and "ควรตรวจร่วมกับ" for satellite
  analysis. Avoid wording that claims field-level certainty.
- Keep Tree Cover and NDVI conceptually separate:
  - Tree Cover = modeled tree canopy / tree class area.
  - NDVI = vegetation condition and greenness signal.
- LST is land surface temperature, not air temperature or heat index.
- Flood and decision-support pages are screening tools, not official forecasts.
- Air-quality values are satellite proxies, not ground-station AQI.
- Accessibility results are proximity screening, not true routed travel time.

## Development Notes

- The project uses Next.js App Router, TypeScript, Tailwind, Leaflet, Recharts,
  Google Earth Engine, Supabase, BigQuery, and Cloudflare R2 in different parts
  of the stack.
- Prefer local patterns and existing shared components before adding new
  abstractions.
- Keep edits scoped. Several older files have lint debt; do not mix broad lint
  cleanup with feature work unless asked.
- Preserve user or generated files that are already untracked unless explicitly
  asked to remove them.

## Verification

Run focused checks for changed files:

```bash
npx tsc --noEmit
npx eslint src/app/page.tsx src/components/ui/ViewTabs.tsx src/components/analysis/PlainLanguageGuide.tsx
```

When changing a page or shared visual component, run a local dev server and
check the route in a browser:

```bash
npm run dev -- --hostname 127.0.0.1 --port 3000
```

If a route calls live Google Earth Engine APIs, a local environment without GEE
credentials may show 503s for raster endpoints. Treat that as an environment
issue unless the changed code touches credentials, GEE routing, or raster logic.

## Git Hygiene

- Check `git status --short --branch` before editing and before committing.
- Do not stage unrelated untracked ingestion logs or scratch scripts.
- Commit focused changes with a clear message.
