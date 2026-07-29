import { execFileSync } from "node:child_process";
import { createHash } from "node:crypto";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import ee from "@google/earthengine";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REGISTRY_PATH = resolve(ROOT, "config/observatory/registry.json");
const RECIPE_PATH = resolve(
  ROOT,
  "config/observatory/recipes/ndvi-seasonal-v1.0.0.json",
);
const CITYMAP_INTAKE_PATH = resolve(
  ROOT,
  "reports/observatory/bma-citymap-service-intake.json",
);
const CITYMAP_BOUNDARY_QA_PATH = resolve(
  ROOT,
  "reports/observatory/bma-citymap-boundary-qa.json",
);
const PROVISIONAL_AREAS_PATH = resolve(
  ROOT,
  "src/data/observatory/bkk-districts.provisional.json",
);
const REPORT_PATH = resolve(
  ROOT,
  "reports/observatory/ndvi-2024-2025-district-research.json",
);
const ANALYSIS_YEARS = [2024, 2025];
const BANGKOK_RESEARCH_ENVELOPE = [100.25, 13.35, 101.05, 14.15];
const APPLY = process.argv.includes("--apply");
const WRITE_REPORT = process.argv.includes("--write-report");

dotenv.config({ path: resolve(ROOT, ".env.local"), quiet: true });

const [
  registryRaw,
  recipeRaw,
  cityMapIntakeRaw,
  boundaryQaRaw,
  provisionalAreasRaw,
] = await Promise.all([
  readFile(REGISTRY_PATH, "utf8"),
  readFile(RECIPE_PATH, "utf8"),
  readFile(CITYMAP_INTAKE_PATH, "utf8"),
  readFile(CITYMAP_BOUNDARY_QA_PATH, "utf8"),
  readFile(PROVISIONAL_AREAS_PATH, "utf8"),
]);
const registry = JSON.parse(registryRaw);
const recipe = JSON.parse(recipeRaw);
const cityMapIntake = JSON.parse(cityMapIntakeRaw);
const boundaryQa = JSON.parse(boundaryQaRaw);
const provisionalAreas = JSON.parse(provisionalAreasRaw);
const sentinelDataset = registry.datasets.find(
  (dataset) => dataset.id === recipe.source.datasetId,
);
const cityMapDataset = registry.datasets.find(
  (dataset) => dataset.id === boundaryQa.datasetId,
);
const districtResource = cityMapDataset?.resources?.find(
  (resource) => resource.id === "citymap-district-layer",
);

assertPreconditions();

const periods = ANALYSIS_YEARS.flatMap((year) => [
  {
    analysisYear: year,
    seasonId: "hot",
    start: `${year}-03-01`,
    endExclusive: `${year}-06-01`,
  },
  {
    analysisYear: year,
    seasonId: "wet",
    start: `${year}-06-01`,
    endExclusive: `${year}-11-01`,
  },
  {
    analysisYear: year,
    seasonId: "cool",
    start: `${year}-11-01`,
    endExclusive: `${year + 1}-03-01`,
  },
]);
const plan = {
  mode: APPLY ? "apply" : "plan",
  productId: recipe.productId,
  methodVersion: recipe.methodVersion,
  analysisYears: ANALYSIS_YEARS,
  seasons: ["hot", "wet", "cool"],
  expectedDistrictCount: 50,
  expectedDistrictSeasonRows: 300,
  expectedStatisticRows: 1200,
  sourceDatasetId: sentinelDataset.id,
  boundaryDatasetId: cityMapDataset.id,
  boundaryGeometryPersistence: false,
  publicObservationsCreated: 0,
  rasterAssetsCreated: 0,
};

if (!APPLY) {
  console.log(JSON.stringify({ ...plan, writes: 0 }, null, 2));
  process.exit(0);
}

const startedAt = new Date().toISOString();
const supabase = createServiceClient();
await initializeEarthEngine();

const boundarySource = await fetchCityMapBoundaries();
const mappedBoundaries = mapBoundaryFeatures(boundarySource.geojson);
const boundaryCollection = ee.FeatureCollection(
  mappedBoundaries.map((district) =>
    ee.Feature(district.geometry, {
      area_code: district.areaCode,
      source_district_code: district.sourceDistrictCode,
      name_th: district.nameTh,
      name_en: district.nameEn,
      source_survey_year_buddhist: district.sourceSurveyYearBuddhist,
      area_square_meters: district.areaSquareMeters,
    }),
  ),
);

const sourceManifest = await buildSourceManifest();
const sourceManifestChecksumSha256 = sha256(
  stableStringify(sourceManifest),
);
const sourceVersionLabel =
  `bangkok-seasonal-2024-2025-`
  + sourceManifestChecksumSha256.slice(0, 12);
const codeCommitSha = getCodeCommitSha();
const processingRunId = toUuid(
  sha256(
    [
      recipe.methodVersion,
      sourceManifestChecksumSha256,
      boundaryQa.qa.resultChecksumSha256,
      ANALYSIS_YEARS.join(","),
    ].join(":"),
  ),
);

let runCreated = false;
try {
  const sourceVersion = await upsertSourceDatasetVersion({
    versionLabel: sourceVersionLabel,
    manifestChecksumSha256: sourceManifestChecksumSha256,
    sourceManifest,
    retrievedAt: startedAt,
  });
  const boundaryVersion = await getBoundaryDatasetVersion();
  await upsertResearchAreas(mappedBoundaries, boundaryVersion);
  await upsertProcessingRun({
    processingRunId,
    codeCommitSha,
    sourceVersionLabel,
    sourceManifestChecksumSha256,
    boundaryVersion,
  });
  runCreated = true;
  await upsertRunInputs(
    processingRunId,
    sourceVersion.dataset_version_id,
    boundaryVersion.dataset_version_id,
  );

  const districtSeasonResults = [];
  for (const period of periods) {
    const periodManifest = sourceManifest.periods.find(
      (item) =>
        item.analysisYear === period.analysisYear
        && item.seasonId === period.seasonId,
    );
    console.log(
      `Computing ${period.analysisYear}/${period.seasonId} `
      + `from ${periodManifest.sceneCount} locked scenes...`,
    );
    const results = await processPeriod(period, periodManifest.sceneIds);
    districtSeasonResults.push(...results);
    const accepted = results.filter(
      (item) => item.qualityStatus === "accepted",
    ).length;
    console.log(
      `${period.analysisYear}/${period.seasonId}: `
      + `${accepted}/${results.length} districts accepted`,
    );
  }

  const qa = summarizeQa(districtSeasonResults);
  const resultChecksumSha256 = sha256(
    stableStringify({
      methodVersion: recipe.methodVersion,
      recipeChecksumSha256: sha256(recipeRaw),
      sourceManifestChecksumSha256,
      boundaryResultChecksumSha256:
        boundaryQa.qa.resultChecksumSha256,
      districtSeasonResults,
      qa,
    }),
  );
  const observationRows = toObservationRows({
    districtSeasonResults,
    processingRunId,
    sourceManifestChecksumSha256,
  });

  await upsertResearchObservations(observationRows);
  await completeProcessingRun({
    processingRunId,
    status: qa.status === "passed-research-districts"
      ? "succeeded"
      : "rejected",
    qa,
    resultChecksumSha256,
    observationRowCount: observationRows.length,
  });

  const report = {
    reportSchemaVersion: "observatory-district-research/v1",
    registryVersion: registry.registryVersion,
    productId: recipe.productId,
    methodVersion: recipe.methodVersion,
    createdAt: new Date().toISOString(),
    processingRun: {
      processingRunId,
      codeCommitSha,
      status: qa.status === "passed-research-districts"
        ? "succeeded"
        : "rejected",
      startedAt,
      finishedAt: new Date().toISOString(),
    },
    source: {
      datasetId: sentinelDataset.id,
      collectionId: recipe.source.collectionId,
      versionLabel: sourceVersionLabel,
      manifestChecksumSha256: sourceManifestChecksumSha256,
      observationStart: `${periods[0].start}T00:00:00.000Z`,
      observationEndExclusive:
        `${periods.at(-1).endExclusive}T00:00:00.000Z`,
      periodCount: periods.length,
      sceneCount: sourceManifest.sceneCount,
      attributionTemplate:
        sentinelDataset.license.attributionTemplate,
    },
    boundary: {
      datasetId: cityMapDataset.id,
      serviceVersionLabel: cityMapIntake.version.versionLabel,
      datasetVersionId: boundaryVersion.dataset_version_id,
      qaMethodVersion: boundaryQa.qaMethodVersion,
      qaResultChecksumSha256:
        boundaryQa.qa.resultChecksumSha256,
      sourceResponseChecksumSha256:
        boundaryQa.source.responseChecksumSha256,
      liveResponseChecksumVerified: true,
      featureCount: mappedBoundaries.length,
      surveyYearsBuddhist: [
        ...new Set(
          mappedBoundaries.map(
            (district) => district.sourceSurveyYearBuddhist,
          ),
        ),
      ],
      geometrySentToProcessor: true,
      processor: "Google Earth Engine",
      sourceResponsePersisted: false,
      geometryPersisted: false,
      sourceGeometryPublished: false,
      canonicalPublicBoundary: false,
    },
    recipe: {
      path:
        "config/observatory/recipes/ndvi-seasonal-v1.0.0.json",
      checksumSha256: sha256(recipeRaw),
      comparisonRule: recipe.temporal.comparisonRule,
      nativeScaleMeters: recipe.processing.nativeScaleMeters,
      analysisCrs: recipe.processing.analysisCrs,
    },
    scope: {
      analysisYears: ANALYSIS_YEARS,
      seasons: ["hot", "wet", "cool"],
      districtCount: mappedBoundaries.length,
      districtSeasonRowCount: districtSeasonResults.length,
      statisticRowCount: observationRows.length,
    },
    qa: {
      ...qa,
      resultChecksumSha256,
    },
    periods: summarizePeriods(districtSeasonResults),
    districtSeasonResults,
    database: {
      sourceDatasetVersionId: sourceVersion.dataset_version_id,
      boundaryDatasetVersionId: boundaryVersion.dataset_version_id,
      processingRunId,
      researchAreaRows: mappedBoundaries.length,
      researchObservationRows: observationRows.length,
      publicObservationRowsCreated: 0,
      rasterAssetRowsCreated: 0,
    },
    publication: {
      status: "research-preview-only",
      productPublished: false,
      publicObservationsCreated: false,
      researchObservationsCreated: observationRows.length > 0,
      publicGeometryCreated: false,
      sourceGeometryPublished: false,
      limitations: [
        "ผลลัพธ์เป็นสัญญาณ NDVI ระดับเขตสำหรับ R&D ไม่ใช่การสำรวจภาคสนาม",
        "ขอบเขต CityMap ระบุปีสำรวจ 2561 และยังไม่ใช่ canonical public boundary",
        "เผยแพร่เฉพาะสถิติสรุป ไม่เก็บหรือส่งออก geometry ต้นทาง",
        "ต้องเปรียบเทียบฤดูกาลเดียวกันระหว่างปี",
      ],
    },
  };

  if (WRITE_REPORT) {
    await mkdir(dirname(REPORT_PATH), { recursive: true });
    await writeFile(
      REPORT_PATH,
      `${JSON.stringify(report, null, 2)}\n`,
      "utf8",
    );
  }

  console.log(
    JSON.stringify(
      {
        ...plan,
        result: qa.status,
        processingRunId,
        sourceVersionLabel,
        sourceManifestChecksumSha256,
        resultChecksumSha256,
        districtSeasonRows: districtSeasonResults.length,
        researchObservationRows: observationRows.length,
        reportWritten: WRITE_REPORT,
        geometryPersisted: false,
        publicObservationsCreated: 0,
        blockers: qa.blockers,
      },
      null,
      2,
    ),
  );

  if (qa.status !== "passed-research-districts") {
    process.exitCode = 1;
  }
} catch (error) {
  if (runCreated) {
    await failProcessingRun(processingRunId, error);
  }
  throw error;
}

async function fetchCityMapBoundaries() {
  const queryUrl = new URL(`${districtResource.url}/query`);
  queryUrl.search = new URLSearchParams({
    where: "1=1",
    outFields:
      "OBJECTID,DISTRICT_I,DISTRICT_N,AREA_CAL,AREA_BMA,UPDATE_YEAR,CODE",
    returnGeometry: "true",
    outSR: "4326",
    orderByFields: "DISTRICT_I",
    f: "geojson",
  }).toString();
  const response = await fetch(queryUrl, {
    headers: {
      "User-Agent": "Bangkok-Urban-Earth-Observatory/1.0",
    },
    signal: AbortSignal.timeout(30_000),
  });
  if (!response.ok) {
    throw new Error(
      `CityMap district query returned HTTP ${response.status}`,
    );
  }
  const raw = await response.text();
  const responseChecksumSha256 = sha256(raw);
  if (
    responseChecksumSha256
    !== boundaryQa.source.responseChecksumSha256
  ) {
    throw new Error(
      "CityMap boundary response changed after technical QA; "
      + "run the boundary intake and QA again before processing",
    );
  }
  const geojson = JSON.parse(raw);
  if (
    geojson.type !== "FeatureCollection"
    || geojson.features?.length !== 50
  ) {
    throw new Error("CityMap boundary response is not the reviewed 50 districts");
  }
  return { geojson, responseChecksumSha256 };
}

function mapBoundaryFeatures(geojson) {
  const provisionalByThaiName = new Map(
    provisionalAreas.features.map((feature) => [
      feature.properties.nameTh.trim(),
      feature.properties,
    ]),
  );
  const qaByDistrictCode = new Map(
    boundaryQa.perDistrict.map((district) => [
      district.districtCode,
      district,
    ]),
  );
  const seenAreaCodes = new Set();
  const mapped = geojson.features.map((feature) => {
    const properties = feature.properties ?? {};
    const nameTh = String(properties.DISTRICT_N).trim();
    const sourceDistrictCode = String(properties.DISTRICT_I);
    const provisional = provisionalByThaiName.get(nameTh);
    const qaDistrict = qaByDistrictCode.get(sourceDistrictCode);
    if (!provisional || !qaDistrict) {
      throw new Error(
        `CityMap district ${sourceDistrictCode}/${nameTh} `
        + "does not match reviewed district metadata",
      );
    }
    if (seenAreaCodes.has(provisional.areaCode)) {
      throw new Error(`Duplicate mapped area code ${provisional.areaCode}`);
    }
    seenAreaCodes.add(provisional.areaCode);
    return {
      areaCode: provisional.areaCode,
      sourceDistrictCode,
      nameTh,
      nameEn: provisional.nameEn,
      sourceSurveyYearBuddhist: Number(properties.UPDATE_YEAR),
      areaSquareMeters: qaDistrict.geodesicAreaSquareMeters,
      geometry: feature.geometry,
    };
  });
  if (mapped.length !== 50 || seenAreaCodes.size !== 50) {
    throw new Error("CityMap district mapping is not complete");
  }
  return mapped.sort((left, right) =>
    left.areaCode.localeCompare(right.areaCode),
  );
}

async function buildSourceManifest() {
  const bounds = ee.Geometry.Rectangle(
    BANGKOK_RESEARCH_ENVELOPE,
    null,
    false,
  );
  const periodManifests = [];
  for (const period of periods) {
    const collection = ee
      .ImageCollection(recipe.source.collectionId)
      .filterBounds(bounds)
      .filterDate(period.start, period.endExclusive)
      .sort("system:time_start");
    const inventory = await evaluate(
      ee.Dictionary({
        sceneCount: collection.size(),
        sceneIds: collection.aggregate_array("system:index"),
        sensingTimes: collection.aggregate_array("system:time_start"),
        productIdCount: collection.aggregate_count("PRODUCT_ID"),
      }),
    );
    if (
      inventory.sceneCount < recipe.quality.minSceneCount
      || inventory.sceneIds.length !== inventory.sceneCount
      || inventory.sensingTimes.length !== inventory.sceneCount
      || inventory.productIdCount !== inventory.sceneCount
    ) {
      throw new Error(
        `Sentinel-2 inventory failed for `
        + `${period.analysisYear}/${period.seasonId}`,
      );
    }
    periodManifests.push({
      ...period,
      sceneCount: inventory.sceneCount,
      sceneIds: inventory.sceneIds,
      sensingTimes: inventory.sensingTimes,
    });
  }
  return {
    schemaVersion: "earth-engine-multi-period-scene-manifest/v1",
    datasetId: sentinelDataset.id,
    collectionId: recipe.source.collectionId,
    analysisYears: ANALYSIS_YEARS,
    bounds: BANGKOK_RESEARCH_ENVELOPE,
    periods: periodManifests,
    sceneCount: periodManifests.reduce(
      (sum, period) => sum + period.sceneCount,
      0,
    ),
  };
}

async function processPeriod(period, sceneIds) {
  const collection = ee
    .ImageCollection(recipe.source.collectionId)
    .filterDate(period.start, period.endExclusive)
    .filter(ee.Filter.inList("system:index", sceneIds))
    .sort("system:time_start");
  const collectionWithDistrictSceneCount = boundaryCollection.map(
    (feature) =>
      feature.set(
        "scene_count",
        collection.filterBounds(feature.geometry()).size(),
      ),
  );
  const ndviCollection = collection.map(toMaskedNdvi);
  const composite = ndviCollection.median().rename("NDVI");
  const validMask = composite.mask().rename("valid");
  const pixelArea = ee.Image.pixelArea();
  const validAreaImage = pixelArea
    .updateMask(validMask)
    .rename("valid_area");
  const validObservationCountImage = ndviCollection
    .count()
    .unmask(0)
    .rename("valid_observation_count");
  const reduceOptions = {
    collection: collectionWithDistrictSceneCount,
    scale: recipe.processing.nativeScaleMeters,
    crs: recipe.processing.analysisCrs,
    tileScale: 8,
  };
  const percentileFeatures = composite
    .reduceRegions({
      reducer: ee.Reducer.percentile(
        [10, 25, 50, 75, 90],
        ["p10", "p25", "median", "p75", "p90"],
      ),
      ...reduceOptions,
    })
    .map((feature) => feature.setGeometry(null));
  const validAreaFeatures = validAreaImage
    .reduceRegions({
      reducer: ee.Reducer.sum().setOutputs([
        "valid_area_square_meters",
      ]),
      ...reduceOptions,
    })
    .map((feature) => feature.setGeometry(null));
  const observationCountFeatures = validObservationCountImage
    .reduceRegions({
      reducer: ee.Reducer.sum().setOutputs([
        "valid_observation_count",
      ]),
      ...reduceOptions,
    })
    .map((feature) => feature.setGeometry(null));
  const label = `${period.analysisYear}/${period.seasonId}`;
  const percentileRaw = await evaluateWithRetry(
    percentileFeatures,
    `${label}/percentiles`,
  );
  const validAreaRaw = await evaluateWithRetry(
    validAreaFeatures,
    `${label}/valid-area`,
  );
  const observationCountRaw = await evaluateWithRetry(
    observationCountFeatures,
    `${label}/observation-count`,
  );
  const validAreaByArea = new Map(
    validAreaRaw.features.map((feature) => [
      feature.properties.area_code,
      feature.properties,
    ]),
  );
  const observationCountByArea = new Map(
    observationCountRaw.features.map((feature) => [
      feature.properties.area_code,
      feature.properties,
    ]),
  );
  const results = percentileRaw.features.map((feature) => {
    const properties = feature.properties;
    const validArea = validAreaByArea.get(properties.area_code);
    const observationCount =
      observationCountByArea.get(properties.area_code);
    if (!validArea || !observationCount) {
      throw new Error(
        `Missing area metrics for ${properties.area_code}`,
      );
    }
    const statistics = {
      median: round(properties.median),
      p10: round(properties.p10),
      p90: round(properties.p90),
      interquartileRange: round(
        properties.p75 - properties.p25,
      ),
    };
    const validCoverage = round(
      validArea.valid_area_square_meters
      / properties.area_square_meters,
    );
    const sceneCount = Number(properties.scene_count);
    const validObservationCount = Math.round(
      observationCount.valid_observation_count,
    );
    const blockers = [];
    if (validCoverage < recipe.quality.minValidCoverage) {
      blockers.push(
        `valid coverage ${validCoverage} is below `
        + `${recipe.quality.minValidCoverage}`,
      );
    }
    if (sceneCount < recipe.quality.minSceneCount) {
      blockers.push(
        `scene count ${sceneCount} is below `
        + `${recipe.quality.minSceneCount}`,
      );
    }
    if (validObservationCount < 1) {
      blockers.push("valid observation count is zero");
    }
    if (
      !Number.isFinite(statistics.p10)
      || !Number.isFinite(statistics.median)
      || !Number.isFinite(statistics.p90)
      || !Number.isFinite(statistics.interquartileRange)
    ) {
      blockers.push("one or more NDVI statistics are not finite");
    } else {
      if (
        statistics.p10 > statistics.median
        || statistics.median > statistics.p90
      ) {
        blockers.push("NDVI percentiles are not monotonic");
      }
      if (
        statistics.p10 < -1
        || statistics.p90 > 1
        || statistics.interquartileRange < 0
      ) {
        blockers.push("NDVI statistics fall outside the valid range");
      }
    }
    return {
      areaCode: properties.area_code,
      sourceDistrictCode: properties.source_district_code,
      nameTh: properties.name_th,
      nameEn: properties.name_en,
      analysisYear: period.analysisYear,
      seasonId: period.seasonId,
      periodStart: `${period.start}T00:00:00.000Z`,
      periodEndExclusive:
        `${period.endExclusive}T00:00:00.000Z`,
      sceneCount,
      totalAreaSquareMeters: round(
        properties.area_square_meters,
        3,
      ),
      validAreaSquareMeters: round(
        validArea.valid_area_square_meters,
        3,
      ),
      validCoverage,
      validObservationCount,
      statistics,
      qualityStatus: blockers.length === 0
        ? "accepted"
        : "rejected",
      blockers,
    };
  });
  if (results.length !== 50) {
    throw new Error(
      `${period.analysisYear}/${period.seasonId} returned `
      + `${results.length} districts instead of 50`,
    );
  }
  return results.sort((left, right) =>
    left.areaCode.localeCompare(right.areaCode),
  );
}

function toMaskedNdvi(image) {
  const nir = image
    .select(recipe.source.bands.nir)
    .multiply(recipe.source.reflectanceScaleFactor);
  const red = image
    .select(recipe.source.bands.red)
    .multiply(recipe.source.reflectanceScaleFactor);
  const scl = image.select(recipe.source.bands.quality);
  const [reflectanceMin, reflectanceMax] =
    recipe.quality.reflectanceValidRange;
  const clearMask = recipe.quality.clearSclClasses
    .map((value) => scl.eq(value))
    .reduce((combined, current) => combined.or(current));
  const reflectanceMask = nir
    .gte(reflectanceMin)
    .and(nir.lte(reflectanceMax))
    .and(red.gte(reflectanceMin))
    .and(red.lte(reflectanceMax));
  const denominator = nir.add(red);
  const ndvi = nir.subtract(red).divide(denominator);
  return ndvi
    .updateMask(
      clearMask
        .and(reflectanceMask)
        .and(denominator.neq(0))
        .and(ndvi.gte(-1))
        .and(ndvi.lte(1)),
    )
    .rename("NDVI")
    .copyProperties(image, ["system:index", "system:time_start"]);
}

function summarizeQa(results) {
  const rejected = results.filter(
    (result) => result.qualityStatus === "rejected",
  );
  const blockers = rejected.flatMap((result) =>
    result.blockers.map(
      (blocker) =>
        `${result.analysisYear}/${result.seasonId}/`
        + `${result.areaCode}: ${blocker}`,
    ),
  );
  const expectedKeys = new Set(
    periods.flatMap((period) =>
      mappedBoundaries.map(
        (district) =>
          `${period.analysisYear}:${period.seasonId}:`
          + district.areaCode,
      ),
    ),
  );
  const actualKeys = new Set(
    results.map(
      (result) =>
        `${result.analysisYear}:${result.seasonId}:`
        + result.areaCode,
    ),
  );
  if (
    actualKeys.size !== expectedKeys.size
    || [...expectedKeys].some((key) => !actualKeys.has(key))
  ) {
    blockers.push("district-season result matrix is incomplete");
  }
  return {
    status: blockers.length === 0
      ? "passed-research-districts"
      : "failed",
    expectedDistrictSeasonRows: expectedKeys.size,
    districtSeasonRows: results.length,
    acceptedDistrictSeasonRows:
      results.length - rejected.length,
    rejectedDistrictSeasonRows: rejected.length,
    minValidCoverage: Math.min(
      ...results.map((result) => result.validCoverage),
    ),
    maxValidCoverage: Math.max(
      ...results.map((result) => result.validCoverage),
    ),
    minSceneCount: Math.min(
      ...results.map((result) => result.sceneCount),
    ),
    maxSceneCount: Math.max(
      ...results.map((result) => result.sceneCount),
    ),
    invalidStatisticCount: results.filter(
      (result) =>
        Object.values(result.statistics).some(
          (value) => !Number.isFinite(value),
        ),
    ).length,
    sourceManifestLocked: true,
    boundaryChecksumVerified: true,
    sourceGeometryPersisted: false,
    publicGeometryCreated: false,
    blockers,
  };
}

function summarizePeriods(results) {
  return periods.map((period) => {
    const rows = results.filter(
      (result) =>
        result.analysisYear === period.analysisYear
        && result.seasonId === period.seasonId,
    );
    return {
      analysisYear: period.analysisYear,
      seasonId: period.seasonId,
      periodStart: `${period.start}T00:00:00.000Z`,
      periodEndExclusive:
        `${period.endExclusive}T00:00:00.000Z`,
      districtCount: rows.length,
      acceptedDistrictCount: rows.filter(
        (row) => row.qualityStatus === "accepted",
      ).length,
      minValidCoverage: Math.min(
        ...rows.map((row) => row.validCoverage),
      ),
      maxValidCoverage: Math.max(
        ...rows.map((row) => row.validCoverage),
      ),
      minMedian: Math.min(
        ...rows.map((row) => row.statistics.median),
      ),
      maxMedian: Math.max(
        ...rows.map((row) => row.statistics.median),
      ),
    };
  });
}

function toObservationRows({
  districtSeasonResults,
  processingRunId,
  sourceManifestChecksumSha256,
}) {
  return districtSeasonResults.flatMap((result) => [
    {
      statistic: "median",
      value: result.statistics.median,
    },
    { statistic: "p10", value: result.statistics.p10 },
    { statistic: "p90", value: result.statistics.p90 },
    {
      statistic: "interquartile-range",
      value: result.statistics.interquartileRange,
    },
  ].map((statistic) => ({
    area_code: result.areaCode,
    product_id: recipe.productId,
    analysis_year: result.analysisYear,
    season_id: result.seasonId,
    period_start: result.periodStart,
    period_end: result.periodEndExclusive,
    statistic: statistic.statistic,
    value: statistic.value,
    unit: recipe.outputs?.unit ?? "NDVI",
    valid_coverage: result.validCoverage,
    scene_count: result.sceneCount,
    valid_observation_count: result.validObservationCount,
    processing_run_id: processingRunId,
    source_manifest_checksum_sha256:
      sourceManifestChecksumSha256,
    boundary_result_checksum_sha256:
      boundaryQa.qa.resultChecksumSha256,
    quality_status: result.qualityStatus,
  })));
}

async function upsertSourceDatasetVersion({
  versionLabel,
  manifestChecksumSha256,
  sourceManifest,
  retrievedAt,
}) {
  const row = {
    dataset_id: sentinelDataset.id,
    version_label: versionLabel,
    checksum_sha256: manifestChecksumSha256,
    retrieved_at: retrievedAt,
    observation_start:
      `${periods[0].start}T00:00:00.000Z`,
    observation_end:
      `${periods.at(-1).endExclusive}T00:00:00.000Z`,
    schema_version: sourceManifest.schemaVersion,
    source_snapshot_uri:
      `gee://${recipe.source.collectionId}`
      + `?start=${periods[0].start}`
      + `&end=${periods.at(-1).endExclusive}`
      + `&manifestSha256=${manifestChecksumSha256}`,
    acceptance_status: "validated",
    acceptance_checked_at: retrievedAt,
    notes:
      "Locked multi-period scene manifest for the 2024-2025 "
      + "district research run.",
  };
  const { data, error } = await supabase
    .from("observatory_dataset_versions")
    .upsert(row, {
      onConflict: "dataset_id,version_label,checksum_sha256",
    })
    .select(
      "dataset_version_id,dataset_id,version_label,checksum_sha256,acceptance_status",
    )
    .single();
  if (error) {
    throw new Error(
      `Upsert Sentinel-2 dataset version: ${error.message}`,
    );
  }
  return data;
}

async function getBoundaryDatasetVersion() {
  const { data, error } = await supabase
    .from("observatory_dataset_versions")
    .select(
      "dataset_version_id,dataset_id,version_label,checksum_sha256,acceptance_status",
    )
    .eq("dataset_id", cityMapDataset.id)
    .eq("version_label", cityMapIntake.version.versionLabel)
    .eq(
      "checksum_sha256",
      cityMapIntake.version.manifestChecksumSha256,
    )
    .single();
  if (error) {
    throw new Error(
      `Read CityMap dataset version: ${error.message}`,
    );
  }
  if (data.acceptance_status !== "research") {
    throw new Error("CityMap dataset version must remain research-only");
  }
  return data;
}

async function upsertResearchAreas(districts, boundaryVersion) {
  const rows = districts.map((district) => ({
    area_code: district.areaCode,
    source_district_code: district.sourceDistrictCode,
    name_th: district.nameTh,
    name_en: district.nameEn,
    source_dataset_version_id:
      boundaryVersion.dataset_version_id,
    boundary_result_checksum_sha256:
      boundaryQa.qa.resultChecksumSha256,
    source_survey_year_buddhist:
      district.sourceSurveyYearBuddhist,
    area_square_meters: district.areaSquareMeters,
    acceptance_status: "research",
    updated_at: new Date().toISOString(),
  }));
  const { error } = await supabase
    .from("observatory_research_areas")
    .upsert(rows, { onConflict: "area_code" });
  if (error) {
    throw new Error(`Upsert research areas: ${error.message}`);
  }
}

async function upsertProcessingRun({
  processingRunId,
  codeCommitSha,
  sourceVersionLabel,
  sourceManifestChecksumSha256,
  boundaryVersion,
}) {
  const now = new Date().toISOString();
  const row = {
    processing_run_id: processingRunId,
    product_id: recipe.productId,
    method_version: recipe.methodVersion,
    code_commit_sha: codeCommitSha,
    parameters: {
      executionClass: "offline-district-research",
      analysisYears: ANALYSIS_YEARS,
      seasons: ["hot", "wet", "cool"],
      sourceVersionLabel,
      sourceManifestChecksumSha256,
      boundaryDatasetId: cityMapDataset.id,
      boundaryDatasetVersionId:
        boundaryVersion.dataset_version_id,
      boundaryResultChecksumSha256:
        boundaryQa.qa.resultChecksumSha256,
      boundaryGeometryPolicy: {
        sourceResponsePersisted: false,
        geometryPersisted: false,
        publicGeometryCreated: false,
      },
      publicObservationsCreated: false,
      rasterAssetsCreated: false,
    },
    qa_summary: {
      status: "running",
      expectedDistrictSeasonRows: 300,
      expectedStatisticRows: 1200,
      publicationStatus: "research-preview-only",
    },
    status: "running",
    started_at: now,
    finished_at: null,
  };
  const { error } = await supabase
    .from("observatory_processing_runs")
    .upsert(row, { onConflict: "processing_run_id" });
  if (error) {
    throw new Error(`Upsert processing run: ${error.message}`);
  }
}

async function upsertRunInputs(
  processingRunId,
  sourceDatasetVersionId,
  boundaryDatasetVersionId,
) {
  const { error } = await supabase
    .from("observatory_processing_run_inputs")
    .upsert([
      {
        processing_run_id: processingRunId,
        dataset_version_id: sourceDatasetVersionId,
        input_role: "primary",
      },
      {
        processing_run_id: processingRunId,
        dataset_version_id: boundaryDatasetVersionId,
        input_role: "boundary-research",
      },
    ], {
      onConflict: "processing_run_id,dataset_version_id",
    });
  if (error) {
    throw new Error(`Upsert processing run inputs: ${error.message}`);
  }
}

async function upsertResearchObservations(rows) {
  const batchSize = 250;
  for (let index = 0; index < rows.length; index += batchSize) {
    const batch = rows.slice(index, index + batchSize);
    const { error } = await supabase
      .from("observatory_research_observations")
      .upsert(batch, {
        onConflict:
          "area_code,product_id,analysis_year,season_id,statistic,processing_run_id",
      });
    if (error) {
      throw new Error(
        `Upsert research observations at row ${index}: `
        + error.message,
      );
    }
  }
}

async function completeProcessingRun({
  processingRunId,
  status,
  qa,
  resultChecksumSha256,
  observationRowCount,
}) {
  const { error } = await supabase
    .from("observatory_processing_runs")
    .update({
      status,
      finished_at: new Date().toISOString(),
      qa_summary: {
        ...qa,
        resultChecksumSha256,
        researchObservationRows: observationRowCount,
        publicObservationRowsCreated: 0,
        rasterAssetRowsCreated: 0,
        publicationStatus: "research-preview-only",
      },
    })
    .eq("processing_run_id", processingRunId);
  if (error) {
    throw new Error(`Complete processing run: ${error.message}`);
  }
}

async function failProcessingRun(processingRunId, error) {
  const message = sanitizeError(error);
  const { error: updateError } = await supabase
    .from("observatory_processing_runs")
    .update({
      status: "failed",
      finished_at: new Date().toISOString(),
      qa_summary: {
        status: "failed",
        error: message,
        publicationStatus: "blocked",
        publicObservationRowsCreated: 0,
        rasterAssetRowsCreated: 0,
      },
    })
    .eq("processing_run_id", processingRunId);
  if (updateError) {
    console.error(
      `Failed to checkpoint processing run: ${updateError.message}`,
    );
  }
}

function assertPreconditions() {
  if (!sentinelDataset || !cityMapDataset || !districtResource) {
    throw new Error("Required Observatory datasets are missing");
  }
  if (
    sentinelDataset.acceptance.status !== "validated"
    || sentinelDataset.license.status !== "verified"
    || sentinelDataset.license.redistribution !== "allowed"
  ) {
    throw new Error("Sentinel-2 source is not validated for reuse");
  }
  if (
    cityMapDataset.acceptance.status !== "research"
    || boundaryQa.qa.status !== "passed-technical-qa"
    || !boundaryQa.acceptance.internalProcessingAccepted
    || boundaryQa.acceptance.canonicalPublicBoundary
    || boundaryQa.source.sourceResponsePersisted
    || boundaryQa.source.geometryPersisted
  ) {
    throw new Error(
      "CityMap boundary is not accepted for ephemeral research processing",
    );
  }
  if (
    cityMapIntake.registryVersion !== registry.registryVersion
    || boundaryQa.registryVersion !== registry.registryVersion
  ) {
    throw new Error("CityMap evidence does not match the registry version");
  }
  if (
    recipe.temporal.comparisonRule !== "same-season-only"
    || recipe.publication.allowsPublicRequestProcessing !== false
  ) {
    throw new Error("NDVI recipe publication or comparison contract changed");
  }
}

function initializeEarthEngine() {
  const serviceAccountJson = process.env.GEE_SERVICE_ACCOUNT_JSON;
  const credentials = serviceAccountJson
    ? JSON.parse(serviceAccountJson)
    : {
        client_email: process.env.GEE_CLIENT_EMAIL,
        private_key: process.env.GEE_PRIVATE_KEY?.replace(/\\n/g, "\n"),
        project_id: process.env.GEE_PROJECT_ID,
      };
  if (!credentials.client_email || !credentials.private_key) {
    throw new Error(
      "Missing GEE_SERVICE_ACCOUNT_JSON or "
      + "GEE_CLIENT_EMAIL/GEE_PRIVATE_KEY",
    );
  }
  return new Promise((resolvePromise, rejectPromise) => {
    ee.data.authenticateViaPrivateKey(
      credentials,
      () => {
        ee.initialize(
          null,
          null,
          resolvePromise,
          rejectPromise,
          null,
          credentials.project_id,
        );
      },
      rejectPromise,
    );
  });
}

function evaluate(computedObject) {
  return new Promise((resolvePromise, rejectPromise) => {
    computedObject.evaluate((value, error) => {
      if (error) {
        rejectPromise(
          error instanceof Error
            ? error
            : new Error(String(error)),
        );
        return;
      }
      resolvePromise(value);
    });
  });
}

async function evaluateWithRetry(
  computedObject,
  label,
  maxAttempts = 3,
) {
  let lastError;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      return await evaluate(computedObject);
    } catch (error) {
      lastError = error;
      if (attempt === maxAttempts) {
        break;
      }
      const delayMs = attempt * 5_000;
      console.warn(
        `${label}: Earth Engine attempt ${attempt} failed; `
        + `retrying in ${delayMs / 1_000}s`,
      );
      await new Promise((resolvePromise) => {
        setTimeout(resolvePromise, delayMs);
      });
    }
  }
  throw lastError;
}

function createServiceClient() {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY",
    );
  }
  if (serviceRoleKey === anonKey) {
    throw new Error("Service-role key must not be the anonymous key");
  }
  return createClient(supabaseUrl, serviceRoleKey, {
    auth: {
      autoRefreshToken: false,
      persistSession: false,
    },
  });
}

function getCodeCommitSha() {
  const sha = execFileSync("git", ["rev-parse", "HEAD"], {
    cwd: ROOT,
    encoding: "utf8",
  }).trim();
  if (!/^[a-f0-9]{40}$/.test(sha)) {
    throw new Error("Unable to resolve the processing code commit SHA");
  }
  return sha;
}

function sanitizeError(error) {
  const message = error instanceof Error ? error.message : String(error);
  return message
    .replace(/Bearer\s+[A-Za-z0-9._-]+/gi, "Bearer [redacted]")
    .slice(0, 2000);
}

function round(value, decimals = recipe.processing.roundingDecimals) {
  const number = Number(value);
  if (!Number.isFinite(number)) {
    return Number.NaN;
  }
  const factor = 10 ** decimals;
  return Math.round((number + Number.EPSILON) * factor) / factor;
}

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function stableStringify(value) {
  if (Array.isArray(value)) {
    return `[${value.map(stableStringify).join(",")}]`;
  }
  if (value && typeof value === "object") {
    return `{${Object.keys(value)
      .sort()
      .map(
        (key) =>
          `${JSON.stringify(key)}:${stableStringify(value[key])}`,
      )
      .join(",")}}`;
  }
  return JSON.stringify(value);
}

function toUuid(hex) {
  const normalized =
    `${hex.slice(0, 12)}5${hex.slice(13, 16)}`
    + `8${hex.slice(17, 32)}`;
  return [
    normalized.slice(0, 8),
    normalized.slice(8, 12),
    normalized.slice(12, 16),
    normalized.slice(16, 20),
    normalized.slice(20, 32),
  ].join("-");
}
