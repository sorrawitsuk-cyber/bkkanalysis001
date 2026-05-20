import { NextResponse } from "next/server";

// Temporary diagnostic route — remove after confirming env vars are set.
export const dynamic = "force-dynamic";

const REQUIRED_VARS = [
  "NEXT_PUBLIC_SUPABASE_URL",
  "NEXT_PUBLIC_SUPABASE_ANON_KEY",
  "SUPABASE_SERVICE_ROLE_KEY",
  "GEE_CLIENT_EMAIL",
  "GEE_PRIVATE_KEY",
  "GEE_PROJECT_ID",
  "R2_PUBLIC_BASE_URL",
  "R2_ACCOUNT_ID",
  "R2_ACCESS_KEY_ID",
  "R2_SECRET_ACCESS_KEY",
  "R2_BUCKET",
  "SATELLITE_CACHE_PREFIX",
];

export async function GET() {
  const result: Record<string, string> = {};
  for (const key of REQUIRED_VARS) {
    const val = process.env[key];
    if (!val) {
      result[key] = "❌ MISSING";
    } else if (key.includes("KEY") || key.includes("SECRET") || key.includes("ROLE")) {
      result[key] = `✅ set (${val.length} chars)`;
    } else {
      // safe to show partial value for URLs / non-secret vars
      result[key] = `✅ ${val.slice(0, 40)}${val.length > 40 ? "…" : ""}`;
    }
  }
  return NextResponse.json(result, { status: 200 });
}
