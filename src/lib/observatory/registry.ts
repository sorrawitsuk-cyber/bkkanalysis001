import registryJson from "../../../config/observatory/registry.json";

export type AcceptanceStatus =
  | "provisional"
  | "acceptance"
  | "research"
  | "validated"
  | "retired";

export type LicenseStatus = "verified" | "unverified" | "restricted";
export type RedistributionStatus = "allowed" | "pending" | "restricted";

export type ObservatoryRegistryDataset = {
  id: string;
  name: string;
  owner: string;
  sourceUrl: string;
  roleTh: string;
  measurementType: "observed" | "administrative" | "model-derived" | "proxy";
  sourceClass: string;
  spatialResolution: string;
  temporalCadence: string;
  resources?: Array<{
    id: string;
    format: string;
    url: string;
  }>;
  license: {
    status: LicenseStatus;
    name: string;
    url: string;
    redistribution: RedistributionStatus;
    attributionTemplate?: string;
  };
  acceptance: {
    status: AcceptanceStatus;
    checkedAt: string | null;
    blockers: string[];
  };
};

export type ObservatoryRegistryProduct = {
  id: string;
  nameTh: string;
  nameEn: string;
  phase: "mvp" | "phase-2";
  measurementType: string;
  sourceDatasetIds: string[];
  unit: string;
  statistics: string[];
  recipe: {
    methodVersion: string;
    temporalComposite: string;
    nativeScaleMeters: number;
    aggregation: string;
    qaRules: string[];
  };
  evidence?: {
    recipeManifestPath: string;
    recipeManifestChecksumSha256: string;
    goldenFixturePath: string;
    goldenQaReportPath: string;
    algorithmFixtureStatus: "passed" | "failed";
    fieldQaReportPath?: string;
    fieldQaStatus?: "preflight-passed" | "preflight-failed";
  };
  publishGate: {
    status: AcceptanceStatus;
    minValidCoverage: number;
    minSceneCount: number;
    requiresValidatedDatasets: boolean;
  };
  limitationsTh: string[];
};

export type ObservatoryRegistry = {
  schemaVersion: string;
  registryVersion: string;
  lastReviewedAt: string;
  scope: {
    city: string;
    country: string;
    description: string;
    excludedSources: string[];
  };
  publicationPolicy: {
    publicDatasetStatuses: AcceptanceStatus[];
    publicProductStatuses: AcceptanceStatus[];
    forbiddenSourceLabels: string[];
    requireChecksum: boolean;
    requireLicenseReview: boolean;
    requireMethodVersion: boolean;
    failureMode: "unavailable";
  };
  runtimeArtifacts: Array<{
    id: string;
    path: string;
    datasetId: string;
    checksumSha256: string;
    featureCount: number;
    status: AcceptanceStatus;
    allowedProperties: string[];
    forbiddenProperties: string[];
  }>;
  datasets: ObservatoryRegistryDataset[];
  products: ObservatoryRegistryProduct[];
};

export const OBSERVATORY_REGISTRY =
  registryJson as unknown as ObservatoryRegistry;

export const REGISTRY_DATASETS = OBSERVATORY_REGISTRY.datasets;
export const REGISTRY_PRODUCTS = OBSERVATORY_REGISTRY.products;

export function getRegistryDataset(id: string) {
  return REGISTRY_DATASETS.find((dataset) => dataset.id === id);
}

export function getRegistryProduct(id: string) {
  return REGISTRY_PRODUCTS.find((product) => product.id === id);
}

export function getRegistrySummary() {
  const datasetCounts = countStatuses(
    REGISTRY_DATASETS.map((dataset) => dataset.acceptance.status),
  );
  const productCounts = countStatuses(
    REGISTRY_PRODUCTS.map((product) => product.publishGate.status),
  );

  return {
    datasetCount: REGISTRY_DATASETS.length,
    productCount: REGISTRY_PRODUCTS.length,
    datasets: datasetCounts,
    products: productCounts,
    publicDatasetCount: REGISTRY_DATASETS.filter((dataset) =>
      OBSERVATORY_REGISTRY.publicationPolicy.publicDatasetStatuses.includes(
        dataset.acceptance.status,
      )).length,
    publicProductCount: REGISTRY_PRODUCTS.filter((product) =>
      OBSERVATORY_REGISTRY.publicationPolicy.publicProductStatuses.includes(
        product.publishGate.status,
      )).length,
  };
}

function countStatuses(statuses: AcceptanceStatus[]) {
  return statuses.reduce<Record<AcceptanceStatus, number>>(
    (counts, status) => {
      counts[status] += 1;
      return counts;
    },
    {
      provisional: 0,
      acceptance: 0,
      research: 0,
      validated: 0,
      retired: 0,
    },
  );
}
