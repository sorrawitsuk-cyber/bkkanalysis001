import fs from "node:fs/promises";
import path from "node:path";
import { parse } from "csv-parse/sync";
import * as turf from "@turf/turf";

const ROOT = process.cwd();
const OUTPUT = path.join(ROOT, "src", "data", "bkk_accessibility.json");
const districts = JSON.parse(
  await fs.readFile(path.join(ROOT, "src", "data", "bkk_districts.json"), "utf8"),
);
const population = JSON.parse(
  await fs.readFile(path.join(ROOT, "src", "data", "bkk_population.json"), "utf8"),
);
const subdistricts = JSON.parse(
  await fs.readFile(path.join(ROOT, "src", "data", "bkk_subdistricts.json"), "utf8"),
);

function closeRing(ring) {
  if (!ring.length) return ring;
  const first = ring[0];
  const last = ring.at(-1);
  if (first[0] === last[0] && first[1] === last[1]) return ring;
  return [...ring, first];
}

for (const feature of subdistricts.features) {
  if (feature.geometry.type === "Polygon") {
    feature.geometry.coordinates = feature.geometry.coordinates.map(closeRing);
  } else if (feature.geometry.type === "MultiPolygon") {
    feature.geometry.coordinates = feature.geometry.coordinates.map((polygon) =>
      polygon.map(closeRing),
    );
  }
}

const WALKING = {
  thresholdMinutes: 15,
  standardSpeedKmh: 5,
  inclusiveSpeedKmh: 4,
  routeDetourFactor: 1.25,
  sampleSpacingKm: 0.25,
};

const SOURCES = [
  {
    key: "health",
    label: "ศูนย์บริการสาธารณสุข",
    dataset: "ข้อมูลศูนย์บริการสาธารณสุข สำนักอนามัย",
    url: "https://data.bangkok.go.th/dataset/b5974a39-b3c6-4448-aa27-01beb681498a/resource/1d79c024-92b8-4dcc-8f0a-ed6cd7ff96a0/download/hdplacemay1469.csv",
    name: (row) => row.HCName,
    lat: (row) => row.Latitude,
    lng: (row) => row.longitude,
  },
  {
    key: "education",
    label: "โรงเรียนสังกัดกรุงเทพมหานคร",
    dataset: "สถานที่ตั้งโรงเรียนสังกัดกรุงเทพมหานคร ปีการศึกษา 2566",
    url: "https://data.bangkok.go.th/dataset/59530916-28b0-445e-9206-da873c46ce63/resource/941d0edf-3859-43ec-89be-9d5cd5a5b815/download/address2566.csv",
    name: (row) => `โรงเรียน กทม. ${row.School_ID}`,
    lat: (row) => row.Latitude,
    lng: (row) => row.Longitude,
  },
  {
    key: "food",
    label: "ตลาด",
    dataset: "ที่ตั้งตลาดในเขตกรุงเทพมหานคร",
    url: "https://data.bangkok.go.th/dataset/f80be4f7-ec22-4d6c-b55f-35f83e123ce1/resource/e231ce43-6b09-4212-ad67-cefe3d60d930/download/market.csv",
    name: (row) => row.name,
    lat: (row) => row.latitude,
    lng: (row) => row.longitude,
  },
  {
    key: "recreation",
    subtype: "park",
    label: "สวนสาธารณะ",
    dataset: "ที่ตั้งสวนสาธารณะในความรับผิดชอบของสำนักงานสวนสาธารณะ",
    url: "https://data.bangkok.go.th/dataset/88c4b42a-a6cb-48c7-af7f-b9e7b11582cc/resource/c3877d89-81b3-4285-a508-2e5af1f889eb/download/public_park.csv",
    name: (row) => row.park_name,
    lat: (row) => row.lat,
    lng: (row) => row.lng,
  },
  {
    key: "recreation",
    subtype: "library",
    label: "ห้องสมุด",
    dataset: "ที่ตั้งห้องสมุดเพื่อการเรียนรู้",
    url: "https://data.bangkok.go.th/dataset/378f6fee-9fa7-435e-a19f-f48ec5d76d20/resource/da33e022-6f8f-4d05-88d1-0aa2da7fda8f/download/bma_library.csv",
    name: (row) => row.name,
    lat: (row) => row.lat,
    lng: (row) => row.lng,
  },
  {
    key: "recreation",
    subtype: "sport",
    label: "ศูนย์กีฬา",
    dataset: "ที่ตั้งศูนย์และโรงเรียนฝึกกีฬาสังกัดกรุงเทพมหานคร",
    url: "https://data.bangkok.go.th/dataset/af22ccd1-a6e2-4fe1-962e-2d5042813c75/resource/55abedf3-df47-4bc3-adcf-b93d664e25c8/download/sport.csv",
    name: (row) => row.name,
    lat: (row) => row.lat,
    lng: (row) => row.lng,
  },
  {
    key: "transit",
    subtype: "bts",
    label: "สถานี BTS",
    dataset: "สถานีรถไฟฟ้าลอยฟ้า BTS ในพื้นที่กรุงเทพมหานคร",
    url: "https://data.bangkok.go.th/dataset/d77b2c5e-657b-49e2-82ee-2ed56d0c4aac/resource/934eb701-8fd9-4e9a-9e42-caafae0670d2/download/bts_station.csv",
    name: (row) => row.name,
    lat: (row) => row.lat,
    lng: (row) => row.lng,
  },
  {
    key: "transit",
    subtype: "mrt",
    label: "สถานี MRT",
    dataset: "สถานีรถไฟฟ้ามหานคร MRT ในพื้นที่กรุงเทพมหานคร",
    url: "https://data.bangkok.go.th/dataset/4ccb0c5a-7194-4dc0-942e-b181b2d8b7ca/resource/f6f76b02-e318-4cd3-9fd8-8c1443fee311/download/mrt_station.csv",
    name: (row) => row.name,
    lat: (row) => row.lat,
    lng: (row) => row.lng,
  },
];

function cleanNumber(value) {
  const number = Number(String(value ?? "").replace(/,/g, "").trim());
  return Number.isFinite(number) ? number : null;
}

function inBangkok(lat, lng) {
  return lat !== null && lng !== null && lat >= 13.45 && lat <= 14.05 && lng >= 100.3 && lng <= 100.95;
}

function districtForPoint(point) {
  for (const feature of districts.features) {
    if (turf.booleanPointInPolygon(point, feature)) return feature;
  }
  return null;
}

function percentile(values, p) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const index = Math.min(sorted.length - 1, Math.max(0, Math.round((sorted.length - 1) * p)));
  return sorted[index];
}

function weightedPercentile(items, p) {
  const valid = items
    .filter(({ value, weight }) => Number.isFinite(value) && Number.isFinite(weight) && weight > 0)
    .sort((a, b) => a.value - b.value);
  if (!valid.length) return null;
  const totalWeight = valid.reduce((sum, item) => sum + item.weight, 0);
  const target = totalWeight * p;
  let cumulative = 0;
  for (const item of valid) {
    cumulative += item.weight;
    if (cumulative >= target) return item.value;
  }
  return valid.at(-1).value;
}

function round(value, digits = 1) {
  if (value === null || !Number.isFinite(value)) return null;
  const factor = 10 ** digits;
  return Math.round(value * factor) / factor;
}

function nearestMinutes(origin, candidates, speedKmh) {
  if (!candidates.length) return null;
  let nearestKm = Infinity;
  for (const candidate of candidates) {
    const distance = turf.distance(origin, candidate.point, { units: "kilometers" });
    if (distance < nearestKm) nearestKm = distance;
  }
  return (nearestKm * WALKING.routeDetourFactor / speedKmh) * 60;
}

const services = [];
const sourceMetadata = [];

for (const source of SOURCES) {
  const response = await fetch(source.url);
  if (!response.ok) throw new Error(`${source.key}: HTTP ${response.status}`);
  const text = new TextDecoder("utf-8").decode(await response.arrayBuffer()).replace(/^\uFEFF/, "");
  const rows = parse(text, {
    columns: true,
    skip_empty_lines: true,
    relax_column_count: true,
    relax_quotes: true,
    trim: true,
  });
  let accepted = 0;
  let rejected = 0;
  for (const row of rows) {
    const lat = cleanNumber(source.lat(row));
    const lng = cleanNumber(source.lng(row));
    if (!inBangkok(lat, lng)) {
      rejected += 1;
      continue;
    }
    const point = turf.point([lng, lat]);
    const district = districtForPoint(point);
    services.push({
      id: `${source.key}-${source.subtype ?? source.key}-${services.length + 1}`,
      category: source.key,
      subtype: source.subtype ?? source.key,
      name: String(source.name(row) || source.label).trim(),
      lat,
      lng,
      district_id: district?.properties?.id ?? null,
      district_name: district?.properties?.name_th ?? null,
      source: source.dataset,
    });
    accepted += 1;
  }
  sourceMetadata.push({
    key: source.key,
    subtype: source.subtype ?? source.key,
    label: source.label,
    dataset: source.dataset,
    url: source.url,
    downloaded_at: new Date().toISOString(),
    rows_received: rows.length,
    rows_accepted: accepted,
    rows_rejected: rejected,
  });
}

const dedupedServices = Array.from(
  new Map(
    services.map((service) => [
      `${service.category}|${service.subtype}|${service.lat.toFixed(5)}|${service.lng.toFixed(5)}`,
      service,
    ]),
  ).values(),
);

const categories = ["health", "education", "food", "recreation", "transit"];
const servicesByCategory = Object.fromEntries(
  categories.map((category) => [
    category,
    dedupedServices
      .filter((service) => service.category === category)
      .map((service) => ({ ...service, point: turf.point([service.lng, service.lat]) })),
  ]),
);

const latestPopulation = new Map();
const latestSubdistrictPopulation = new Map();
for (const subdistrict of population.subdistricts) {
  const record = subdistrict.records.find((item) => item.year === population.metadata.max_year);
  latestSubdistrictPopulation.set(subdistrict.id, record?.population ?? 0);
  latestPopulation.set(
    subdistrict.district_id,
    (latestPopulation.get(subdistrict.district_id) ?? 0) + (record?.population ?? 0),
  );
}

const districtRows = [];
let totalSampleCount = 0;

for (const feature of districts.features) {
  const grid = turf.pointGrid(turf.bbox(feature), WALKING.sampleSpacingKm, {
    units: "kilometers",
    mask: feature,
  });
  if (!grid.features.length) grid.features.push(turf.centroid(feature));
  totalSampleCount += grid.features.length;

  const localSubdistricts = subdistricts.features.filter(
    (subdistrict) => subdistrict.properties.district_id === feature.properties.id,
  );
  const samplesBySubdistrict = new Map();
  const preparedSamples = grid.features.map((sample) => {
    const subdistrict = localSubdistricts.find((candidate) =>
      turf.booleanPointInPolygon(sample, candidate),
    );
    const subdistrictId = subdistrict?.properties?.id ?? null;
    if (subdistrictId !== null) {
      samplesBySubdistrict.set(
        subdistrictId,
        (samplesBySubdistrict.get(subdistrictId) ?? 0) + 1,
      );
    }
    return { sample, subdistrictId };
  });

  const sampleResults = preparedSamples.map(({ sample, subdistrictId }) => {
    const result = {};
    for (const category of categories) {
      const standard = nearestMinutes(sample, servicesByCategory[category], WALKING.standardSpeedKmh);
      const inclusive = nearestMinutes(sample, servicesByCategory[category], WALKING.inclusiveSpeedKmh);
      result[category] = { standard, inclusive };
    }
    const subdistrictPopulation = latestSubdistrictPopulation.get(subdistrictId) ?? 0;
    const sampleCount = samplesBySubdistrict.get(subdistrictId) ?? 0;
    return {
      sample,
      result,
      populationWeight: sampleCount ? subdistrictPopulation / sampleCount : 0,
    };
  });

  const districtPopulation = latestPopulation.get(feature.properties.id) ?? 0;
  const representedPopulation = sampleResults.reduce(
    (sum, sample) => sum + sample.populationWeight,
    0,
  );
  const categoryMetrics = {};
  for (const category of categories) {
    const standardTimes = sampleResults
      .map(({ result }) => result[category].standard)
      .filter((value) => value !== null);
    const inclusiveTimes = sampleResults
      .map(({ result }) => result[category].inclusive)
      .filter((value) => value !== null);
    const weightedStandardTimes = sampleResults.map(({ result, populationWeight }) => ({
      value: result[category].standard,
      weight: populationWeight,
    }));
    const weightedInclusiveTimes = sampleResults.map(({ result, populationWeight }) => ({
      value: result[category].inclusive,
      weight: populationWeight,
    }));
    const standardCoveredPopulation = weightedStandardTimes
      .filter(({ value }) => value !== null && value <= WALKING.thresholdMinutes)
      .reduce((sum, item) => sum + item.weight, 0);
    const inclusiveCoveredPopulation = weightedInclusiveTimes
      .filter(({ value }) => value !== null && value <= WALKING.thresholdMinutes)
      .reduce((sum, item) => sum + item.weight, 0);
    categoryMetrics[category] = {
      coverage_pct: round(
        representedPopulation
          ? (standardCoveredPopulation / representedPopulation) * 100
          : 0,
      ),
      inclusive_coverage_pct: round(
        representedPopulation
          ? (inclusiveCoveredPopulation / representedPopulation) * 100
          : 0,
      ),
      area_coverage_pct: round(
        (standardTimes.filter((value) => value <= WALKING.thresholdMinutes).length / standardTimes.length) * 100,
      ),
      inclusive_area_coverage_pct: round(
        (inclusiveTimes.filter((value) => value <= WALKING.thresholdMinutes).length / inclusiveTimes.length) * 100,
      ),
      median_minutes: round(weightedPercentile(weightedStandardTimes, 0.5)),
      p90_minutes: round(weightedPercentile(weightedStandardTimes, 0.9)),
      area_median_minutes: round(percentile(standardTimes, 0.5)),
      area_p90_minutes: round(percentile(standardTimes, 0.9)),
      covered_population: Math.round(standardCoveredPopulation),
      inclusive_covered_population: Math.round(inclusiveCoveredPopulation),
      service_count: dedupedServices.filter(
        (service) => service.category === category && service.district_id === feature.properties.id,
      ).length,
    };
  }

  const completeSamples = sampleResults.filter(({ result }) =>
    categories.every((category) => (result[category].standard ?? Infinity) <= WALKING.thresholdMinutes),
  );
  const inclusiveCompleteSamples = sampleResults.filter(({ result }) =>
    categories.every((category) => (result[category].inclusive ?? Infinity) <= WALKING.thresholdMinutes),
  );
  const completeCoveredPopulation = completeSamples.reduce(
    (sum, sample) => sum + sample.populationWeight,
    0,
  );
  const inclusiveCompleteCoveredPopulation = inclusiveCompleteSamples.reduce(
    (sum, sample) => sum + sample.populationWeight,
    0,
  );
  const accessibilityScore =
    categories.reduce((sum, category) => sum + categoryMetrics[category].coverage_pct, 0) / categories.length;
  const inclusiveAccessibilityScore =
    categories.reduce((sum, category) => sum + categoryMetrics[category].inclusive_coverage_pct, 0) / categories.length;
  const areaAccessibilityScore =
    categories.reduce((sum, category) => sum + categoryMetrics[category].area_coverage_pct, 0) / categories.length;
  const inclusiveAreaAccessibilityScore =
    categories.reduce((sum, category) => sum + categoryMetrics[category].inclusive_area_coverage_pct, 0) / categories.length;
  const localServices = dedupedServices.filter((service) => service.district_id === feature.properties.id).length;

  districtRows.push({
    district_id: feature.properties.id,
    district_name: feature.properties.name_th,
    population: districtPopulation,
    sample_count: sampleResults.length,
    service_count: localServices,
    services_per_10000: districtPopulation ? round((localServices / districtPopulation) * 10000, 2) : null,
    accessibility_score: round(accessibilityScore),
    inclusive_accessibility_score: round(inclusiveAccessibilityScore),
    area_accessibility_score: round(areaAccessibilityScore),
    inclusive_area_accessibility_score: round(inclusiveAreaAccessibilityScore),
    complete_coverage_pct: round(
      representedPopulation
        ? (completeCoveredPopulation / representedPopulation) * 100
        : 0,
    ),
    inclusive_complete_coverage_pct: round(
      representedPopulation
        ? (inclusiveCompleteCoveredPopulation / representedPopulation) * 100
        : 0,
    ),
    area_complete_coverage_pct: round(
      (completeSamples.length / sampleResults.length) * 100,
    ),
    inclusive_area_complete_coverage_pct: round(
      (inclusiveCompleteSamples.length / sampleResults.length) * 100,
    ),
    complete_covered_population: Math.round(completeCoveredPopulation),
    underserved_population: Math.max(0, Math.round(districtPopulation - completeCoveredPopulation)),
    represented_population: Math.round(representedPopulation),
    categories: categoryMetrics,
  });

}

districtRows.sort((a, b) => b.accessibility_score - a.accessibility_score);
districtRows.forEach((row, index) => {
  row.rank = index + 1;
});

const totalPopulation = districtRows.reduce((sum, row) => sum + row.population, 0);
const totalCompleteCoveredPopulation = districtRows.reduce(
  (sum, row) => sum + row.complete_covered_population,
  0,
);
const weightedAverage = (key) =>
  totalPopulation
    ? districtRows.reduce((sum, row) => sum + row[key] * row.population, 0) / totalPopulation
    : 0;

const summary = {
  district_count: districtRows.length,
  service_count: dedupedServices.length,
  sample_count: totalSampleCount,
  population: totalPopulation,
  average_accessibility_score: round(weightedAverage("accessibility_score")),
  inclusive_average_accessibility_score: round(weightedAverage("inclusive_accessibility_score")),
  average_area_accessibility_score: round(
    districtRows.reduce((sum, row) => sum + row.area_accessibility_score, 0) / districtRows.length,
  ),
  average_complete_coverage_pct: round(
    totalPopulation ? (totalCompleteCoveredPopulation / totalPopulation) * 100 : 0,
  ),
  average_area_complete_coverage_pct: round(
    districtRows.reduce((sum, row) => sum + row.area_complete_coverage_pct, 0) / districtRows.length,
  ),
  complete_covered_population: totalCompleteCoveredPopulation,
  underserved_population: Math.max(0, totalPopulation - totalCompleteCoveredPopulation),
  lowest_district: districtRows.at(-1)?.district_name ?? null,
  highest_district: districtRows[0]?.district_name ?? null,
  category_totals: Object.fromEntries(
    categories.map((category) => [category, servicesByCategory[category].length]),
  ),
};

await fs.writeFile(
  OUTPUT,
  JSON.stringify(
    {
      metadata: {
        generated_at: new Date().toISOString(),
        title: "Bangkok 15-minute city proximity screening",
        methodology: {
          threshold_minutes: WALKING.thresholdMinutes,
          standard_speed_kmh: WALKING.standardSpeedKmh,
          inclusive_speed_kmh: WALKING.inclusiveSpeedKmh,
          route_detour_factor: WALKING.routeDetourFactor,
          sample_spacing_km: WALKING.sampleSpacingKm,
          coverage_basis:
            "Population coverage distributes each subdistrict's DOPA registered population evenly across its 250 m sample points. Area coverage gives every sample point equal weight.",
          categories,
          interpretation:
            "Population-weighted and area-based proximity screening from regularly spaced sample points. Distances are geodesic distances multiplied by a route-detour factor; they are not pedestrian-network travel times.",
        },
        population_year: population.metadata.max_year,
        population_source: population.metadata.population_source,
        boundary_source: population.metadata.boundary_source,
        sources: sourceMetadata,
      },
      summary,
      districts: districtRows,
      services: dedupedServices,
    },
    null,
    2,
  ),
  "utf8",
);

console.log(`Wrote ${OUTPUT}`);
console.log(JSON.stringify(summary, null, 2));
