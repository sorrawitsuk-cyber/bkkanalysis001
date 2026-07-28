import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { createClient } from "@supabase/supabase-js";
import dotenv from "dotenv";

const ROOT = resolve(dirname(fileURLToPath(import.meta.url)), "../..");
const REGISTRY_PATH = resolve(ROOT, "config/observatory/registry.json");
const APPLY = process.argv.includes("--apply");

dotenv.config({ path: resolve(ROOT, ".env.local"), quiet: true });

const registry = JSON.parse(await readFile(REGISTRY_PATH, "utf8"));

export function mapRegistryDataset(dataset, registryMetadata) {
  return {
    dataset_id: dataset.id,
    display_name: dataset.name,
    owner_name: dataset.owner,
    source_url: dataset.sourceUrl,
    source_class: dataset.sourceClass,
    measurement_type: dataset.measurementType,
    spatial_resolution: dataset.spatialResolution,
    temporal_cadence: dataset.temporalCadence,
    license_status: dataset.license.status,
    license_name: dataset.license.name,
    license_url: dataset.license.url,
    redistribution_status: dataset.license.redistribution,
    acceptance_status: dataset.acceptance.status,
    acceptance_checked_at: dataset.acceptance.checkedAt,
    acceptance_blockers: dataset.acceptance.blockers,
    metadata: {
      roleTh: dataset.roleTh,
      resources: dataset.resources ?? [],
      attributionTemplate: dataset.license.attributionTemplate ?? null,
      registryVersion: registryMetadata.registryVersion,
      registryReviewedAt: registryMetadata.lastReviewedAt,
    },
  };
}

export function mapRegistryProduct(product) {
  return {
    product_id: product.id,
    display_name_th: product.nameTh,
    display_name_en: product.nameEn,
    phase: product.phase,
    measurement_type: product.measurementType,
    unit: product.unit,
    method_version: product.recipe.methodVersion,
    recipe: product.recipe,
    statistics: product.statistics,
    limitations: product.limitationsTh,
    min_valid_coverage: product.publishGate.minValidCoverage,
    min_scene_count: product.publishGate.minSceneCount,
    requires_validated_datasets:
      product.publishGate.requiresValidatedDatasets,
    acceptance_status: product.publishGate.status,
  };
}

export function mapProductDatasets(product) {
  return product.sourceDatasetIds.map((datasetId) => ({
    product_id: product.id,
    dataset_id: datasetId,
    input_role: "primary",
    required: true,
  }));
}

const registryMetadata = {
  registryVersion: registry.registryVersion,
  lastReviewedAt: registry.lastReviewedAt,
};
const datasets = registry.datasets.map((dataset) =>
  mapRegistryDataset(dataset, registryMetadata),
);
const products = registry.products.map(mapRegistryProduct);
const productDatasets = registry.products.flatMap(mapProductDatasets);

const plan = {
  mode: APPLY ? "apply" : "plan",
  registryVersion: registry.registryVersion,
  datasetUpserts: datasets.length,
  productUpserts: products.length,
  productDatasetUpserts: productDatasets.length,
  validatedDatasetUpserts: datasets.filter(
    (dataset) => dataset.acceptance_status === "validated",
  ).length,
  validatedProductUpserts: products.filter(
    (product) => product.acceptance_status === "validated",
  ).length,
  deletions: 0,
  automaticStatusPromotions: 0,
};

if (!APPLY) {
  console.log(JSON.stringify(plan, null, 2));
  console.log(
    "Plan only. Run `npm run observatory:supabase:sync` after the pending Observatory migration is applied.",
  );
  process.exit(0);
}

const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

if (!supabaseUrl || !serviceRoleKey) {
  throw new Error(
    "Missing NEXT_PUBLIC_SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in .env.local.",
  );
}

if (serviceRoleKey === anonKey) {
  throw new Error(
    "SUPABASE_SERVICE_ROLE_KEY must not be the public anonymous key.",
  );
}

const supabase = createClient(supabaseUrl, serviceRoleKey, {
  auth: {
    autoRefreshToken: false,
    persistSession: false,
  },
});

async function upsert(table, rows, conflictColumn) {
  const { error } = await supabase
    .from(table)
    .upsert(rows, { onConflict: conflictColumn });

  if (error) {
    const migrationHint =
      error.code === "42P01" || error.code === "PGRST205"
        ? " Apply the pending Observatory Supabase migration first."
        : "";
    throw new Error(`${table}: ${error.message}.${migrationHint}`);
  }
}

await upsert("observatory_datasets", datasets, "dataset_id");
await upsert("observatory_products", products, "product_id");
await upsert(
  "observatory_product_datasets",
  productDatasets,
  "product_id,dataset_id",
);

const verificationQueries = await Promise.all([
  supabase
    .from("observatory_datasets")
    .select("dataset_id", { count: "exact", head: true }),
  supabase
    .from("observatory_products")
    .select("product_id", { count: "exact", head: true }),
  supabase
    .from("observatory_product_datasets")
    .select("product_id", { count: "exact", head: true }),
  supabase
    .from("observatory_dataset_versions")
    .select("dataset_version_id", { count: "exact", head: true }),
  supabase
    .from("observatory_areas")
    .select("area_code", { count: "exact", head: true }),
]);

for (const result of verificationQueries) {
  if (result.error) {
    throw new Error(`Verification failed: ${result.error.message}`);
  }
}

console.log(
  JSON.stringify(
    {
      ...plan,
      remoteCounts: {
        datasets: verificationQueries[0].count,
        products: verificationQueries[1].count,
        productDatasets: verificationQueries[2].count,
        datasetVersions: verificationQueries[3].count,
        areas: verificationQueries[4].count,
      },
      result: "registry-synced",
      note:
        "Registry-declared statuses were applied. No status was promoted automatically and no row was deleted.",
    },
    null,
    2,
  ),
);
