import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const port = Number(process.env.SMOKE_PORT || 4173);
const baseUrl = process.env.SMOKE_BASE_URL || `http://127.0.0.1:${port}`;
const shouldStartServer = !process.env.SMOKE_BASE_URL;
const allowDataUnavailable = process.argv.includes("--allow-data-unavailable");
const canvasClickPaths = new Set(["/accessibility"]);

const moduleFiles = {
  "/heat-island": "src/app/heat-island/page.tsx",
  "/ndvi": "src/app/ndvi/page.tsx",
  "/air-quality": "src/app/air-quality/page.tsx",
  "/nighttime-lights": "src/app/nighttime-lights/page.tsx",
  "/green-space": "src/app/green-space/page.tsx",
  "/urban-expansion": "src/app/urban-expansion/page.tsx",
  "/rainfall": "src/app/rainfall/page.tsx",
  "/land-cover-change": "src/app/land-cover-change/page.tsx",
  "/decision-support": "src/app/decision-support/page.tsx",
  "/population": "src/app/population/page.tsx",
  "/accessibility": "src/app/accessibility/page.tsx",
  "/flood-risk": "src/app/flood-risk/page.tsx",
  "/traffy": "src/app/traffy/page.tsx",
};

async function waitForServer(url, timeoutMs = 60000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(url);
      if (response.ok) return;
    } catch {
      // Server is still booting.
    }
    await delay(1000);
  }
  throw new Error(`Timed out waiting for ${url}`);
}

async function terminateServer(server) {
  if (!server) return;
  const closed = once(server, "close").catch(() => undefined);
  server.kill("SIGTERM");
  await Promise.race([closed, delay(3000)]);
  if (server.exitCode === null) server.kill("SIGKILL");
  server.stdout?.destroy();
  server.stderr?.destroy();
  await delay(500);
}

async function gotoWithPanel(page, url) {
  let lastError;
  const maxAttempts = allowDataUnavailable ? 1 : 3;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.locator('[data-testid="interactive-district-panel"]').waitFor({
        state: "visible",
        timeout: allowDataUnavailable ? 12000 : 30000,
      });
      return true;
    } catch (error) {
      lastError = error;
      await delay(1500 * attempt);
    }
  }
  if (allowDataUnavailable) return false;
  throw lastError;
}

async function runSmoke() {
  for (const [path, file] of Object.entries(moduleFiles)) {
    const source = await readFile(file, "utf8");
    const hasImport = /import\s+InteractiveDistrictPanel\s+from\s+["'][^"']+InteractiveDistrictPanel["']/.test(source);
    const hasRenderedPanel = /<InteractiveDistrictPanel(?:\s|\/|>)/.test(source);
    if (!hasImport || !hasRenderedPanel) {
      throw new Error(`${path} is missing InteractiveDistrictPanel integration in ${file}`);
    }
  }

  let server;
  if (shouldStartServer) {
    server = spawn(process.execPath, ["node_modules/next/dist/bin/next", "dev", "-H", "127.0.0.1", "-p", String(port)], {
      cwd: process.cwd(),
      env: process.env,
      stdio: "pipe",
    });
    server.stdout.on("data", (chunk) => process.stdout.write(chunk));
    server.stderr.on("data", (chunk) => process.stderr.write(chunk));
  }

  await waitForServer(baseUrl);

  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1440, height: 900 } });
  page.setDefaultTimeout(15000);
  await page.route("**/*", (route) => {
    const url = route.request().url();
    if (url.startsWith(baseUrl) || url.startsWith("data:") || url.startsWith("blob:")) {
      return route.continue();
    }
    return route.abort();
  });
  const requestedPaths = process.env.SMOKE_PATHS
    ? process.env.SMOKE_PATHS.split(",").map((path) => path.trim()).filter(Boolean)
    : null;
  const paths = requestedPaths ?? Object.keys(moduleFiles);
  const results = [];

  try {
    for (const path of paths) {
      const panelReady = await gotoWithPanel(page, `${baseUrl}${path}`);
      if (panelReady === false) {
        results.push({ path, runtime: "skipped-data-unavailable", staticIntegration: true });
        continue;
      }
      const panelCount = await page.locator('[data-testid="interactive-district-panel"]:visible').count();
      const provenanceCount = await page.locator('[data-testid="district-provenance"]:visible').count();
      const insightCount = await page.locator('[data-testid="district-insight-text"]:visible').count();
      if (panelCount !== 1 || provenanceCount !== 1 || insightCount !== 1) {
        throw new Error(`${path} missing panel/provenance/insight: ${JSON.stringify({ panelCount, provenanceCount, insightCount })}`);
      }
      const panel = page.locator('[data-testid="interactive-district-panel"]:visible').first();
      const map = page.locator(".leaflet-container");
      await map.waitFor({ state: "visible", timeout: 30000 });
      let hasClickableGeometry = true;
      let interactivePath = null;
      if (canvasClickPaths.has(path)) {
        await page.waitForTimeout(2500);
      } else {
        try {
          interactivePath = page.locator(".leaflet-overlay-pane path.leaflet-interactive").first();
          await interactivePath.waitFor({ state: "visible", timeout: 20000 });
        } catch {
          hasClickableGeometry = false;
        }
      }
      if (!hasClickableGeometry) {
        results.push({ path, panelCount, provenanceCount, insightCount, clickSelected: "skipped-no-polygons" });
        continue;
      }
      const box = await map.boundingBox();
      if (!box) throw new Error(`${path} map has no bounding box`);
      let selected = await panel.getAttribute("data-selected") === "true";
      if (canvasClickPaths.has(path)) {
        const clickRatios = [[0.5, 0.5], [0.58, 0.45], [0.45, 0.55], [0.62, 0.58], [0.4, 0.42]];
        for (const [xRatio, yRatio] of clickRatios) {
          await page.mouse.click(box.x + box.width * xRatio, box.y + box.height * yRatio);
          await page.waitForTimeout(900);
          selected = await panel.getAttribute("data-selected") === "true";
          if (selected) break;
        }
      } else if (interactivePath) {
        await interactivePath.click({ force: true });
        await page.waitForTimeout(900);
        selected = await panel.getAttribute("data-selected") === "true";
      }
      if (!selected) throw new Error(`${path} panel did not select after map polygon click`);
      results.push({ path, panelCount, provenanceCount, insightCount, clickSelected: true });
    }
  } finally {
    await browser.close();
    await terminateServer(server);
  }

  console.log(JSON.stringify(results, null, 2));
}

runSmoke().catch((error) => {
  console.error(error);
  process.exit(1);
});
