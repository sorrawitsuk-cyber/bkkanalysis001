import { NextResponse } from "next/server";

const R2_PUBLIC_BASE_URL     = process.env.R2_PUBLIC_BASE_URL;
const SATELLITE_CACHE_PREFIX = process.env.SATELLITE_CACHE_PREFIX || "satellite-cache";

const MONTHLY_RE = /^\d{4}-\d{2}$/;
const YEARLY_RE  = /^\d{4}$/;

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const type   = searchParams.get("type");
  const period = searchParams.get("period");

  if (!type || !period) {
    return NextResponse.json(
      { error: "Query params 'type' and 'period' are required" },
      { status: 400 },
    );
  }
  if (type !== "monthly" && type !== "yearly") {
    return NextResponse.json(
      { error: "type must be 'monthly' or 'yearly'" },
      { status: 400 },
    );
  }
  if (type === "monthly" && !MONTHLY_RE.test(period)) {
    return NextResponse.json(
      { error: "monthly period must be YYYY-MM" },
      { status: 400 },
    );
  }
  if (type === "yearly" && !YEARLY_RE.test(period)) {
    return NextResponse.json(
      { error: "yearly period must be YYYY" },
      { status: 400 },
    );
  }

  if (!R2_PUBLIC_BASE_URL) {
    return NextResponse.json(
      { error: "Satellite cache not configured (R2_PUBLIC_BASE_URL missing)" },
      { status: 503 },
    );
  }

  const base = R2_PUBLIC_BASE_URL.replace(/\/$/, "");
  const url  = `${base}/${SATELLITE_CACHE_PREFIX}/${type}/${period}/metadata.json`;

  try {
    const r2Res = await fetch(url, { next: { revalidate: 300 } });
    if (!r2Res.ok) {
      return NextResponse.json(
        { error: `Metadata not found for ${type}/${period}` },
        { status: 404 },
      );
    }
    const data = await r2Res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
    });
  } catch {
    return NextResponse.json(
      { error: "Failed to fetch metadata from cache" },
      { status: 500 },
    );
  }
}
