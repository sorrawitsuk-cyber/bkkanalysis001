import { NextResponse } from "next/server";
import { BigQuery } from "@google-cloud/bigquery";
import * as turf from "@turf/turf";
import geojson from "@/data/bkk_districts.json";

export const dynamic = "force-dynamic";

const FLOOD_KEYWORDS = [
  "น้ำท่วม",
  "น้ำขัง",
  "น้ำรอระบาย",
  "ระบายน้ำ",
  "ท่อ",
  "ท่อตัน",
  "ฝาท่อ",
  "บ่อพัก",
  "คลอง",
  "น้ำเน่า",
];

const OPEN_STATES = ["รอรับเรื่อง", "กำลังดำเนินการ", "ส่งต่อ(ใหม่)", "ส่งต่อ"];

const districtAreaSqKm = new Map<string, number>(
  (geojson.features as any[]).map((feature: any) => [
    feature.properties.name_th,
    turf.area(feature) / 1_000_000,
  ]),
);

function parseCredentials() {
  if (!process.env.BQ_CREDENTIALS) return null;
  try {
    return JSON.parse(process.env.BQ_CREDENTIALS);
  } catch {
    return null;
  }
}

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const year = searchParams.get("year") ? parseInt(searchParams.get("year")!, 10) : null;
  const recentDays = Math.max(30, Math.min(3650, parseInt(searchParams.get("recentDays") || "365", 10)));
  const pointLimit = Math.max(0, Math.min(3000, parseInt(searchParams.get("pointLimit") || "1200", 10)));

  const credentials = parseCredentials();
  if (!process.env.BQ_PROJECT_ID || !process.env.BQ_DATASET || !credentials) {
    return NextResponse.json(
      {
        source: "bigquery",
        status: "not_configured",
        message: "BigQuery env vars are not configured.",
        geojson: { type: "FeatureCollection", features: [] },
        summary: {
          totalFloodReports: 0,
          recentFloodReports: 0,
          unresolvedFloodReports: 0,
          recentDays,
          byDistrict: [],
          coverage: null,
          method:
            "Traffy flood evidence is unavailable because BigQuery credentials are not configured.",
        },
      },
      { status: 200 },
    );
  }

  try {
    const bq = new BigQuery({ projectId: process.env.BQ_PROJECT_ID, credentials });
    const table = `\`${process.env.BQ_PROJECT_ID}.${process.env.BQ_DATASET}.traffy_complaints\``;
    const keywordPattern = FLOOD_KEYWORDS.join("|");

    const query = `
      WITH deduped AS (
        SELECT *
        FROM ${table}
        QUALIFY ROW_NUMBER() OVER (
          PARTITION BY ticket_id
          ORDER BY COALESCE(ingested_at, created_at) DESC
        ) = 1
      ),
      flood_filtered AS (
        SELECT *
        FROM deduped
        WHERE
          (@year IS NULL OR EXTRACT(YEAR FROM created_at AT TIME ZONE 'Asia/Bangkok') = @year)
          AND (
            problem_type = 'น้ำท่วม/ระบายน้ำ'
            OR REGEXP_CONTAINS(IFNULL(description, ''), @keyword_pattern)
            OR REGEXP_CONTAINS(IFNULL(address, ''), @keyword_pattern)
          )
      )
      SELECT
        (SELECT COUNT(*) FROM flood_filtered) AS total_flood_reports,
        (SELECT COUNT(*) FROM flood_filtered
         WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @recent_days DAY)
        ) AS recent_flood_reports,
        (SELECT COUNT(*) FROM flood_filtered
         WHERE state IN UNNEST(@open_states)
        ) AS unresolved_flood_reports,
        (SELECT MIN(created_at) FROM flood_filtered) AS min_created_at,
        (SELECT MAX(created_at) FROM flood_filtered) AS max_created_at,

        (SELECT ARRAY_AGG(STRUCT(
            district,
            total,
            recent,
            unresolved
          ) ORDER BY recent DESC, total DESC LIMIT 50)
         FROM (
           SELECT
             district,
             COUNT(*) AS total,
             COUNTIF(created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL @recent_days DAY)) AS recent,
             COUNTIF(state IN UNNEST(@open_states)) AS unresolved
           FROM flood_filtered
           WHERE district IS NOT NULL AND district != 'ไม่ระบุ'
           GROUP BY district
         )
        ) AS by_district,

        (SELECT ARRAY_AGG(STRUCT(
            ticket_id,
            district,
            problem_type,
            state,
            lon,
            lat,
            description,
            address,
            photo_url,
            created_at
          ) ORDER BY created_at DESC LIMIT @point_limit)
         FROM flood_filtered
         WHERE lon IS NOT NULL
           AND lat IS NOT NULL
           AND lon BETWEEN 100.329 AND 100.935
           AND lat BETWEEN 13.494 AND 13.956
        ) AS points
    `;

    const [rows] = await bq.query({
      query,
      params: {
        year,
        recent_days: recentDays,
        point_limit: pointLimit,
        keyword_pattern: keywordPattern,
        open_states: OPEN_STATES,
      },
      types: {
        year: "INT64",
        recent_days: "INT64",
        point_limit: "INT64",
        keyword_pattern: "STRING",
        open_states: ["STRING"],
      },
      parameterMode: "NAMED",
      location: "asia-southeast1",
    });

    const row = rows?.[0] || {};
    const byDistrict = (row.by_district || []).map((item: any) => {
      const areaSqKm = districtAreaSqKm.get(item.district) ?? null;
      const total = Number(item.total || 0);
      const recent = Number(item.recent || 0);
      const unresolved = Number(item.unresolved || 0);
      return {
        district: item.district,
        total,
        recent,
        unresolved,
        area_sqkm: areaSqKm,
        reports_per_sqkm: areaSqKm ? total / areaSqKm : null,
        recent_reports_per_sqkm: areaSqKm ? recent / areaSqKm : null,
        unresolved_ratio: total > 0 ? unresolved / total : null,
      };
    });

    const features = (row.points || []).map((point: any) => ({
      type: "Feature",
      properties: {
        ticket_id: point.ticket_id,
        district: point.district,
        problem_type: point.problem_type,
        state: point.state,
        description: point.description,
        address: point.address,
        photo_url: point.photo_url,
        timestamp: point.created_at?.value ?? point.created_at,
      },
      geometry: { type: "Point", coordinates: [point.lon, point.lat] },
    }));

    return NextResponse.json(
      {
        source: "bigquery",
        status: "ok",
        geojson: { type: "FeatureCollection", features },
        summary: {
          totalFloodReports: Number(row.total_flood_reports || 0),
          recentFloodReports: Number(row.recent_flood_reports || 0),
          unresolvedFloodReports: Number(row.unresolved_flood_reports || 0),
          recentDays,
          byDistrict,
          coverage: {
            minCreatedAt: row.min_created_at?.value ?? row.min_created_at ?? null,
            maxCreatedAt: row.max_created_at?.value ?? row.max_created_at ?? null,
          },
          method:
            "Filtered deduplicated Traffy records where category is น้ำท่วม/ระบายน้ำ or text contains flood/drainage keywords; this is human-reported incident evidence, not hydraulic flood simulation.",
        },
      },
      {
        headers: { "Cache-Control": "public, s-maxage=300, stale-while-revalidate=120" },
      },
    );
  } catch (error: any) {
    console.error("Flood Traffy API error:", error);
    return NextResponse.json({ error: String(error?.message || error) }, { status: 500 });
  }
}
