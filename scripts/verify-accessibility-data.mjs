import fs from "node:fs/promises";
import path from "node:path";

const input = path.join(
  process.cwd(),
  "src",
  "data",
  "bkk_accessibility.json",
);
const data = JSON.parse(await fs.readFile(input, "utf8"));
const issues = [];
const percentFields = [
  "accessibility_score",
  "inclusive_accessibility_score",
  "area_accessibility_score",
  "inclusive_area_accessibility_score",
  "complete_coverage_pct",
  "inclusive_complete_coverage_pct",
  "area_complete_coverage_pct",
  "inclusive_area_complete_coverage_pct",
];

if (data.districts.length !== 50) {
  issues.push(`Expected 50 districts, received ${data.districts.length}`);
}
if (data.services.length !== data.summary.service_count) {
  issues.push("Service count does not match summary");
}

for (const district of data.districts) {
  for (const field of percentFields) {
    if (!Number.isFinite(district[field]) || district[field] < 0 || district[field] > 100) {
      issues.push(`${district.district_name}: invalid ${field}`);
    }
  }
  if (district.inclusive_accessibility_score > district.accessibility_score + 0.11) {
    issues.push(`${district.district_name}: slow-walking score exceeds standard score`);
  }
  if (Math.abs(district.represented_population - district.population) > 2) {
    issues.push(`${district.district_name}: represented population mismatch`);
  }
  if (
    district.complete_covered_population + district.underserved_population !==
    district.population
  ) {
    issues.push(`${district.district_name}: covered and underserved population mismatch`);
  }

  for (const [category, metrics] of Object.entries(district.categories)) {
    if (metrics.inclusive_coverage_pct > metrics.coverage_pct + 0.11) {
      issues.push(`${district.district_name}/${category}: inclusive population coverage`);
    }
    if (metrics.inclusive_area_coverage_pct > metrics.area_coverage_pct + 0.11) {
      issues.push(`${district.district_name}/${category}: inclusive area coverage`);
    }
  }
}

if (issues.length) {
  console.error(`Accessibility verification failed with ${issues.length} issue(s):`);
  for (const issue of issues) console.error(`- ${issue}`);
  process.exitCode = 1;
} else {
  console.log(
    `Accessibility data verified: ${data.districts.length} districts, ` +
      `${data.services.length} services, ${data.summary.sample_count} sample points, ` +
      `${data.summary.population.toLocaleString("en-US")} registered residents.`,
  );
}
