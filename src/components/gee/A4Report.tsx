/* eslint-disable @typescript-eslint/no-explicit-any */
import { MapPin } from "lucide-react";
import { formatRai } from "@/lib/ndvi";
import { getLSTLegendItems } from "@/lib/lst";

const MONTHS_TH = ["ม.ค.","ก.พ.","มี.ค.","เม.ย.","พ.ค.","มิ.ย.","ก.ค.","ส.ค.","ก.ย.","ต.ค.","พ.ย.","ธ.ค."];

export interface A4ReportProps {
  type: "lst" | "ndvi";
  summary: any;
  geojsonData?: any;
  activeDistrict: string;
  selectedYear: number;
  compareMode: boolean;
  compareYear: number;
  mapSnapshot: string | null;
  mapMode?: string;
}

function pct(value: number, min: number, max: number) {
  return Math.max(4, Math.min(100, ((value - min) / Math.max(0.001, max - min)) * 100));
}

export default function A4Report({
  type, summary, geojsonData, activeDistrict, selectedYear,
  compareMode, compareYear, mapSnapshot, mapMode,
}: A4ReportProps) {
  if (!summary) return null;

  const isLST = type === "lst";
  const accent      = isLST ? "#ea580c" : "#16a34a";
  const accentLight = isLST ? "#fff7ed" : "#f0fdf4";
  const accentBorder= isLST ? "#fed7aa" : "#bbf7d0";
  const accentText  = isLST ? "#c2410c" : "#15803d";

  const now         = new Date();
  const currentYear = now.getFullYear();
  const currentDate = now.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
  const periodLabel = selectedYear === currentYear
    ? `1 ม.ค. – ${now.toLocaleDateString("th-TH", { day: "2-digit", month: "short" })} ${selectedYear} (YTD)`
    : `1 ม.ค. – 31 ธ.ค. ${selectedYear}`;

  // ── LST data ──────────────────────────────────────────────────────────────
  const avgTemp      = Number(summary.averageTemp  ?? 0);
  const maxTemp      = Number(summary.maxTemp      ?? 0);
  const avgDelta     = Number(summary.avgDelta     ?? 0);
  const baselineAvg  = Number(summary.baselineAverageTemp ?? 0);
  const lstRanking   = (summary.ranking ?? []).slice(0, 8) as [string, number][];
  const monthlyTrend = (summary.monthlyTrend        ?? []) as number[];
  const baselineMo   = (summary.baselineMonthlyTrend ?? []) as number[];
  const yearlyTrend  = (summary.yearlyTrend          ?? []) as [number, number][];
  const highLstCount = (geojsonData?.features ?? []).filter(
    (f: any) => Number(f?.properties?.mean_lst) >= 36
  ).length;

  // ── NDVI data ─────────────────────────────────────────────────────────────
  const ns           = summary.ndviSummary ?? {};
  const avgNdvi      = ns.avg_ndvi_mean != null ? Number(ns.avg_ndvi_mean) : null;
  const totalGreen   = ns.total_green_area_rai != null ? Number(ns.total_green_area_rai) : null;
  const bestDistrict = ns.best_district?.district_name  ?? ns.best_district?.name_th  ?? "ไม่มีข้อมูล";
  const worstDistrict= ns.worst_district?.district_name ?? ns.worst_district?.name_th ?? "ไม่มีข้อมูล";
  const greenTrend   = (summary.greenAreaTrend ?? []).map(([y, v]: any) => [Number(y), Number(v)]) as [number, number][];

  const ndviRanking  = (geojsonData?.features ?? [])
    .map((f: any) => ({ name: f.properties?.name_th ?? "", rai: Number(f.properties?.green_area_rai ?? 0) }))
    .filter((r: any) => r.name && r.rai > 0)
    .sort((a: any, b: any) => b.rai - a.rai)
    .slice(0, 8) as { name: string; rai: number }[];

  // ── KPI cards ─────────────────────────────────────────────────────────────
  const kpis = isLST
    ? compareMode
      ? [
          { label: "เปรียบเทียบ", value: `${compareYear} vs ${selectedYear}` },
          { label: "ส่วนต่าง LST เฉลี่ย", value: `${avgDelta >= 0 ? "+" : ""}${avgDelta.toFixed(2)}°C`, hi: true },
          { label: "LST ปัจจุบัน", value: `${avgTemp.toFixed(2)}°C`, hi: true },
          { label: "LST ปีฐาน", value: `${baselineAvg.toFixed(2)}°C` },
        ]
      : [
          { label: "LST เฉลี่ย กทม.", value: `${avgTemp.toFixed(2)}°C`, hi: true },
          { label: "LST สูงสุด", value: `${maxTemp.toFixed(2)}°C`, hi: true },
          { label: "เขต LST > 36°C", value: `${highLstCount} เขต` },
          { label: "ช่วงข้อมูล", value: periodLabel },
        ]
    : [
        { label: "NDVI เฉลี่ย กทม.", value: avgNdvi !== null ? avgNdvi.toFixed(3) : "—", hi: true },
        { label: "พื้นที่สีเขียวรวม", value: formatRai(totalGreen), hi: true },
        { label: "เขตสีเขียวสูงสุด", value: bestDistrict },
        { label: "เขตเร่งด่วน", value: worstDistrict },
      ];

  // ── Chart scales ──────────────────────────────────────────────────────────
  const allMonthly = [...monthlyTrend, ...baselineMo].filter(Boolean).map(Number);
  const mMin = Math.floor(Math.min(30, ...allMonthly) - 1);
  const mMax = Math.ceil(Math.max(40, ...allMonthly) + 1);

  const yearlyVals = yearlyTrend.map(([, v]) => v);
  const yMin = Math.floor(Math.min(32, ...yearlyVals) - 1);
  const yMax = Math.ceil(Math.max(40, ...yearlyVals) + 1);

  const greenVals = greenTrend.map(([, v]) => v);
  const gMax = Math.max(1, ...greenVals) * 1.05;

  // ── Legend items ──────────────────────────────────────────────────────────
  const legendItems = isLST
    ? compareMode
      ? [
          { color: "#2166AC", label: "เย็นลงมาก < -1.5°C" },
          { color: "#67A9CF", label: "-1.5 ถึง -0.5°C" },
          { color: "#E8E8E8", label: "ใกล้เดิม" },
          { color: "#EF8A62", label: "+0.5 ถึง +1.5°C" },
          { color: "#B2182B", label: "ร้อนขึ้นมาก > +1.5°C" },
        ]
      : getLSTLegendItems().map((i) => ({ color: i.color, label: `${i.label} ${i.range}°C` }))
    : [
        { color: "#8c2d04", label: "เขียวน้อยมาก < 0.20" },
        { color: "#d94801", label: "เขียวน้อย 0.20–0.30" },
        { color: "#f6e05e", label: "ปานกลาง 0.30–0.40" },
        { color: "#68d391", label: "ดี 0.40–0.50" },
        { color: "#238b45", label: "ดีมาก > 0.50" },
      ];

  // ── Insight text ──────────────────────────────────────────────────────────
  const insight = isLST
    ? compareMode
      ? `เมื่อเปรียบเทียบปี ${selectedYear} กับปีฐาน ${compareYear}: ${activeDistrict} มีอุณหภูมิพื้นผิวเฉลี่ยเปลี่ยนแปลง ${avgDelta >= 0 ? "+" : ""}${avgDelta.toFixed(2)}°C เขตที่น่ากังวลมากที่สุดคือ ${lstRanking[0]?.[0] ?? "—"} แนวโน้มชี้ให้เห็นทิศทางของเกาะความร้อนเมืองในระยะยาว ควรเร่งเพิ่มพืชพรรณและปรับวัสดุพื้นผิวในเขตที่มีค่าสูงขึ้นต่อเนื่อง`
      : `ปี ${selectedYear}: ${activeDistrict} มีค่า LST เฉลี่ย ${avgTemp.toFixed(2)}°C สูงสุด ${maxTemp.toFixed(2)}°C มี ${highLstCount} เขตที่มี LST เกิน 36°C เขตที่ร้อนที่สุดคือ ${lstRanking[0]?.[0] ?? "—"} ควรพิจารณาเพิ่มพื้นที่สีเขียว ร่มเงา และพื้นผิวสะท้อนแสงในบริเวณที่มีค่า LST สูง เพื่อลดผลกระทบจากปรากฏการณ์เกาะความร้อนเมือง (UHI)`
    : `ปี ${selectedYear}: ${activeDistrict} มีค่า NDVI เฉลี่ย ${avgNdvi !== null ? avgNdvi.toFixed(3) : "—"} และพื้นที่สีเขียวรวมประมาณ ${formatRai(totalGreen)} เขตที่มีพื้นที่สีเขียวสูงสุดคือ ${bestDistrict} ส่วนเขตที่ต้องเร่งพัฒนาพื้นที่สีเขียวคือ ${worstDistrict} ข้อมูลจากดาวเทียม Sentinel-2 ผ่านการคัดกรองเมฆและตัดพื้นที่น้ำออก (JRC water mask) เพื่อให้ค่าสะท้อนพื้นที่ดินจริง ไม่ถูกบิดเบือนจากแม่น้ำและคลอง`;

  // ── Styles ────────────────────────────────────────────────────────────────
  const s = {
    root: { width: 794, height: 1123, padding: 28, fontFamily: "'Inter', 'Noto Sans Thai', sans-serif", background: "#fff", color: "#0f172a", display: "flex", flexDirection: "column" as const, overflow: "hidden", position: "absolute" as const, top: 0, left: -9999, zIndex: -1 },
    cell: (hi: boolean) => ({
      background: hi ? accentLight : "#f8fafc",
      border: `1px solid ${hi ? accentBorder : "#e2e8f0"}`,
      borderRadius: 8, padding: "8px 10px",
    }),
    bar: (color: string, h: number) => ({ width: "100%", borderRadius: "2px 2px 0 0", background: color, height: `${h}%`, minHeight: 2 }),
  };

  return (
    <div id="a4-report" style={s.root}>

      {/* ── HEADER ── */}
      <div style={{ borderBottom: "2.5px solid #0f172a", paddingBottom: 8, marginBottom: 10, flexShrink: 0 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8 }}>
          <div>
            <div style={{ fontSize: 15, fontWeight: 900, lineHeight: 1.2 }}>
              {isLST ? "รายงานสรุปสถานการณ์เกาะความร้อนเมือง" : "รายงานสรุปพื้นที่สีเขียวเมือง"} · {activeDistrict}
            </div>
            <div style={{ fontSize: 8, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.1em", marginTop: 3 }}>
              {isLST ? "Bangkok Urban Heat Island · Land Surface Temperature (LST) · Landsat 8/9 C2 L2" : "Bangkok Urban Green Space · NDVI · Sentinel-2 SR Harmonized"}
              {compareMode ? `  ·  เปรียบเทียบปี ${compareYear} vs ${selectedYear}` : `  ·  ปี ${selectedYear}`}
            </div>
          </div>
          <div style={{ fontSize: 8, color: "#64748b", textAlign: "right", flexShrink: 0, lineHeight: 1.6 }}>
            <div>วันที่ออกรายงาน: {currentDate}</div>
            <div>พื้นที่วิเคราะห์: {activeDistrict}</div>
          </div>
        </div>
      </div>

      {/* ── KPI CARDS ── */}
      <div style={{ display: "grid", gridTemplateColumns: "repeat(4,1fr)", gap: 8, marginBottom: 10, flexShrink: 0 }}>
        {kpis.map((k, i) => (
          <div key={i} style={s.cell(!!k.hi)}>
            <div style={{ fontSize: 7.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", marginBottom: 4 }}>{k.label}</div>
            <div style={{ fontSize: 14, fontWeight: 900, color: k.hi ? accentText : "#1e293b", lineHeight: 1.1 }}>{k.value}</div>
          </div>
        ))}
      </div>

      {/* ── MAP + RANKING ── */}
      <div style={{ display: "flex", gap: 12, height: 280, marginBottom: 10, flexShrink: 0 }}>

        {/* Map — object-contain keeps aspect ratio intact */}
        <div style={{ width: 430, height: 280, flexShrink: 0, background: "#0f172a", borderRadius: 10, overflow: "hidden", border: "1px solid #cbd5e1", position: "relative" }}>
          {mapSnapshot ? (
            <img
              src={mapSnapshot}
              alt="map"
              style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "center", display: "block" }}
            />
          ) : (
            <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", color: "#64748b" }}>
              <MapPin style={{ width: 28, height: 28, opacity: 0.4 }} />
              <div style={{ fontSize: 9, marginTop: 6 }}>ไม่สามารถจับภาพแผนที่ได้</div>
            </div>
          )}
          {/* North arrow */}
          <div style={{ position: "absolute", top: 8, right: 8, background: "rgba(255,255,255,0.92)", borderRadius: 4, padding: "3px 5px", display: "flex", flexDirection: "column", alignItems: "center", boxShadow: "0 1px 3px rgba(0,0,0,.2)" }}>
            <svg width="10" height="10" viewBox="0 0 24 24" fill="#0f172a"><polygon points="12 2 16 22 12 17 8 22 12 2" /></svg>
            <span style={{ fontSize: 7, fontWeight: 900, color: "#0f172a" }}>N</span>
          </div>
          {/* Mode badge */}
          <div style={{ position: "absolute", bottom: 7, left: 8, background: "rgba(0,0,0,0.65)", color: "#fff", borderRadius: 3, padding: "2px 6px", fontSize: 7 }}>
            {mapMode === "idw" || mapMode === "satellite-cache" ? "Satellite / GEE Mode" : "District Mode"}
          </div>
          {/* Scale bar */}
          <div style={{ position: "absolute", bottom: 7, right: 8, background: "rgba(255,255,255,0.9)", borderRadius: 3, padding: "2px 5px", fontSize: 7, color: "#334155", display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 22, height: 2, background: "#334155" }} /> 10 km
          </div>
        </div>

        {/* Ranking */}
        <div style={{ flex: 1, overflow: "hidden", display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 9, fontWeight: 900, textTransform: "uppercase", letterSpacing: "0.08em", color: "#1e293b", borderLeft: `4px solid ${accent}`, paddingLeft: 7, marginBottom: 8 }}>
            {isLST ? (compareMode ? "เขตอุณหภูมิเพิ่มขึ้นมากสุด" : "อันดับเขตที่ร้อนสุด") : "อันดับพื้นที่สีเขียวรายเขต"}
          </div>
          <table style={{ width: "100%", fontSize: 9, borderCollapse: "collapse" }}>
            <thead>
              <tr style={{ borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ textAlign: "left", padding: "3px 0", color: "#94a3b8", fontWeight: 700, width: 18 }}>#</th>
                <th style={{ textAlign: "left", padding: "3px 0", color: "#94a3b8", fontWeight: 700 }}>เขต</th>
                <th style={{ textAlign: "right", padding: "3px 0", color: "#94a3b8", fontWeight: 700 }}>{isLST ? (compareMode ? "Δ°C" : "LST (°C)") : "ไร่"}</th>
              </tr>
            </thead>
            <tbody>
              {isLST
                ? lstRanking.map(([d, v], i) => (
                    <tr key={d} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "3px 0", color: "#94a3b8", fontFamily: "monospace" }}>{i + 1}</td>
                      <td style={{ padding: "3px 0", fontWeight: 500, maxWidth: 128, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{d}</td>
                      <td style={{ padding: "3px 0", textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>
                        {compareMode ? (v >= 0 ? `+${v.toFixed(2)}` : v.toFixed(2)) : v.toFixed(2)}
                      </td>
                    </tr>
                  ))
                : ndviRanking.map((r, i) => (
                    <tr key={r.name} style={{ borderBottom: "1px solid #f1f5f9" }}>
                      <td style={{ padding: "3px 0", color: "#94a3b8", fontFamily: "monospace" }}>{i + 1}</td>
                      <td style={{ padding: "3px 0", fontWeight: 500, maxWidth: 120, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{r.name}</td>
                      <td style={{ padding: "3px 0", textAlign: "right", fontFamily: "monospace", fontWeight: 700 }}>{r.rai.toLocaleString("th-TH", { maximumFractionDigits: 0 })}</td>
                    </tr>
                  ))
              }
            </tbody>
          </table>
        </div>
      </div>

      {/* ── CHARTS ── */}
      <div style={{ display: "flex", gap: 12, height: 140, marginBottom: 10, flexShrink: 0 }}>

        {/* Chart 1 */}
        <div style={{ flex: 1, display: "flex", flexDirection: "column" }}>
          <div style={{ fontSize: 7.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>
            {isLST ? `แนวโน้ม LST รายเดือน ปี ${selectedYear}` : "แนวโน้มพื้นที่สีเขียวรายปี (ไร่)"}
          </div>
          <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 2, borderBottom: "1px solid #e2e8f0", borderLeft: "1px solid #e2e8f0", paddingBottom: 2, paddingLeft: 2 }}>
            {isLST
              ? monthlyTrend.map((temp, i) => {
                  const isFuture = selectedYear === currentYear && i > now.getMonth();
                  const p  = pct(temp, mMin, mMax);
                  const bp = pct(baselineMo[i] ?? 0, mMin, mMax);
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                      {!isFuture && (
                        <>
                          <div style={{ fontSize: 6, color: "#94a3b8", marginBottom: 1 }}>{temp.toFixed(0)}</div>
                          {compareMode ? (
                            <div style={{ width: "100%", height: "100%", display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 1 }}>
                              <div style={{ ...s.bar("#94a3b8", bp), width: "42%" }} />
                              <div style={{ ...s.bar(accent, p), width: "42%" }} />
                            </div>
                          ) : (
                            <div style={{ ...s.bar(accent, p), width: "100%" }} />
                          )}
                        </>
                      )}
                      <div style={{ fontSize: 6, color: "#94a3b8", marginTop: 1 }}>{MONTHS_TH[i]}</div>
                    </div>
                  );
                })
              : greenTrend.map(([yr, val], i) => {
                  const p = pct(val, 0, gMax);
                  return (
                    <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                      <div style={{ fontSize: 6, color: "#94a3b8", marginBottom: 1 }}>{(val / 1000).toFixed(0)}k</div>
                      <div style={{ ...s.bar(accent, p), width: "80%" }} />
                      <div style={{ fontSize: 6, color: "#94a3b8", marginTop: 1 }}>&apos;{String(yr).slice(-2)}</div>
                    </div>
                  );
                })
            }
          </div>
        </div>

        {/* Chart 2: yearly LST trend (LST page only) */}
        {isLST && (
          <div style={{ width: 190, display: "flex", flexDirection: "column" }}>
            <div style={{ fontSize: 7.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 5 }}>
              {compareMode ? `LST เฉลี่ย: ${compareYear} vs ${selectedYear}` : "แนวโน้มรายปี (Yearly)"}
            </div>
            <div style={{ flex: 1, display: "flex", alignItems: "flex-end", gap: 2, borderBottom: "1px solid #e2e8f0", borderLeft: "1px solid #e2e8f0", paddingBottom: 2, paddingLeft: 2 }}>
              {compareMode
                ? [
                    { year: compareYear, temp: baselineAvg, color: "#94a3b8" },
                    { year: selectedYear, temp: avgTemp,    color: accent },
                  ].map((item) => {
                    const p = pct(item.temp, yMin, yMax);
                    return (
                      <div key={item.year} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                        <div style={{ fontSize: 6, color: "#94a3b8", marginBottom: 1 }}>{item.temp.toFixed(1)}</div>
                        <div style={{ ...s.bar(item.color, p), width: "60%" }} />
                        <div style={{ fontSize: 6, color: "#94a3b8", marginTop: 1 }}>{item.year}</div>
                      </div>
                    );
                  })
                : yearlyTrend.map(([yr, temp], i) => {
                    const p = pct(temp, yMin, yMax);
                    return (
                      <div key={i} style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "flex-end", height: "100%" }}>
                        <div style={{ fontSize: 6, color: "#94a3b8", marginBottom: 1 }}>{temp.toFixed(1)}</div>
                        <div style={{ ...s.bar(accent, p), width: "100%" }} />
                        <div style={{ fontSize: 6, color: "#94a3b8", marginTop: 1 }}>&apos;{String(yr).slice(-2)}</div>
                      </div>
                    );
                  })
              }
            </div>
          </div>
        )}
      </div>

      {/* ── INSIGHT ── */}
      <div style={{ flex: 1, background: accentLight, border: `1px solid ${accentBorder}`, borderRadius: 8, padding: "10px 12px", marginBottom: 10, overflow: "hidden" }}>
        <div style={{ fontSize: 7.5, fontWeight: 900, color: accentText, textTransform: "uppercase", letterSpacing: "0.08em", marginBottom: 6 }}>
          บทสรุปผู้บริหาร (Executive Insight)
        </div>
        <p style={{ fontSize: 10, color: "#374151", lineHeight: 1.65, margin: 0 }}>{insight}</p>
      </div>

      {/* ── LEGEND ── */}
      <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap", marginBottom: 8, flexShrink: 0 }}>
        <span style={{ fontSize: 7.5, fontWeight: 700, color: "#64748b", textTransform: "uppercase", letterSpacing: "0.06em", flexShrink: 0 }}>สัญลักษณ์:</span>
        {legendItems.map((item, i) => (
          <div key={i} style={{ display: "flex", alignItems: "center", gap: 4 }}>
            <div style={{ width: 12, height: 12, borderRadius: 2, background: item.color, border: "1px solid rgba(0,0,0,0.1)", flexShrink: 0 }} />
            <span style={{ fontSize: 8, color: "#475569" }}>{item.label}</span>
          </div>
        ))}
      </div>

      {/* ── FOOTER ── */}
      <div style={{ borderTop: "1px solid #e2e8f0", paddingTop: 6, display: "flex", justifyContent: "space-between", fontSize: 7.5, color: "#94a3b8", flexShrink: 0 }}>
        <span>{isLST ? "Landsat 8/9 C2 L2 · LST · JRC water mask" : "Sentinel-2 SR Harmonized · NDVI · JRC water mask"} · Bangkok Urban Analytics Dashboard</span>
        <span>ค่าจากดาวเทียมเพื่อเปรียบเทียบเชิงพื้นที่ ไม่ใช่ข้อมูลราชการ</span>
      </div>

    </div>
  );
}
