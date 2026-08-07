import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { runNdviSeasonalScenario } from "./products/ndvi-seasonal-core.mjs";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const RECIPE_PATH = resolve(
  ROOT,
  "config/observatory/recipes/ndvi-seasonal-v1.0.0.json",
);
const FIXTURE_PATH = resolve(
  ROOT,
  "fixtures/observatory/ndvi-seasonal-v1.golden.json",
);
const REPORT_PATH = resolve(
  ROOT,
  "reports/observatory/ndvi-seasonal-golden-qa.json",
);

const [recipeRaw, fixtureRaw] = await Promise.all([
  readFile(RECIPE_PATH, "utf8"),
  readFile(FIXTURE_PATH, "utf8"),
]);
const recipe = JSON.parse(recipeRaw);
const fixture = JSON.parse(fixtureRaw);

assert.equal(recipe.schemaVersion, "observatory-product-recipe/v1");
assert.equal(recipe.productId, "vegetation");
assert.equal(recipe.methodVersion, "ndvi-seasonal-v1.0.0");
assert.equal(recipe.executionClass, "offline-batch");
assert.equal(recipe.publication.allowsPublicRequestProcessing, false);
assert.equal(fixture.schemaVersion, "observatory-golden-fixture/v1");

const results = fixture.scenarios.map((scenario) => {
  const actual = runNdviSeasonalScenario(recipe, scenario);
  assertExpected(actual, scenario.expected, scenario.id);
  return {
    scenarioId: scenario.id,
    status: "passed",
    actual,
  };
});

const report = {
  reportSchemaVersion: "observatory-recipe-qa/v1",
  recipe: {
    productId: recipe.productId,
    methodVersion: recipe.methodVersion,
    checksumSha256: sha256(recipeRaw),
  },
  fixture: {
    fixtureId: fixture.fixtureId,
    checksumSha256: sha256(fixtureRaw),
  },
  summary: {
    scenarioCount: results.length,
    passed: results.length,
    failed: 0,
    publishableScenarioCount: results.filter(
      (result) => result.actual.publishable,
    ).length,
  },
  results,
  publicationStatus:
    "algorithm-fixture-field-preflight-and-exhaustive-envelope-qa-passed-boundary-pending",
};

if (process.argv.includes("--write-report")) {
  await mkdir(dirname(REPORT_PATH), { recursive: true });
  await writeFile(REPORT_PATH, `${JSON.stringify(report, null, 2)}\n`, "utf8");
}

console.log(JSON.stringify({
  methodVersion: recipe.methodVersion,
  scenarios: results.length,
  status: "passed",
  publicationStatus: report.publicationStatus,
}));

function assertExpected(actual, expected, scenarioId) {
  assert.equal(
    actual.qualityStatus,
    expected.qualityStatus,
    `${scenarioId} qualityStatus`,
  );
  assert.equal(actual.publishable, expected.publishable, `${scenarioId} publishable`);
  assert.equal(
    actual.validCoverage,
    expected.validCoverage,
    `${scenarioId} validCoverage`,
  );
  assert.equal(actual.sceneCount, expected.sceneCount, `${scenarioId} sceneCount`);
  assert.equal(
    actual.validObservationCount,
    expected.validObservationCount,
    `${scenarioId} validObservationCount`,
  );
  assert.deepEqual(actual.statistics, expected.statistics, `${scenarioId} statistics`);
  assert.deepEqual(actual.blockers, expected.blockers, `${scenarioId} blockers`);
}

function sha256(value) {
  return createHash("sha256")
    .update(value.replace(/\r\n/g, "\n"))
    .digest("hex");
}
