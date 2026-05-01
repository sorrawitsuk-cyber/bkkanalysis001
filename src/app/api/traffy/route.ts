import { NextResponse } from 'next/server';
import { BigQuery } from '@google-cloud/bigquery';

export const dynamic = 'force-dynamic';

function getBQClient() {
  const credentials = JSON.parse(process.env.BQ_CREDENTIALS || '{}');
  return new BigQuery({ projectId: process.env.BQ_PROJECT_ID, credentials });
}

export async function GET(request: Request) {
  try {
    const { searchParams } = new URL(request.url);
    const districtFilter  = searchParams.get('district')       || null;
    const categoryFilter  = searchParams.get('category')       || null;
    const groupFilter     = searchParams.get('district_group') || null;

    const bq      = getBQClient();
    const project = process.env.BQ_PROJECT_ID;
    const dataset = process.env.BQ_DATASET;

    const buildQuery = (tbl: string) => `
      WITH filtered AS (
        SELECT *
        FROM ${tbl}
        WHERE created_at >= TIMESTAMP_SUB(CURRENT_TIMESTAMP(), INTERVAL 30 DAY)
          AND (@district       IS NULL OR @district       = 'ทั้งหมด' OR district       = @district)
          AND (@problem_type   IS NULL OR @problem_type   = 'ทั้งหมด' OR problem_type   = @problem_type)
          AND (@district_group IS NULL OR @district_group = 'ทั้งหมด' OR district_group = @district_group)
      )
      SELECT
        (SELECT COUNT(*) FROM filtered) AS total,

        (SELECT ARRAY_AGG(STRUCT(state, cnt AS count) ORDER BY cnt DESC)
         FROM (SELECT state, COUNT(*) AS cnt FROM filtered GROUP BY state)
        ) AS by_state,

        (SELECT ARRAY_AGG(STRUCT(problem_type, cnt AS count) ORDER BY cnt DESC)
         FROM (SELECT problem_type, COUNT(*) AS cnt FROM filtered GROUP BY problem_type ORDER BY cnt DESC LIMIT 10)
        ) AS by_type,

        (SELECT ARRAY_AGG(STRUCT(district, cnt AS total) ORDER BY cnt DESC)
         FROM (SELECT district, COUNT(*) AS cnt FROM filtered GROUP BY district ORDER BY cnt DESC LIMIT 50)
        ) AS by_district,

        (SELECT ARRAY_AGG(STRUCT(district_group, cnt AS total) ORDER BY cnt DESC)
         FROM (SELECT district_group, COUNT(*) AS cnt FROM filtered GROUP BY district_group ORDER BY cnt DESC)
        ) AS by_group,

        (SELECT ARRAY_AGG(STRUCT(day, cnt AS count) ORDER BY day)
         FROM (
           SELECT FORMAT_TIMESTAMP('%m/%d', created_at, 'Asia/Bangkok') AS day, COUNT(*) AS cnt
           FROM filtered WHERE created_at IS NOT NULL GROUP BY 1
         )
        ) AS daily_trend,

        (SELECT ARRAY_AGG(STRUCT(
               ticket_id, district, problem_type, state,
               lon, lat, description, address, photo_url, org, created_at
             ) ORDER BY created_at DESC LIMIT 3000)
         FROM (SELECT * FROM filtered WHERE lon IS NOT NULL AND lat IS NOT NULL ORDER BY created_at DESC LIMIT 3000)
        ) AS points
    `;

    const queryParams = {
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
      parameterMode: 'NAMED' as const,
      location: 'asia-southeast1',
    };

    // Try dedup view first; fall back to raw table if view not yet created.
    // Run `node scripts/setup-bigquery.mjs` once to create the view.
    let rows: any[];
    try {
      const viewTbl = `\`${project}.${dataset}.traffy_complaints_current\``;
      [rows] = await bq.query({ query: buildQuery(viewTbl), ...queryParams });
    } catch (err: any) {
      if (err?.message?.includes('Not found')) {
        console.warn('⚠️  traffy_complaints_current view not found — run setup-bigquery.mjs. Using raw table.');
        const rawTbl = `\`${project}.${dataset}.traffy_complaints\``;
        [rows] = await bq.query({ query: buildQuery(rawTbl), ...queryParams });
      } else {
        throw err;
      }
    }

    if (!rows!?.length) throw new Error('No results from BigQuery');
    const r = rows![0];

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
          timestamp:    p.created_at,
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
