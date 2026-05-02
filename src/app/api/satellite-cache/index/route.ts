import { NextResponse } from "next/server";

const R2_PUBLIC_BASE_URL    = process.env.R2_PUBLIC_BASE_URL;
const SATELLITE_CACHE_PREFIX = process.env.SATELLITE_CACHE_PREFIX || "satellite-cache";

const EMPTY_INDEX = {
  latest_month: null,
  latest_year:  null,
  monthly:      [] as string[],
  yearly:       [] as string[],
};

export async function GET() {
  if (!R2_PUBLIC_BASE_URL) {
    // R2 not configured — return empty index so frontend degrades gracefully
    return NextResponse.json(EMPTY_INDEX, {
      headers: { "Cache-Control": "public, s-maxage=60" },
    });
  }

  const url = `${R2_PUBLIC_BASE_URL.replace(/\/$/, "")}/${SATELLITE_CACHE_PREFIX}/index.json`;

  try {
    const r2Res = await fetch(url, { next: { revalidate: 300 } });
    if (!r2Res.ok) return NextResponse.json(EMPTY_INDEX);

    const data = await r2Res.json();
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=60" },
    });
  } catch {
    return NextResponse.json(EMPTY_INDEX);
  }
}
