import { spawn } from "node:child_process";
import { once } from "node:events";
import { readFile } from "node:fs/promises";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const port = Number(process.env.SMOKE_PORT || 4173);
const baseUrl = process.env.SMOKE_BASE_URL || `http://127.0.0.1:${port}`;
const shouldStartServer = !process.env.SMOKE_BASE_URL;
const allowDataUnavailable = process.argv.includes("--allow-data-unavailable");
const mobileInsightPaths = new Set(["/population", "/traffy"]);
const mobileDrawerPaths = new Set(["/heat-island", "/air-quality", "/nighttime-lights", "/green-space", "/urban-expansion", "/rainfall", "/land-cover-change"]);
const mobilePageSidebarPaths = new Set(["/rainfall", "/land-cover-change", "/decision-support"]);
const urlPersistencePaths = new Set(["/decision-support", "/population", "/accessibility"]);

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

const keyboardMapFiles = [
  "src/components/gee/DistrictMetricsMapView.tsx",
  "src/components/map/AccessibilityMap.tsx",
  "src/components/map/DecisionSupportMap.tsx",
  "src/components/map/FloodRiskMapView.tsx",
  "src/components/map/LandCoverChangeMap.tsx",
  "src/components/map/MapView.tsx",
  "src/components/map/PopulationMap.tsx",
  "src/components/map/RainfallMapView.tsx",
  "src/components/map/TreeCoverMap.tsx",
  "src/components/map/UrbanExpansionMap.tsx",
];

const responsiveDrawerFiles = [
  "src/app/heat-island/page.tsx",
  "src/app/air-quality/page.tsx",
  "src/app/nighttime-lights/page.tsx",
  "src/app/green-space/page.tsx",
  "src/app/urban-expansion/page.tsx",
  "src/app/rainfall/page.tsx",
  "src/app/land-cover-change/page.tsx",
];

const responsivePageSidebarFiles = [
  "src/app/rainfall/page.tsx",
  "src/app/land-cover-change/page.tsx",
  "src/app/decision-support/page.tsx",
];

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
    const expectedUrlHook = path === "/population" || path === "/accessibility"
      ? "useNullableNumberUrlState"
      : "useDistrictUrlState";
    if (!source.includes(expectedUrlHook)) {
      throw new Error(`${path} is missing ${expectedUrlHook} integration in ${file}`);
    }
    if (!source.includes("districtName=")) {
      throw new Error(`${path} is missing an explicit canonical district name for cross-module analysis`);
    }
  }
  const districtAnalysisSource = await readFile("src/app/district-analysis/page.tsx", "utf8");
  if (!districtAnalysisSource.includes("useDistrictUrlState")) {
    throw new Error("/district-analysis is missing district URL state integration");
  }
  for (const file of keyboardMapFiles) {
    const source = await readFile(file, "utf8");
    const binderReferences = source.match(/bindLeafletKeyboardSelection/g)?.length ?? 0;
    if (binderReferences < 2) {
      throw new Error(`${file} is missing a keyboard district binding`);
    }
  }
  for (const file of responsiveDrawerFiles) {
    const source = await readFile(file, "utf8");
    if (!source.includes("ResponsiveMapAside") || !source.includes("setMobileControlsOpen(true)")) {
      throw new Error(`${file} is missing responsive map drawer integration`);
    }
  }
  for (const file of responsivePageSidebarFiles) {
    const source = await readFile(file, "utf8");
    if (!source.includes("ResponsivePageSidebar") || !source.includes("setMobileSidebarOpen")) {
      throw new Error(`${file} is missing responsive page sidebar integration`);
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
    let canonicalDistricts = null;
    try {
      const districtResponse = await page.request.get(`${baseUrl}/api/district-profile`);
      if (!districtResponse.ok()) throw new Error(`district list returned ${districtResponse.status()}`);
      const districtPayload = await districtResponse.json();
      canonicalDistricts = new Set(districtPayload.districts ?? []);
      if (canonicalDistricts.size === 0) throw new Error("district list is empty");
    } catch (error) {
      if (!allowDataUnavailable) throw error;
    }

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
      const keyboardTarget = page.locator('[data-map-keyboard-selectable="true"]').first();
      let hasKeyboardGeometry = true;
      try {
        await keyboardTarget.waitFor({ state: "visible", timeout: 20000 });
      } catch {
        hasKeyboardGeometry = false;
      }
      if (!hasKeyboardGeometry) {
        const renderedGeometryCount = await page.locator(".leaflet-overlay-pane path.leaflet-interactive").count();
        if (renderedGeometryCount > 0) {
          throw new Error(`${path} rendered map geometry without a keyboard-selectable district target`);
        }
        results.push({ path, panelCount, provenanceCount, insightCount, keyboardSelected: "skipped-no-polygons" });
        continue;
      }
      const role = await keyboardTarget.getAttribute("role");
      const ariaLabel = await keyboardTarget.getAttribute("aria-label");
      if (role !== "button" || !ariaLabel) {
        throw new Error(`${path} keyboard district target is missing role or aria-label`);
      }
      await keyboardTarget.focus();
      await page.keyboard.press("Enter");
      await page.waitForTimeout(900);
      const selected = await panel.getAttribute("data-selected") === "true";
      if (!selected) throw new Error(`${path} panel did not select after keyboard district activation`);
      const analysisHref = await panel.locator('[data-testid="district-analysis-link"]').getAttribute("href");
      const analysisUrl = analysisHref ? new URL(analysisHref, baseUrl) : null;
      const analysisDistrict = analysisUrl?.searchParams.get("district");
      if (analysisUrl?.pathname !== "/district-analysis" || !analysisDistrict || analysisDistrict.startsWith("เขต")) {
        throw new Error(`${path} has an invalid cross-module district analysis link: ${analysisHref}`);
      }
      if (canonicalDistricts && !canonicalDistricts.has(analysisDistrict)) {
        throw new Error(`${path} linked a non-canonical district to cross-module analysis: ${analysisDistrict}`);
      }
      const selectionParam = path === "/population" ? "areaId" : path === "/accessibility" ? "districtId" : "district";
      const selectedParamValue = new URL(page.url()).searchParams.get(selectionParam);
      if (!selectedParamValue) {
        throw new Error(`${path} did not write ${selectionParam} to the URL after district selection`);
      }
      let mobileFeedback = null;
      let mobileDrawer = null;
      let mobilePageSidebar = null;
      if (mobileInsightPaths.has(path) || mobileDrawerPaths.has(path) || mobilePageSidebarPaths.has(path)) {
        await page.setViewportSize({ width: 390, height: 844 });
        await page.waitForTimeout(350);
      }
      if (mobileInsightPaths.has(path)) {
        const mobilePanel = page.locator('[data-testid="interactive-district-panel"][data-selected="true"]:visible').first();
        await mobilePanel.waitFor({ state: "visible", timeout: 5000 });
        const mobileBox = await mobilePanel.boundingBox();
        if (!mobileBox || mobileBox.x >= 390 || mobileBox.y >= 844 || mobileBox.x + mobileBox.width <= 0 || mobileBox.y + mobileBox.height <= 0) {
          throw new Error(`${path} selected district feedback is outside the mobile viewport`);
        }
        await mobilePanel.locator('button[aria-label="ล้างพื้นที่ที่เลือก"]').waitFor({ state: "visible" });
        mobileFeedback = true;
      }
      if (mobileDrawerPaths.has(path)) {
        const drawer = page.locator('[data-testid="responsive-map-aside"]:visible');
        await drawer.waitFor({ state: "visible", timeout: 5000 });
        const drawerBox = await drawer.boundingBox();
        if (!drawerBox || drawerBox.x < 0 || drawerBox.x + drawerBox.width > 390) {
          throw new Error(`${path} responsive map drawer is outside the mobile viewport`);
        }
        if (await drawer.getAttribute("role") !== "dialog" || await drawer.getAttribute("aria-modal") !== "true") {
          throw new Error(`${path} responsive map drawer is missing mobile dialog semantics`);
        }
        await drawer.locator('[data-testid="interactive-district-panel"][data-selected="true"]').waitFor({ state: "visible" });
        await drawer.locator('button[aria-label="ปิดแผงตัวกรอง"]').click();
        const drawerTrigger = page.locator('[data-testid="mobile-map-controls-button"]:visible');
        await drawerTrigger.waitFor({ state: "visible" });
        await drawerTrigger.click();
        await drawer.waitFor({ state: "visible" });
        await page.keyboard.press("Escape");
        await drawer.waitFor({ state: "hidden" });
        if (!(await drawerTrigger.evaluate((element) => element === document.activeElement))) {
          throw new Error(`${path} map drawer did not restore focus to its trigger after Escape`);
        }
        mobileDrawer = true;
      }
      if (mobilePageSidebarPaths.has(path)) {
        const pageSidebar = page.locator('[data-testid="responsive-page-sidebar"]:visible');
        if (!(await pageSidebar.isVisible())) {
          await page.locator('[data-testid="mobile-page-sidebar-button"]:visible').click();
        }
        await pageSidebar.waitFor({ state: "visible", timeout: 5000 });
        const sidebarBox = await pageSidebar.boundingBox();
        if (!sidebarBox || sidebarBox.x < 0 || sidebarBox.x + sidebarBox.width > 390) {
          throw new Error(`${path} responsive page sidebar is outside the mobile viewport`);
        }
        if (await pageSidebar.getAttribute("role") !== "dialog" || await pageSidebar.getAttribute("aria-modal") !== "true") {
          throw new Error(`${path} responsive page sidebar is missing mobile dialog semantics`);
        }
        await pageSidebar.locator('button[aria-label="ปิดข้อมูลและอันดับ"]').click();
        const sidebarTrigger = page.locator('[data-testid="mobile-page-sidebar-button"]:visible');
        await sidebarTrigger.waitFor({ state: "visible" });
        await sidebarTrigger.click();
        await pageSidebar.waitFor({ state: "visible" });
        await page.keyboard.press("Escape");
        await pageSidebar.waitFor({ state: "hidden" });
        if (!(await sidebarTrigger.evaluate((element) => element === document.activeElement))) {
          throw new Error(`${path} page sidebar did not restore focus to its trigger after Escape`);
        }
        mobilePageSidebar = true;
      }
      if (mobileInsightPaths.has(path) || mobileDrawerPaths.has(path) || mobilePageSidebarPaths.has(path)) {
        await page.setViewportSize({ width: 1440, height: 900 });
      }
      let urlPersistence = null;
      if (urlPersistencePaths.has(path)) {
        await page.reload({ waitUntil: "domcontentloaded" });
        const reloadedPanel = page.locator('[data-testid="interactive-district-panel"]:visible').first();
        await reloadedPanel.waitFor({ state: "visible", timeout: 30000 });
        await page.waitForFunction(() => document.querySelector('[data-testid="interactive-district-panel"]:not([data-selected="false"])'));
        if (new URL(page.url()).searchParams.get(selectionParam) !== selectedParamValue) {
          throw new Error(`${path} did not preserve ${selectionParam} after reload`);
        }
        await page.goBack();
        await page.waitForFunction((param) => !new URL(window.location.href).searchParams.has(param), selectionParam);
        await page.locator('[data-testid="interactive-district-panel"][data-selected="false"]:visible').waitFor({ state: "visible", timeout: 30000 });
        urlPersistence = true;
      }
      results.push({ path, panelCount, provenanceCount, insightCount, keyboardSelected: true, mobileFeedback, mobileDrawer, mobilePageSidebar, urlPersistence });
    }

    await page.goto(`${baseUrl}/district-analysis?district=${encodeURIComponent("พระนคร")}`, { waitUntil: "domcontentloaded", timeout: 30000 });
    const districtSelection = page.locator('[data-testid="district-analysis-selection"]');
    await districtSelection.waitFor({ state: "visible", timeout: 30000 });
    await page.waitForFunction(() => document.querySelector('[data-testid="district-analysis-selection"]')?.textContent?.trim() === "พระนคร");
    await page.reload({ waitUntil: "domcontentloaded" });
    await page.waitForFunction(() => document.querySelector('[data-testid="district-analysis-selection"]')?.textContent?.trim() === "พระนคร");
    if (new URL(page.url()).searchParams.get("district") !== "พระนคร") {
      throw new Error("/district-analysis did not preserve the selected district after reload");
    }
    results.push({ path: "/district-analysis", urlSelection: true });
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
