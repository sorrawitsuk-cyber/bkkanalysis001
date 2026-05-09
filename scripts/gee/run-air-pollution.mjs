#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import dotenv from "dotenv";

const root = process.cwd();
const envPath = path.join(root, ".env.local");
const parsed = fs.existsSync(envPath) ? dotenv.config({ path: envPath, quiet: true }).parsed ?? {} : {};
const env = { ...process.env, ...parsed };

env.SUPABASE_URL ||= env.NEXT_PUBLIC_SUPABASE_URL;
env.SUPABASE_SERVICE_KEY ||= env.SUPABASE_SERVICE_ROLE_KEY;

if (!env.GEE_SERVICE_ACCOUNT_JSON && env.GEE_CLIENT_EMAIL && env.GEE_PRIVATE_KEY) {
  env.GEE_SERVICE_ACCOUNT_JSON = JSON.stringify({
    type: "service_account",
    project_id: env.GEE_PROJECT_ID,
    private_key: env.GEE_PRIVATE_KEY.replace(/\\n/g, "\n"),
    client_email: env.GEE_CLIENT_EMAIL,
    auth_uri: "https://accounts.google.com/o/oauth2/auth",
    token_uri: "https://oauth2.googleapis.com/token",
  });
}

const missing = ["GEE_SERVICE_ACCOUNT_JSON", "SUPABASE_URL", "SUPABASE_SERVICE_KEY"].filter((key) => !env[key]);
if (missing.length > 0) {
  console.error(`Missing required env: ${missing.join(", ")}`);
  process.exit(1);
}

const python = env.PYTHON_BIN || "python";
const args = ["scripts/gee/process-air-pollution.py", ...process.argv.slice(2)];
const result = spawnSync(python, args, { stdio: "inherit", env });

if (result.error) {
  console.error(result.error.message);
  console.error("Set PYTHON_BIN to the Python executable that has scripts/gee/requirements.txt installed.");
  process.exit(1);
}

process.exit(result.status ?? 1);
