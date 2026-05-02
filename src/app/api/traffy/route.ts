import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';

export const dynamic = 'force-dynamic';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const districtFilter = searchParams.get('district')       || null;
  const categoryFilter = searchParams.get('category')       || null;
  const groupFilter    = searchParams.get('district_group') || null;

  // Guard: validate required env vars
  if (!process.env.BQ_PROJECT_ID || !process.env.BQ_DATASET || !process.env.BQ_CREDENTIALS) {
    return NextResponse.json(
      { error: 'BigQuery env vars not set (BQ_PROJECT_ID, BQ_DATASET, BQ_CREDENTIALS). Add them in Vercel → Settings → Environment Variables.' },
      { status: 503 }
    );
  }

  let credentials: any;
  try {
    credentials = JSON.parse(process.env.BQ_CREDENTIALS);
  } catch {
    return NextResponse.json({ error: 'BQ_CREDENTIALS is not valid JSON' }, { status: 503 });
  }

  try {
    const bq      = new BigQuery({ projectId: process.env.BQ_PROJECT_ID, credentials });
    const project = process.env.BQ_PROJECT_ID;
    const dataset = process.env.BQ_DATASET;

    // Try dedup view first, fall back to raw table
    let tbl = `\`${project}.${dataset}.traffy_complaints_current\``;
    try {
      await bq.query({ query: `SELECT 1 FROM ${tbl} LIMIT 1`, location: 'asia-southeast1' });
    } catch {
      tbl = `\`${project}.${dataset}.traffy_complaints\``;
    }

    const query = `
      WITH filtered AS (
        SELECT *
        FROM ${tbl}
        WHERE (@district       IS NULL OR district       = @district)
          AND (@problem_type   IS NULL OR problem_type   = @problem_type)
          AND (@district_group IS NULL OR district_group = @district_group)
      )
      SELECT
        (SELECT COUNT(*) FROM filtered) AS total,

        (SELECT ARRAY_AGG(STRUCT(state, cnt AS count) ORDER BY cnt DESC)
         FROM (SELECT state, COUNT(*) AS cnt FROM filtered GROUP BY state)
        ) AS by_state,

        (SELECT ARRAY_AGG(STRUCT(problem_type, cnt AS count) ORDER BY cnt DESC LIMIT 10)
         FROM (SELECT problem_type, COUNT(*) AS cnt FROM filtered GROUP BY problem_type ORDER BY cnt DESC LIMIT 10)
        ) AS by_type,

        (SELECT ARRAY_AGG(STRUCT(district, cnt AS total) ORDER BY cnt DESC LIMIT 50)
         FROM (SELECT district, COUNT(*) AS cnt FROM filtered GROUP BY district ORDER BY cnt DESC LIMIT 50)
        ) AS by_district,

        (SELECT ARRAY_AGG(STRUCT(district_group, cnt AS total) ORDER BY cnt DESC)
         FROM (SELECT district_group, COUNT(*) AS cnt FROM filtered GROUP BY district_group ORDER BY cnt DESC)
        ) AS by_group,

        (SELECT ARRAY_AGG(STRUCT(day, cnt AS count) ORDER BY day)
         FROM (
           SELECT FORMAT_TIMESTAMP('%m/%d', created_at, 'Asia/Bangkok') AS day, COUNT(*) AS cnt
           FROM filtered
           WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
           GROUP BY 1
         )
        ) AS daily_trend,

        (SELECT ARRAY_AGG(
           STRUCT(ticket_id, district, problem_type, state, lon, lat, description, address, photo_url, org, created_at)
           ORDER BY created_at DESC LIMIT 3000
         )
         FROM (SELECT * FROM filtered WHERE lon IS NOT NULL AND lat IS NOT NULL ORDER BY created_at DESC LIMIT 3000)
        ) AS points
    `;

    const [rows] = await bq.query({
      query,
      params: {
        district:       districtFilter,
        problem_type:   categoryFilter,
        district_group: groupFilter,
      },
      types: {
        district:       'STRING',
        problem_type:   'STRING',
        district_group: 'STRING',
      },
      parameterMode: 'NAMED',
      location: 'asia-southeast1',
    });

    if (!rows?.length) throw new Error('No results from BigQuery');
    const r = rows[0];

    const features = (r.points || [])
      .filter((p: any) => p.lon && p.lat)
      .map((p: any) => ({
        type: 'Feature',
        properties: {
          ticket_id:    p.ticket_id,
          district:     p.district,
          problem_type: p.problem_type,
          state:        p.state,
          description:  p.description,
          address:      p.address,
          photo_url:    p.photo_url,
          org:          p.org,
          timestamp:    p.created_at?.value ?? p.created_at,
        },
        geometry: { type: 'Point', coordinates: [p.lon, p.lat] },
      }));

    const byState: Record<string, number> = {};
    (r.by_state || []).forEach((s: any) => { byState[s.state] = Number(s.count); });

    return NextResponse.json({
      source: 'bigquery',
      geojson: { type: 'FeatureCollection', features },
      summary: {
        totalApi:        Number(r.total),
        totalFetched:    features.length,
        byState,
        byType:          (r.by_type      || []).map((x: any) => [x.problem_type,   Number(x.count)]),
        byDistrict:      (r.by_district  || []).map((x: any) => [x.district,       Number(x.total)]),
        byDistrictGroup: (r.by_group     || []).map((x: any) => [x.district_group, Number(x.total)]),
        dailyTrend:      (r.daily_trend  || []).map((x: any) => [x.day,            Number(x.count)]),
      },
    }, {
      headers: { 'Cache-Control': 'public, s-maxage=300, stale-while-revalidate=120' },
    });

  } catch (err) {
    console.error('🔴 /api/traffy (BigQuery):', err);
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
