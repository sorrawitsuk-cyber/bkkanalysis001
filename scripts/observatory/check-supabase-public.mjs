import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");

dotenv.config({ path: resolve(ROOT, ".env.local"), quiet: true });

const registry = JSON.parse(
  await readFile(resolve(ROOT, "config/observatory/registry.json"), "utf8"),
);
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !anonKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or NEXT_PUBLIC_SUPABASE_ANON_KEY.",
  );
}

const supabase = createClient(supabaseUrl, anonKey, {
  auth: {
    autoRefreshToken: false,
    detectSessionInUrl: false,
    persistSession: false,
  },
});

const [
  datasets,
  datasetVersions,
  products,
  processingRuns,
  observations,
  rasterAssets,
  processingTiles,
  qualityFlags,
  datasetAuthorizations,
  datasetVersionEvidence,
  researchAreas,
  researchObservations,
] = await Promise.all([
  supabase
    .from("observatory_datasets")
    .select("dataset_id", { count: "exact", head: true }),
  supabase
    .from("observatory_dataset_versions")
    .select(
      "dataset_version_id,dataset_id,acceptance_status",
      { count: "exact" },
    ),
  supabase
    .from("observatory_products")
    .select("product_id", { count: "exact", head: true }),
  supabase
    .from("observatory_processing_runs")
    .select("processing_run_id", { count: "exact", head: true }),
  supabase
    .from("observatory_observations")
    .select("observation_id", { count: "exact", head: true }),
  supabase
    .from("observatory_raster_assets")
    .select("asset_id", { count: "exact", head: true }),
  supabase
    .from("observatory_processing_tiles")
    .select("processing_tile_id", { count: "exact", head: true }),
  supabase
    .from("observatory_quality_flags")
    .select("quality_flag_id", { count: "exact", head: true }),
  supabase
    .from("observatory_dataset_authorizations")
    .select("authorization_id", { count: "exact", head: true }),
  supabase
    .from("observatory_dataset_version_evidence")
    .select("evidence_id", { count: "exact", head: true }),
  supabase
    .from("observatory_research_areas")
    .select("area_code", { count: "exact", head: true }),
  supabase
    .from("observatory_research_observations")
    .select("research_observation_id", { count: "exact", head: true }),
]);

for (const [name, result] of [
  ["observatory_datasets", datasets],
  ["observatory_dataset_versions", datasetVersions],
  ["observatory_products", products],
  ["observatory_processing_runs", processingRuns],
  ["observatory_observations", observations],
  ["observatory_raster_assets", rasterAssets],
]) {
  if (result.error) {
    throw new Error(`${name}: ${result.error.code} ${result.error.message}`);
  }
}

const expectedPublicDatasetCount = registry.datasets.filter((dataset) =>
  registry.publicationPolicy.publicDatasetStatuses.includes(
    dataset.acceptance.status,
  ),
).length;
const expectedPublicProductCount = registry.products.filter((product) =>
  registry.publicationPolicy.publicProductStatuses.includes(
    product.publishGate.status,
  ),
).length;
const expectedPublicDatasetIds = new Set(
  registry.datasets
    .filter((dataset) =>
      registry.publicationPolicy.publicDatasetStatuses.includes(
        dataset.acceptance.status,
      ),
    )
    .map((dataset) => dataset.id),
);
const observedPublicDatasetIds = new Set(
  datasetVersions.data.map((version) => version.dataset_id),
);

if (datasets.count !== expectedPublicDatasetCount) {
  throw new Error(
    `Public dataset count mismatch: expected ${expectedPublicDatasetCount}, received ${datasets.count}.`,
  );
}

if (products.count !== expectedPublicProductCount) {
  throw new Error(
    `Public product count mismatch: expected ${expectedPublicProductCount}, received ${products.count}.`,
  );
}
if (
  datasetVersions.count < expectedPublicDatasetIds.size
  || [...expectedPublicDatasetIds].some(
    (datasetId) => !observedPublicDatasetIds.has(datasetId),
  )
  || datasetVersions.data.some(
    (version) =>
      !expectedPublicDatasetIds.has(version.dataset_id)
      || version.acceptance_status !== "validated",
  )
) {
  throw new Error(
    "Public dataset versions include an unregistered or unvalidated row.",
  );
}
for (const [name, result] of [
  ["observatory_processing_runs", processingRuns],
  ["observatory_observations", observations],
  ["observatory_raster_assets", rasterAssets],
]) {
  if (result.count !== 0) {
    throw new Error(
      `${name} unexpectedly exposes ${result.count} rows to anonymous users.`,
    );
  }
}

if (!qualityFlags.error) {
  throw new Error(
    "observatory_quality_flags unexpectedly allows anonymous reads.",
  );
}
if (!processingTiles.error) {
  throw new Error(
    "observatory_processing_tiles unexpectedly allows anonymous reads.",
  );
}
if (!datasetAuthorizations.error) {
  throw new Error(
    "observatory_dataset_authorizations unexpectedly allows anonymous reads.",
  );
}
if (!datasetVersionEvidence.error) {
  throw new Error(
    "observatory_dataset_version_evidence unexpectedly allows anonymous reads.",
  );
}
if (!researchAreas.error) {
  throw new Error(
    "observatory_research_areas unexpectedly allows anonymous reads.",
  );
}
if (!researchObservations.error) {
  throw new Error(
    "observatory_research_observations unexpectedly allows anonymous reads.",
  );
}

console.log(
  JSON.stringify(
    {
      status: "public-rls-verified",
      publicDatasetCount: datasets.count,
      publicDatasetVersionCount: datasetVersions.count,
      publicProductCount: products.count,
      publicProcessingRunCount: processingRuns.count,
      publicObservationCount: observations.count,
      publicRasterAssetCount: rasterAssets.count,
      internalTileCheckpointsPubliclyReadable: false,
      internalQualityFlagsPubliclyReadable: false,
      internalAuthorizationsPubliclyReadable: false,
      internalDatasetVersionEvidencePubliclyReadable: false,
      internalResearchAreasPubliclyReadable: false,
      internalResearchObservationsPubliclyReadable: false,
      serviceRoleUsed: false,
    },
    null,
    2,
  ),
);
