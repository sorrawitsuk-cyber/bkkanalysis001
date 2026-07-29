const SHA256_PATTERN = /^[a-f0-9]{64}$/;
const DECISION_STATUSES = new Set([
  "pending",
  "approved",
  "rejected",
  "revoked",
  "expired",
  "withdrawn",
]);
const GATE_STATUSES = new Set(["blocked", "open"]);
const PERMISSION_KEYS = [
  "useForAnalysis",
  "transformGeometry",
  "retainSourceSnapshotPrivately",
  "redistributeSourceGeometry",
  "redistributeDerivedGeometry",
  "publishDerivedTiles",
  "publishDistrictStatistics",
];
const REQUIRED_APPROVAL_PERMISSIONS = [
  "useForAnalysis",
  "transformGeometry",
  "retainSourceSnapshotPrivately",
  "redistributeDerivedGeometry",
  "publishDerivedTiles",
  "publishDistrictStatistics",
];

export function evaluateBoundaryAuthorization(
  authorization,
  { registry, boundaryReport },
) {
  const contractErrors = [];

  requireEqual(
    authorization.schemaVersion,
    "observatory-boundary-authorization/v1",
    "schemaVersion",
    contractErrors,
  );
  requireText(
    authorization.authorizationId,
    "authorizationId",
    contractErrors,
  );
  if (!DECISION_STATUSES.has(authorization.decisionStatus)) {
    contractErrors.push("decisionStatus must be a supported review status");
  }
  if (!GATE_STATUSES.has(authorization.gateStatus)) {
    contractErrors.push("gateStatus must be blocked or open");
  }

  const dataset = registry.datasets.find(
    (item) => item.id === authorization.source?.datasetId,
  );
  const resource = dataset?.resources?.find(
    (item) => item.id === authorization.source?.resourceId,
  );

  if (!dataset) {
    contractErrors.push("source.datasetId is not present in the registry");
  }
  if (!resource) {
    contractErrors.push(
      "source.resourceId is not present on the registry dataset",
    );
  }
  requireEqual(
    authorization.source?.datasetId,
    boundaryReport.datasetId,
    "source.datasetId",
    contractErrors,
  );
  requireEqual(
    authorization.source?.resourceId,
    boundaryReport.resourceId,
    "source.resourceId",
    contractErrors,
  );
  requireEqual(
    authorization.source?.url,
    boundaryReport.sourceUrl,
    "source.url",
    contractErrors,
  );
  requireEqual(
    authorization.source?.url,
    resource?.url,
    "source.url registry binding",
    contractErrors,
  );
  requireEqual(
    authorization.source?.checksumSha256,
    boundaryReport.source?.checksumSha256,
    "source.checksumSha256",
    contractErrors,
  );
  if (!SHA256_PATTERN.test(authorization.source?.checksumSha256 ?? "")) {
    contractErrors.push("source.checksumSha256 must be a lowercase SHA-256");
  }
  requireDate(
    authorization.source?.retrievedAt,
    "source.retrievedAt",
    contractErrors,
  );

  requireText(
    authorization.authority?.organization,
    "authority.organization",
    contractErrors,
  );
  requireText(
    authorization.authority?.contactChannel,
    "authority.contactChannel",
    contractErrors,
  );
  requireText(
    authorization.request?.documentPath,
    "request.documentPath",
    contractErrors,
  );
  requireDate(
    authorization.request?.preparedAt,
    "request.preparedAt",
    contractErrors,
  );

  const permissionKeys = Object.keys(authorization.permissions ?? {});
  for (const key of PERMISSION_KEYS) {
    if (!permissionKeys.includes(key)) {
      contractErrors.push(`permissions.${key} is required`);
      continue;
    }
    const value = authorization.permissions[key];
    if (value !== null && typeof value !== "boolean") {
      contractErrors.push(`permissions.${key} must be boolean or null`);
    }
  }
  for (const key of permissionKeys) {
    if (!PERMISSION_KEYS.includes(key)) {
      contractErrors.push(`permissions.${key} is not supported`);
    }
  }

  if (!Array.isArray(authorization.blockers)) {
    contractErrors.push("blockers must be an array");
  } else if (
    authorization.blockers.some(
      (blocker) => typeof blocker !== "string" || blocker.trim() === "",
    )
  ) {
    contractErrors.push("blockers must contain non-empty strings");
  }

  const approvalErrors = [];
  if (authorization.decisionStatus === "approved") {
    requireEqual(
      authorization.gateStatus,
      "open",
      "gateStatus for approved evidence",
      approvalErrors,
    );
    requireText(
      authorization.authority?.responseSignerName,
      "authority.responseSignerName",
      approvalErrors,
    );
    requireText(
      authorization.authority?.responseSignerRole,
      "authority.responseSignerRole",
      approvalErrors,
    );
    requireDate(
      authorization.request?.sentAt,
      "request.sentAt",
      approvalErrors,
    );
    requireText(
      authorization.request?.externalReference,
      "request.externalReference",
      approvalErrors,
    );
    requireText(
      authorization.evidence?.artifactReference,
      "evidence.artifactReference",
      approvalErrors,
    );
    if (
      !SHA256_PATTERN.test(
        authorization.evidence?.artifactChecksumSha256 ?? "",
      )
    ) {
      approvalErrors.push(
        "evidence.artifactChecksumSha256 must be a lowercase SHA-256",
      );
    }
    for (const field of ["issuedAt", "receivedAt", "verifiedAt"]) {
      requireDate(
        authorization.evidence?.[field],
        `evidence.${field}`,
        approvalErrors,
      );
    }
    requireText(
      authorization.evidence?.verifiedBy,
      "evidence.verifiedBy",
      approvalErrors,
    );
    for (const key of REQUIRED_APPROVAL_PERMISSIONS) {
      if (authorization.permissions?.[key] !== true) {
        approvalErrors.push(`permissions.${key} must be true`);
      }
    }
    if (
      typeof authorization.permissions?.redistributeSourceGeometry
      !== "boolean"
    ) {
      approvalErrors.push(
        "permissions.redistributeSourceGeometry must record true or false",
      );
    }
    for (const field of [
      "licenseName",
      "attributionText",
      "authoritativeVersionLabel",
      "updateCadence",
    ]) {
      requireText(
        authorization.terms?.[field],
        `terms.${field}`,
        approvalErrors,
      );
    }
    if (
      authorization.terms?.termsUrl !== null
      && !isHttpsUrl(authorization.terms?.termsUrl)
    ) {
      approvalErrors.push("terms.termsUrl must be null or an HTTPS URL");
    }
    if ((authorization.blockers ?? []).length !== 0) {
      approvalErrors.push("approved evidence cannot retain blockers");
    }
  } else {
    if (authorization.gateStatus !== "blocked") {
      contractErrors.push(
        "non-approved authorization must keep gateStatus blocked",
      );
    }
    if ((authorization.blockers ?? []).length === 0) {
      contractErrors.push(
        "non-approved authorization must explain at least one blocker",
      );
    }
  }

  const gateOpen =
    contractErrors.length === 0
    && approvalErrors.length === 0
    && authorization.decisionStatus === "approved"
    && authorization.gateStatus === "open";

  if (
    dataset?.acceptance?.status === "validated"
    && !gateOpen
  ) {
    contractErrors.push(
      "registry dataset cannot be validated while authorization gate is closed",
    );
  }
  if (
    boundaryReport.acceptance?.licenseAccepted === true
    && !gateOpen
  ) {
    contractErrors.push(
      "boundary intake cannot accept the license while authorization gate is closed",
    );
  }

  return {
    validContract: contractErrors.length === 0,
    gateOpen:
      contractErrors.length === 0
      && approvalErrors.length === 0
      && authorization.decisionStatus === "approved"
      && authorization.gateStatus === "open",
    decisionStatus: authorization.decisionStatus,
    contractErrors,
    approvalErrors,
    blockers: authorization.blockers ?? [],
  };
}

function requireEqual(value, expected, path, errors) {
  if (value !== expected) {
    errors.push(`${path} must equal ${JSON.stringify(expected)}`);
  }
}

function requireText(value, path, errors) {
  if (typeof value !== "string" || value.trim() === "") {
    errors.push(`${path} must be a non-empty string`);
  }
}

function requireDate(value, path, errors) {
  if (
    typeof value !== "string"
    || value.trim() === ""
    || Number.isNaN(Date.parse(value))
  ) {
    errors.push(`${path} must be an ISO-compatible date`);
  }
}

function isHttpsUrl(value) {
  if (typeof value !== "string") {
    return false;
  }
  try {
    return new URL(value).protocol === "https:";
  } catch {
    return false;
  }
}
