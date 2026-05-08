#!/usr/bin/env node
/**
 * scripts/fetch-bkk-subdistricts.mjs
 *
 * Fetch Bangkok sub-district (แขวง) boundaries from OSM Overpass API
 * and save as src/data/bkk_subdistricts.json
 *
 * Run: node scripts/fetch-bkk-subdistricts.mjs
 */

import { readFileSync, writeFileSync } from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, "..");

// ── Load district reference (for parent mapping) ─────────────────────────────
const districts = JSON.parse(readFileSync(join(ROOT, "src/data/bkk_districts.json"), "utf-8"));

// ── Point-in-polygon (ray casting) ───────────────────────────────────────────
function pointInPolygon([px, py], ring) {
  let inside = false;
  for (let i = 0, j = ring.length - 1; i < ring.length; j = i++) {
    const [xi, yi] = ring[i];
    const [xj, yj] = ring[j];
    if ((yi > py) !== (yj > py) && px < ((xj - xi) * (py - yi)) / (yj - yi) + xi) {
      inside = !inside;
    }
  }
  return inside;
}

function findDistrict(point) {
  for (const f of districts.features) {
    const { geometry } = f;
    if (!geometry) continue;
    const ringGroups =
      geometry.type === "Polygon" ? [geometry.coordinates] :
      geometry.type === "MultiPolygon" ? geometry.coordinates : [];
    for (const rings of ringGroups) {
      if (pointInPolygon(point, rings[0])) return f.properties;
    }
  }
  return null;
}

// ── Ring stitching (chain ways end-to-end) ────────────────────────────────────
function stitchRing(wayGeoms) {
  if (!wayGeoms.length) return [];
  const eps = 5e-5;
  const close = (a, b) => Math.abs(a[0] - b[0]) < eps && Math.abs(a[1] - b[1]) < eps;

  let coords = wayGeoms[0].map((n) => [n.lon, n.lat]);
  const remaining = wayGeoms.slice(1).map((g) => g.map((n) => [n.lon, n.lat]));

  let safety = 0;
  while (remaining.length > 0 && safety++ < 500) {
    const tail = coords[coords.length - 1];
    let found = false;
    for (let i = 0; i < remaining.length; i++) {
      const w = remaining[i];
      if (close(w[0], tail)) {
        coords.push(...w.slice(1));
        remaining.splice(i, 1);
        found = true;
        break;
      }
      if (close(w[w.length - 1], tail)) {
        coords.push(...[...w].reverse().slice(1));
        remaining.splice(i, 1);
        found = true;
        break;
      }
    }
    if (!found) break;
  }

  if (coords.length > 0 && !close(coords[0], coords[coords.length - 1])) {
    coords.push(coords[0]);
  }
  return coords;
}

// ── Build GeoJSON geometry from OSM relation ──────────────────────────────────
function buildGeometry(rel) {
  const outer = rel.members.filter((m) => m.type === "way" && m.role === "outer" && m.geometry?.length);
  const inner = rel.members.filter((m) => m.type === "way" && m.role === "inner" && m.geometry?.length);

  if (!outer.length) return null;

  // Group outer ways into separate rings by connected components
  const usedOuter = new Set();
  const outerRings = [];

  while (usedOuter.size < outer.length) {
    const start = outer.find((_, i) => !usedOuter.has(i));
    if (!start) break;
    const group = [];
    for (let i = 0; i < outer.length; i++) {
      if (!usedOuter.has(i)) { group.push(i); usedOuter.add(i); }
    }
    // Simple: use all remaining outer ways in one ring (works for non-multipolygon)
    outerRings.push(stitchRing(group.map((i) => outer[i].geometry)));
  }

  const innerRing = inner.length ? stitchRing(inner.map((m) => m.geometry)) : null;

  const coordinates = [
    ...outerRings.filter((r) => r.length >= 4),
    ...(innerRing && innerRing.length >= 4 ? [innerRing] : []),
  ];

  if (!coordinates.length) return null;

  if (outerRings.length <= 1) {
    return { type: "Polygon", coordinates };
  }
  // Multiple outer rings → MultiPolygon
  return {
    type: "MultiPolygon",
    coordinates: outerRings.filter((r) => r.length >= 4).map((r) => [r]),
  };
}

function ringCentroid(ring) {
  const s = ring.reduce(([ax, ay], [x, y]) => [ax + x, ay + y], [0, 0]);
  return [s[0] / ring.length, s[1] / ring.length];
}

// ── Overpass query ─────────────────────────────────────────────────────────────
async function fetchFromOverpass(query) {
  const BASE = "https://overpass-api.de/api/interpreter";
  const url = `${BASE}?data=${encodeURIComponent(query)}`;
  const resp = await fetch(url, { headers: { "User-Agent": "bkkanalysis001/1.0" } });
  if (!resp.ok) throw new Error(`Overpass ${resp.status}`);
  return resp.json();
}

// Bangkok OSM relation ID = 92277 → Overpass area ID = 3600092277
const query = `
[out:json][timeout:240];
area(3600092277)->.bkk;
(
  rel["admin_level"="8"](area.bkk);
);
out geom;
`;

console.log("Querying Overpass API for Bangkok sub-districts (admin_level=8)...");
const data = await fetchFromOverpass(query);
console.log(`Received ${data.elements.length} relations`);

// ── Build features ────────────────────────────────────────────────────────────
const features = [];

for (const rel of data.elements) {
  if (rel.type !== "relation") continue;

  const geometry = buildGeometry(rel);
  if (!geometry) {
    console.warn(`  Skip ${rel.id} "${rel.tags?.name}" — no geometry`);
    continue;
  }

  const tags = rel.tags || {};
  const name_th = tags["name:th"] || tags["name"] || "";
  const name_en = tags["name:en"] || "";

  const outerRing =
    geometry.type === "Polygon"
      ? geometry.coordinates[0]
      : geometry.coordinates[0][0];
  const c = ringCentroid(outerRing);
  const district = findDistrict(c);

  if (!district) {
    console.warn(`  No parent district for "${name_th}" (centroid ${c[1].toFixed(4)}, ${c[0].toFixed(4)})`);
  }

  features.push({
    type: "Feature",
    properties: {
      id: 0, // assigned after sort
      name_th,
      name_en,
      district_id: district?.id ?? null,
      district_name: district?.name_th ?? null,
      osm_id: rel.id,
    },
    geometry,
  });
}

// Sort by district_id then name_th, assign sequential IDs
features.sort((a, b) => {
  const da = a.properties.district_id ?? 999;
  const db = b.properties.district_id ?? 999;
  if (da !== db) return da - db;
  return a.properties.name_th.localeCompare(b.properties.name_th, "th");
});
features.forEach((f, i) => { f.properties.id = i + 1; });

// ── Save ──────────────────────────────────────────────────────────────────────
const outPath = join(ROOT, "src/data/bkk_subdistricts.json");
writeFileSync(outPath, JSON.stringify({ type: "FeatureCollection", name: "bkk_subdistricts", features }, null, 2), "utf-8");

console.log(`\nSaved ${features.length} sub-districts → ${outPath}`);

const unmatched = features.filter((f) => !f.properties.district_id);
if (unmatched.length) {
  console.warn(`\nWARNING: ${unmatched.length} sub-districts without district_id:`);
  unmatched.forEach((f) => console.warn(`  [${f.properties.osm_id}] ${f.properties.name_th}`));
}

// Print summary by district
const byDistrict = new Map();
for (const f of features) {
  const k = f.properties.district_name ?? "(unmatched)";
  byDistrict.set(k, (byDistrict.get(k) ?? 0) + 1);
}
console.log("\nSub-districts per district (sample):");
[...byDistrict.entries()].slice(0, 10).forEach(([k, v]) => console.log(`  ${k}: ${v}`));
