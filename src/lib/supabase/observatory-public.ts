import { createClient } from "@supabase/supabase-js";

export type ObservatoryDatabaseStatus =
  | {
      status: "connected";
      publicDatasetCount: number;
      publicDatasetVersionCount: number;
      publicProductCount: number;
      publicProcessingRunCount: number;
      publicObservationCount: number;
      publicRasterAssetCount: number;
      checkedAt: string;
    }
  | {
      status: "unavailable";
      reason: "authorization" | "configuration" | "connectivity" | "schema";
      publicDatasetCount: null;
      publicDatasetVersionCount: null;
      publicProductCount: null;
      publicProcessingRunCount: null;
      publicObservationCount: null;
      publicRasterAssetCount: null;
      checkedAt: string;
    };

const REQUEST_TIMEOUT_MS = 4_000;

function getUnavailableStatus(
  reason: "authorization" | "configuration" | "connectivity" | "schema",
): ObservatoryDatabaseStatus {
  return {
    status: "unavailable",
    reason,
    publicDatasetCount: null,
    publicDatasetVersionCount: null,
    publicProductCount: null,
    publicProcessingRunCount: null,
    publicObservationCount: null,
    publicRasterAssetCount: null,
    checkedAt: new Date().toISOString(),
  };
}

export async function getObservatoryDatabaseStatus(): Promise<ObservatoryDatabaseStatus> {
  const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;

  if (!supabaseUrl || !anonKey) {
    return getUnavailableStatus("configuration");
  }

  const timedFetch: typeof fetch = async (input, init) => {
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);

    try {
      return await fetch(input, {
        ...init,
        signal: controller.signal,
      });
    } finally {
      clearTimeout(timeout);
    }
  };

  const supabase = createClient(supabaseUrl, anonKey, {
    auth: {
      autoRefreshToken: false,
      detectSessionInUrl: false,
      persistSession: false,
    },
    global: {
      fetch: timedFetch,
    },
  });

  try {
    const [
      datasets,
      datasetVersions,
      products,
      processingRuns,
      observations,
      rasterAssets,
    ] = await Promise.all([
      supabase
        .from("observatory_datasets")
        .select("dataset_id", { count: "exact", head: true }),
      supabase
        .from("observatory_dataset_versions")
        .select("dataset_version_id", { count: "exact", head: true }),
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
    ]);

    const error =
      datasets.error
      ?? datasetVersions.error
      ?? products.error
      ?? processingRuns.error
      ?? observations.error
      ?? rasterAssets.error;
    if (error) {
      const schemaUnavailable =
        error.code === "42P01" ||
        error.code === "PGRST205" ||
        error.message.toLowerCase().includes("schema cache");
      const authorizationUnavailable =
        error.code === "42501" ||
        error.code === "PGRST301" ||
        error.message.toLowerCase().includes("permission");
      return getUnavailableStatus(
        schemaUnavailable
          ? "schema"
          : authorizationUnavailable
            ? "authorization"
            : "connectivity",
      );
    }

    return {
      status: "connected",
      publicDatasetCount: datasets.count ?? 0,
      publicDatasetVersionCount: datasetVersions.count ?? 0,
      publicProductCount: products.count ?? 0,
      publicProcessingRunCount: processingRuns.count ?? 0,
      publicObservationCount: observations.count ?? 0,
      publicRasterAssetCount: rasterAssets.count ?? 0,
      checkedAt: new Date().toISOString(),
    };
  } catch {
    return getUnavailableStatus("connectivity");
  }
}
