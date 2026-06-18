import { mkdir, writeFile } from 'node:fs/promises';
import http from 'node:http';
import https from 'node:https';
import path from 'node:path';
import { performance } from 'node:perf_hooks';

const DEFAULT_BASE_URL = 'http://localhost:3000';
const DEFAULT_OUTPUT = path.join('.next', 'perf-baseline.json');
const DEFAULT_ROUTES = [
  '/',
  '/accessibility',
  '/air-quality',
  '/decision-support',
  '/district-analysis',
  '/flood-risk',
  '/green-space',
  '/heat-island',
  '/land-cover-change',
  '/ndvi',
  '/nighttime-lights',
  '/population',
  '/rainfall',
  '/traffy',
  '/urban-expansion',
];

function printHelp() {
  console.log(`Usage: node scripts/perf-baseline.mjs [options]

Options:
  --base-url <url>       Base URL to test. Defaults to ${DEFAULT_BASE_URL}
  --route <path>         Route path to test. Can be used more than once.
  --routes <paths>       Comma-separated route paths to test.
  --output <path>        JSON report path. Defaults to ${DEFAULT_OUTPUT}
  --timeout <ms>         Per-route timeout. Defaults to 30000.
  --help                 Show this help.

Examples:
  npm run perf:baseline
  npm run perf:baseline -- --base-url http://localhost:3000 --routes /,/air-quality
  npm run perf:baseline -- --route / --route /district-analysis
`);
}

function readFlagValue(args, index, flag) {
  const inlinePrefix = `${flag}=`;
  const current = args[index];

  if (current.startsWith(inlinePrefix)) {
    return { value: current.slice(inlinePrefix.length), nextIndex: index };
  }

  const next = args[index + 1];
  if (!next || next.startsWith('--')) {
    throw new Error(`Missing value for ${flag}`);
  }

  return { value: next, nextIndex: index + 1 };
}

function normalizeRoute(route) {
  const trimmed = route.trim();

  if (!trimmed) {
    return null;
  }

  if (/^https?:\/\//i.test(trimmed)) {
    const parsed = new URL(trimmed);
    return `${parsed.pathname}${parsed.search}`;
  }

  return trimmed.startsWith('/') ? trimmed : `/${trimmed}`;
}

function parseArgs(argv) {
  const options = {
    baseUrl: process.env.PERF_BASE_URL || DEFAULT_BASE_URL,
    output: DEFAULT_OUTPUT,
    routes: [],
    timeoutMs: 30_000,
  };

  for (let index = 0; index < argv.length; index += 1) {
    const arg = argv[index];

    if (arg === '--help' || arg === '-h') {
      options.help = true;
      continue;
    }

    if (arg === '--base-url' || arg.startsWith('--base-url=')) {
      const result = readFlagValue(argv, index, '--base-url');
      options.baseUrl = result.value;
      index = result.nextIndex;
      continue;
    }

    if (arg === '--output' || arg.startsWith('--output=')) {
      const result = readFlagValue(argv, index, '--output');
      options.output = result.value;
      index = result.nextIndex;
      continue;
    }

    if (arg === '--timeout' || arg.startsWith('--timeout=')) {
      const result = readFlagValue(argv, index, '--timeout');
      const timeoutMs = Number.parseInt(result.value, 10);
      if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) {
        throw new Error('--timeout must be a positive integer in milliseconds');
      }
      options.timeoutMs = timeoutMs;
      index = result.nextIndex;
      continue;
    }

    if (arg === '--route' || arg.startsWith('--route=')) {
      const result = readFlagValue(argv, index, '--route');
      options.routes.push(result.value);
      index = result.nextIndex;
      continue;
    }

    if (arg === '--routes' || arg.startsWith('--routes=')) {
      const result = readFlagValue(argv, index, '--routes');
      options.routes.push(...result.value.split(','));
      index = result.nextIndex;
      continue;
    }

    if (arg.startsWith('--')) {
      throw new Error(`Unknown option: ${arg}`);
    }

    options.routes.push(arg);
  }

  const normalizedRoutes = options.routes.map(normalizeRoute).filter(Boolean);

  return {
    ...options,
    baseUrl: new URL(options.baseUrl).toString().replace(/\/$/, ''),
    routes: normalizedRoutes.length > 0 ? [...new Set(normalizedRoutes)] : DEFAULT_ROUTES,
  };
}

function requestUrl(url, timeoutMs, redirectCount = 0) {
  return new Promise((resolve) => {
    const target = new URL(url);
    const client = target.protocol === 'https:' ? https : http;
    const startedAt = performance.now();
    let transferBytes = 0;

    const request = client.request(
      target,
      {
        headers: {
          Accept: 'text/html,application/xhtml+xml,application/json;q=0.9,*/*;q=0.8',
          'Accept-Encoding': 'identity',
          'User-Agent': 'bkk-perf-baseline/1.0',
        },
      },
      async (response) => {
        const location = response.headers.location;
        const status = response.statusCode ?? null;

        if (location && status && status >= 300 && status < 400 && redirectCount < 5) {
          response.resume();
          const redirectedUrl = new URL(location, target).toString();
          resolve(requestUrl(redirectedUrl, timeoutMs, redirectCount + 1));
          return;
        }

        try {
          for await (const chunk of response) {
            transferBytes += chunk.length;
          }
        } catch (error) {
          resolve({
            status,
            ok: false,
            elapsedMs: roundMs(performance.now() - startedAt),
            transferBytes,
            contentLength: parseContentLength(response.headers['content-length']),
            cacheControl: headerValue(response.headers['cache-control']),
            error: error.message,
          });
          return;
        }

        resolve({
          status,
          ok: status !== null && status >= 200 && status < 400,
          elapsedMs: roundMs(performance.now() - startedAt),
          transferBytes,
          contentLength: parseContentLength(response.headers['content-length']),
          cacheControl: headerValue(response.headers['cache-control']),
        });
      }
    );

    request.on('timeout', () => {
      request.destroy(new Error(`Timed out after ${timeoutMs}ms`));
    });

    request.on('error', (error) => {
      resolve({
        status: null,
        ok: false,
        elapsedMs: roundMs(performance.now() - startedAt),
        transferBytes,
        contentLength: null,
        cacheControl: null,
        error: error.message,
      });
    });

    request.setTimeout(timeoutMs);
    request.end();
  });
}

function parseContentLength(value) {
  const rawValue = headerValue(value);
  if (!rawValue) {
    return null;
  }

  const parsed = Number.parseInt(rawValue, 10);
  return Number.isFinite(parsed) ? parsed : null;
}

function headerValue(value) {
  if (Array.isArray(value)) {
    return value.join(', ');
  }

  return value ?? null;
}

function roundMs(value) {
  return Math.round(value * 100) / 100;
}

function summarize(measurements) {
  const elapsedValues = measurements.map((measurement) => measurement.elapsedMs);
  const totalElapsed = elapsedValues.reduce((sum, elapsedMs) => sum + elapsedMs, 0);

  return {
    total: measurements.length,
    ok: measurements.filter((measurement) => measurement.ok).length,
    failed: measurements.filter((measurement) => !measurement.ok).length,
    minMs: roundMs(Math.min(...elapsedValues)),
    maxMs: roundMs(Math.max(...elapsedValues)),
    avgMs: roundMs(totalElapsed / measurements.length),
  };
}

async function main() {
  const options = parseArgs(process.argv.slice(2));

  if (options.help) {
    printHelp();
    return;
  }

  const measurements = [];

  for (const route of options.routes) {
    const url = new URL(route, `${options.baseUrl}/`).toString();
    const result = await requestUrl(url, options.timeoutMs);
    const measurement = { route, url, ...result };
    measurements.push(measurement);

    const status = measurement.status ?? 'ERR';
    const size = measurement.transferBytes === null ? '-' : `${measurement.transferBytes}b`;
    console.log(`${status} ${measurement.elapsedMs}ms ${size} ${route}`);
  }

  const report = {
    generatedAt: new Date().toISOString(),
    baseUrl: options.baseUrl,
    timeoutMs: options.timeoutMs,
    routes: options.routes,
    summary: summarize(measurements),
    measurements,
  };

  await mkdir(path.dirname(options.output), { recursive: true });
  await writeFile(options.output, `${JSON.stringify(report, null, 2)}\n`);

  console.log(`Wrote ${options.output}`);
}

main().catch((error) => {
  console.error(error.message);
  process.exitCode = 1;
});
