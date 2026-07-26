export function runNdviSeasonalScenario(recipe, scenario) {
  const decimals = recipe.processing.roundingDecimals;
  const clearClasses = new Set(recipe.quality.clearSclClasses);
  const [reflectanceMin, reflectanceMax] =
    recipe.quality.reflectanceValidRange;

  const totalArea = scenario.pixels.reduce((sum, pixel) => {
    assertPositiveNumber(pixel.area, `pixel ${pixel.id} area`);
    return sum + pixel.area;
  }, 0);
  const sceneIds = new Set();
  const validPixelComposites = [];
  let validArea = 0;
  let validObservationCount = 0;
  let maskedObservationCount = 0;
  let invalidReflectanceCount = 0;

  for (const pixel of scenario.pixels) {
    const ndviObservations = [];

    for (const observation of pixel.observations) {
      if (!clearClasses.has(observation.scl)) {
        maskedObservationCount += 1;
        continue;
      }

      if (
        !isFiniteWithin(observation.nir, reflectanceMin, reflectanceMax)
        || !isFiniteWithin(observation.red, reflectanceMin, reflectanceMax)
      ) {
        invalidReflectanceCount += 1;
        continue;
      }

      const denominator = observation.nir + observation.red;
      if (!Number.isFinite(denominator) || denominator === 0) {
        invalidReflectanceCount += 1;
        continue;
      }

      const ndvi = (observation.nir - observation.red) / denominator;
      if (!Number.isFinite(ndvi) || ndvi < -1 || ndvi > 1) {
        invalidReflectanceCount += 1;
        continue;
      }

      ndviObservations.push(ndvi);
      sceneIds.add(observation.sceneId);
      validObservationCount += 1;
    }

    if (ndviObservations.length === 0) {
      continue;
    }

    validArea += pixel.area;
    validPixelComposites.push({
      value: median(ndviObservations),
      weight: pixel.area,
    });
  }

  const validCoverage = round(validArea / totalArea, decimals);
  const sceneCount = sceneIds.size;
  const blockers = [];

  if (validCoverage < recipe.quality.minValidCoverage) {
    blockers.push(
      `valid coverage ${formatThreshold(validCoverage)} is below ${formatThreshold(recipe.quality.minValidCoverage)}`,
    );
  }
  if (sceneCount < recipe.quality.minSceneCount) {
    blockers.push(
      `scene count ${sceneCount} is below ${recipe.quality.minSceneCount}`,
    );
  }
  if (validPixelComposites.length === 0) {
    blockers.push("no pixels contain valid observations");
  }

  const diagnostics = validPixelComposites.length > 0
    ? calculateStatistics(validPixelComposites, decimals)
    : null;
  const publishable = blockers.length === 0;

  return {
    qualityStatus: publishable ? "accepted" : "rejected",
    publishable,
    validCoverage,
    sceneCount,
    validObservationCount,
    statistics: publishable ? diagnostics : null,
    blockers,
    diagnostics: {
      validPixelCount: validPixelComposites.length,
      totalPixelCount: scenario.pixels.length,
      maskedObservationCount,
      invalidReflectanceCount,
      internalStatistics: diagnostics,
    },
  };
}

function calculateStatistics(weightedValues, decimals) {
  const p25 = weightedQuantile(weightedValues, 0.25);
  const p75 = weightedQuantile(weightedValues, 0.75);

  return {
    median: round(weightedQuantile(weightedValues, 0.5), decimals),
    p10: round(weightedQuantile(weightedValues, 0.1), decimals),
    p90: round(weightedQuantile(weightedValues, 0.9), decimals),
    interquartileRange: round(p75 - p25, decimals),
  };
}

function weightedQuantile(weightedValues, quantile) {
  if (weightedValues.length === 0) {
    throw new Error("weightedQuantile requires at least one value");
  }
  if (quantile < 0 || quantile > 1) {
    throw new Error("quantile must be between 0 and 1");
  }

  const sorted = [...weightedValues].sort((a, b) => a.value - b.value);
  const totalWeight = sorted.reduce((sum, item) => sum + item.weight, 0);
  const threshold = quantile * totalWeight;
  let cumulative = 0;

  for (const item of sorted) {
    cumulative += item.weight;
    if (cumulative >= threshold) {
      return item.value;
    }
  }

  return sorted.at(-1).value;
}

function median(values) {
  const sorted = [...values].sort((a, b) => a - b);
  const middle = Math.floor(sorted.length / 2);
  return sorted.length % 2 === 0
    ? (sorted[middle - 1] + sorted[middle]) / 2
    : sorted[middle];
}

function round(value, decimals) {
  const factor = 10 ** decimals;
  return Math.round((value + Number.EPSILON) * factor) / factor;
}

function isFiniteWithin(value, min, max) {
  return Number.isFinite(value) && value >= min && value <= max;
}

function assertPositiveNumber(value, label) {
  if (!Number.isFinite(value) || value <= 0) {
    throw new Error(`${label} must be a positive number`);
  }
}

function formatThreshold(value) {
  return Number(value.toFixed(6)).toString();
}
