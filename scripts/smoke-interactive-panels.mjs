import { spawn } from "node:child_process";
import { setTimeout as delay } from "node:timers/promises";
import { chromium } from "playwright";

const port = Number(process.env.SMOKE_PORT || 4173);
const baseUrl = process.env.SMOKE_BASE_URL || `http://127.0.0.1:${port}`;
const shouldStartServer = !process.env.SMOKE_BASE_URL;

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

async function gotoWithPanel(page, url) {
  let lastError;
  for (let attempt = 1; attempt <= 3; attempt += 1) {
    try {
      await page.goto(url, { waitUntil: "domcontentloaded", timeout: 30000 });
      await page.locator('[data-testid="interactive-district-panel"]').waitFor({ state: "visible", timeout: 30000 });
      return;
    } catch (error) {
      lastError = error;
      await delay(1500 * attempt);
    }
  }
  throw lastError;
}

async function runSmoke() {
  let server;
  if (shouldStartServer) {
    const command = process.platform === "win32" ? "cmd.exe" : "npm";
    const args = process.platform === "win32"
      ? ["/d", "/s", "/c", `npm run dev -- -H 127.0.0.1 -p ${port}`]
      : ["run", "dev", "--", "-H", "127.0.0.1", "-p", String(port)];
    server = spawn(command, args, {
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
  const paths = ["/heat-island", "/ndvi", "/air-quality", "/nighttime-lights"];
  const results = [];

  try {
    for (const path of paths) {
      await gotoWithPanel(page, `${baseUrl}${path}`);
      const panelCount = await page.locator('[data-testid="interactive-district-panel"]').count();
      const provenanceCount = await page.locator('[data-testid="district-provenance"]').count();
      const insightCount = await page.locator('[data-testid="district-insight-text"]').count();
      if (panelCount !== 1 || provenanceCount !== 1 || insightCount !== 1) {
        throw new Error(`${path} missing panel/provenance/insight: ${JSON.stringify({ panelCount, provenanceCount, insightCount })}`);
      }
      results.push({ path, panelCount, provenanceCount, insightCount });
    }

    await gotoWithPanel(page, `${baseUrl}/heat-island`);
    const before = await page.locator('[data-testid="interactive-district-panel"]').innerText();
    const clickPoints = [[620, 430], [700, 420], [560, 500], [760, 500], [650, 350]];
    let after = before;
    for (const [x, y] of clickPoints) {
      await page.mouse.click(x, y);
      await page.waitForTimeout(900);
      after = await page.locator('[data-testid="interactive-district-panel"]').innerText();
      if (after !== before) break;
    }
    if (after === before) {
      throw new Error("Heat Island panel did not update after clicking district polygon");
    }
    results.push({ path: "/heat-island click", changedAfterClick: true });
  } finally {
    await browser.close();
    if (server) {
      if (process.platform === "win32") {
        spawn("taskkill", ["/pid", String(server.pid), "/T", "/F"], { stdio: "ignore" });
      } else {
        server.kill("SIGTERM");
      }
      await delay(500);
    }
  }

  console.log(JSON.stringify(results, null, 2));
}

runSmoke().catch((error) => {
  console.error(error);
  process.exit(1);
});
