/* eslint-disable @typescript-eslint/no-explicit-any */
import { BarChart3, MapPin } from "lucide-react";
import { formatRai } from "@/lib/ndvi";
import { getLSTLegendItems } from "@/lib/lst";

const MONTHS_TH = ["ม.ค.", "ก.พ.", "มี.ค.", "เม.ย.", "พ.ค.", "มิ.ย.", "ก.ค.", "ส.ค.", "ก.ย.", "ต.ค.", "พ.ย.", "ธ.ค."];

export interface A4ReportProps {
  type: "lst" | "ndvi" | "builtup";
  summary: any;
  geojsonData?: any;
  activeDistrict: string;
  selectedYear: number;
  compareMode: boolean;
  compareYear: number;
  mapSnapshot: string | null;
  mapMode?: string;
}

type RankRow = { name: string; value: number; display: string };

function clampPct(value: number, min: number, max: number) {
  return Math.max(5, Math.min(100, ((value - min) / Math.max(0.001, max - min)) * 100));
}

function formatSigned(value: number, digits: number, suffix = "") {
  return `${value > 0 ? "+" : ""}${value.toFixed(digits)}${suffix}`;
}

function safeNumber(value: unknown, fallback = 0) {
  const num = Number(value);
  return Number.isFinite(num) ? num : fallback;
}

export default function A4Report({
  type,
  summary,
  geojsonData,
  activeDistrict,
  selectedYear,
  compareMode,
  compareYear,
  mapSnapshot,
  mapMode,
}: A4ReportProps) {
  if (!summary) return null;

  const isLST = type === "lst";
  const isBuiltup = type === "builtup";
  const isNDVI = type === "ndvi";
  const accent = isLST ? "#ea580c" : isBuiltup ? "#4f46e5" : "#16a34a";
  const accentSoft = isLST ? "#fff7ed" : isBuiltup ? "#eef2ff" : "#f0fdf4";
  const accentBorder = isLST ? "#fed7aa" : isBuiltup ? "#c7d2fe" : "#bbf7d0";
  const accentText = isLST ? "#c2410c" : isBuiltup ? "#4338ca" : "#15803d";
  const danger = isLST ? "#dc2626" : isBuiltup ? "#ef4444" : "#b45309";

  const now = new Date();
  const currentDate = now.toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" });
  const periodLabel = selectedYear === now.getFullYear()
    ? `1 ม.ค. - ${now.toLocaleDateString("th-TH", { day: "2-digit", month: "short" })} ${selectedYear} (YTD)`
    : `1 ม.ค. - 31 ธ.ค. ${selectedYear}`;

  const avg = safeNumber(summary.averageTemp);
  const max = safeNumber(summary.maxTemp);
  const avgDelta = safeNumber(summary.avgDelta);
  const baselineAvg = safeNumber(summary.baselineAverageTemp);
  const rankingRaw = (summary.ranking ?? []) as [string, number][];
  const yearlyTrend = ((summary.yearlyTrend ?? []) as [number, number][]).map(([y, v]) => [Number(y), safeNumber(v)] as [number, number]);
  const monthlyTrend = ((summary.monthlyTrend ?? []) as number[]).map((v) => safeNumber(v));
  const baselineMonthlyTrend = ((summary.baselineMonthlyTrend ?? []) as number[]).map((v) => safeNumber(v));
  const greenTrend = ((summary.greenAreaTrend ?? []) as [number, number][]).map(([y, v]) => [Number(y), safeNumber(v)] as [number, number]);
  const builtupAreaTrend = ((summary.builtupAreaTrend ?? []) as [number, number][]).map(([y, v]) => [Number(y), safeNumber(v)] as [number, number]);

  const ndviSummary = summary.ndviSummary ?? {};
  const avgNdvi = ndviSummary.avg_ndvi_mean != null ? safeNumber(ndviSummary.avg_ndvi_mean) : null;
  const totalGreen = ndviSummary.total_green_area_rai != null ? safeNumber(ndviSummary.total_green_area_rai) : null;
  const bestGreen = ndviSummary.best_district?.district_name ?? ndviSummary.best_district?.name_th ?? "ไม่มีข้อมูล";
  const worstGreen = ndviSummary.worst_district?.district_name ?? ndviSummary.worst_district?.name_th ?? "ไม่มีข้อมูล";
  const highLstCount = (geojsonData?.features ?? []).filter((f: any) => safeNumber(f?.properties?.mean_lst) >= 36).length;

  const title = isLST
    ? "รายงานวิเคราะห์เกาะความร้อนเมือง"
    : isBuiltup
      ? "รายงานวิเคราะห์การขยายตัวของเมือง"
      : "รายงานวิเคราะห์พื้นที่สีเขียวเมือง";
  const subtitle = isLST
    ? "Land Surface Temperature (LST) · Landsat 8/9 Collection 2 Level 2"
    : isBuiltup
      ? "Built-up Area · NDBI · Sentinel-2 SR Harmonized"
      : "Urban Green Space · NDVI · Sentinel-2 SR Harmonized";

  const ndviRanking: RankRow[] = (geojsonData?.features ?? [])
    .map((f: any) => ({
      name: f.properties?.name_th ?? "",
      value: safeNumber(f.properties?.green_area_rai),
      display: formatRai(safeNumber(f.properties?.green_area_rai)),
    }))
    .filter((row: RankRow) => row.name && row.value > 0)
    .sort((a: RankRow, b: RankRow) => b.value - a.value)
    .slice(0, 8);

  const metricDigits = isBuiltup ? 3 : 2;
  const metricSuffix = isLST ? "°C" : "";
  const rankRows: RankRow[] = isNDVI
    ? ndviRanking
    : rankingRaw.slice(0, 8).map(([name, value]) => {
        const num = safeNumber(value);
        return {
          name,
          value: num,
          display: compareMode ? formatSigned(num, metricDigits, metricSuffix) : `${num.toFixed(metricDigits)}${metricSuffix}`,
        };
      });

  const topNames = rankRows.slice(0, 3).map((row) => row.name).filter(Boolean).join(", ") || "ไม่มีข้อมูล";
  const yearStart = yearlyTrend[0]?.[0];
  const yearEnd = yearlyTrend[yearlyTrend.length - 1]?.[0];
  const longDelta = yearlyTrend.length >= 2 ? yearlyTrend[yearlyTrend.length - 1][1] - yearlyTrend[0][1] : null;
  const builtupAreaLatest = builtupAreaTrend[builtupAreaTrend.length - 1]?.[1] ?? null;

  const kpis = isLST
    ? compareMode
      ? [
          ["ช่วงเปรียบเทียบ", `${compareYear} vs ${selectedYear}`],
          ["LST เฉลี่ย", `${avg.toFixed(2)}°C`],
          ["ส่วนต่างเฉลี่ย", formatSigned(avgDelta, 2, "°C")],
          ["เขตที่เพิ่มสูงสุด", rankRows[0]?.name ?? "ไม่มีข้อมูล"],
        ]
      : [
          ["LST เฉลี่ย", `${avg.toFixed(2)}°C`],
          ["LST สูงสุด", `${max.toFixed(2)}°C`],
          ["เขต LST > 36°C", `${highLstCount} เขต`],
          ["ช่วงข้อมูล", periodLabel],
        ]
    : isBuiltup
      ? compareMode
        ? [
            ["ช่วงเปรียบเทียบ", `${compareYear} vs ${selectedYear}`],
            ["NDBI เฉลี่ย", avg.toFixed(3)],
            ["ส่วนต่างเฉลี่ย", formatSigned(avgDelta, 3)],
            ["เขตขยายตัวสูงสุด", rankRows[0]?.name ?? "ไม่มีข้อมูล"],
          ]
        : [
            ["NDBI เฉลี่ย", avg.toFixed(3)],
            ["NDBI สูงสุด", max.toFixed(3)],
            ["พื้นที่สิ่งปลูกสร้าง", builtupAreaLatest != null ? formatRai(builtupAreaLatest) : "ไม่มีข้อมูล"],
            ["ช่วงข้อมูล", periodLabel],
          ]
      : [
          ["NDVI เฉลี่ย", avgNdvi != null ? avgNdvi.toFixed(3) : "ไม่มีข้อมูล"],
          ["พื้นที่สีเขียวรวม", formatRai(totalGreen)],
          ["เขตสีเขียวสูงสุด", bestGreen],
          ["เขตเร่งด่วน", worstGreen],
        ];

  const insight = isLST
    ? compareMode
      ? `ปี ${selectedYear} มีค่า LST เฉลี่ยเปลี่ยนจากปีฐาน ${compareYear} ${formatSigned(avgDelta, 2, "°C")} พื้นที่ที่ควรติดตามคือ ${topNames} เพราะเป็นกลุ่มเขตที่ความร้อนเพิ่มขึ้นเด่นกว่าพื้นที่อื่น ควรใช้มาตรการเพิ่มร่มเงา พื้นที่สีเขียว และวัสดุพื้นผิวที่สะท้อนความร้อนในแนวถนนและย่านกิจกรรมเมืองหนาแน่น`
      : `ปี ${selectedYear} พื้นที่ ${activeDistrict} มี LST เฉลี่ย ${avg.toFixed(2)}°C และค่าสูงสุด ${max.toFixed(2)}°C โดยมี ${highLstCount} เขตที่ LST เกิน 36°C เขตเด่นคือ ${topNames} สะท้อนรูปแบบพื้นผิวเมืองที่สะสมความร้อนสูงและควรเชื่อมโยงกับแผนเพิ่มต้นไม้ ร่มเงา และสวนระดับชุมชน`
    : isBuiltup
      ? compareMode
        ? `ผลต่าง NDBI ปี ${selectedYear} เทียบกับ ${compareYear} อยู่ที่ ${formatSigned(avgDelta, 3)} โดยเขตที่ขยายตัวสูงคือ ${topNames} ควรอ่านร่วมกับพื้นที่สีเขียวและโครงสร้างพื้นฐานเดิม เพื่อแยกพื้นที่ก่อสร้างใหม่ออกจากพื้นที่ที่เปลี่ยนการใช้ประโยชน์ที่ดินอย่างรวดเร็ว`
        : `ปี ${selectedYear} พื้นที่ ${activeDistrict} มีค่า NDBI เฉลี่ย ${avg.toFixed(3)} เขตที่มีความหนาแน่นสิ่งปลูกสร้างสูงคือ ${topNames}${longDelta != null && yearStart && yearEnd ? ` แนวโน้ม ${yearStart}-${yearEnd} เปลี่ยน ${formatSigned(longDelta, 3)}` : ""} ควรควบคุมการขยายตัวแบบกระจัดกระจายและกันพื้นที่เปิดโล่งหรือพื้นที่สีเขียวไว้ในเขตหนาแน่น`
      : `ปี ${selectedYear} พื้นที่ ${activeDistrict} มี NDVI เฉลี่ย ${avgNdvi != null ? avgNdvi.toFixed(3) : "ไม่มีข้อมูล"} และพื้นที่สีเขียวรวมประมาณ ${formatRai(totalGreen)} เขตที่มีพื้นที่สีเขียวสูงสุดคือ ${bestGreen} ส่วนเขตเร่งด่วนคือ ${worstGreen} ควรใช้ข้อมูลนี้จัดลำดับการเพิ่มสวนชุมชน แนวต้นไม้ริมถนน และพื้นที่สีเขียวริมคลอง`;

  const legendItems = isLST
    ? compareMode
      ? [
          ["#2166AC", "เย็นลงมาก < -1.5°C"],
          ["#67A9CF", "เย็นลง -1.5 ถึง -0.5°C"],
          ["#F7F7F7", "ใกล้เดิม"],
          ["#EF8A62", "ร้อนขึ้น +0.5 ถึง +1.5°C"],
          ["#B2182B", "ร้อนขึ้นมาก > +1.5°C"],
        ]
      : getLSTLegendItems().map((item) => [item.color, `${item.label} ${item.range}°C`])
    : isBuiltup
      ? compareMode
        ? [
            ["#16A34A", "ลดลงมาก"],
            ["#84CC16", "ลดลง"],
            ["#F7F7F7", "ใกล้เดิม"],
            ["#F59E0B", "เพิ่มขึ้น"],
            ["#EF4444", "เพิ่มขึ้นมาก"],
          ]
        : [
            ["#16A34A", "ต่ำมาก"],
            ["#84CC16", "ต่ำ"],
            ["#F59E0B", "ปานกลาง"],
            ["#EF4444", "สูง"],
            ["#7F1D1D", "สูงมาก"],
          ]
      : [
          ["#8c2d04", "เขียวน้อยมาก < 0.20"],
          ["#d94801", "เขียวน้อย 0.20-0.30"],
          ["#f6e05e", "ปานกลาง 0.30-0.40"],
          ["#68d391", "ดี 0.40-0.50"],
          ["#238b45", "ดีมาก > 0.50"],
        ];

  const chartSeries = isLST ? monthlyTrend : isBuiltup && builtupAreaTrend.length ? builtupAreaTrend.map(([, v]) => v) : isNDVI && greenTrend.length ? greenTrend.map(([, v]) => v) : yearlyTrend.map(([, v]) => v);
  const compareSeries = isLST && compareMode ? baselineMonthlyTrend : [];
  const scaleValues = [...chartSeries, ...compareSeries].filter((v) => Number.isFinite(v) && v !== 0);
  const chartMin = isLST ? Math.floor(Math.min(30, ...scaleValues) - 1) : Math.min(...scaleValues, 0);
  const chartMax = isLST ? Math.ceil(Math.max(40, ...scaleValues) + 1) : Math.max(...scaleValues, 1);
  const chartLabels = isLST
    ? MONTHS_TH
    : (isBuiltup && builtupAreaTrend.length ? builtupAreaTrend : isNDVI && greenTrend.length ? greenTrend : yearlyTrend).map(([year]) => String(year).slice(-2));

  const source = isLST
    ? "Landsat 8/9 C2 L2, 30m, cloud masked"
    : "Sentinel-2 SR Harmonized, 10m, cloud and water masked";
  const mapModeLabel = mapMode === "district" ? "District summary" : mapMode === "satellite-cache" ? "Satellite cache" : "GEE raster";

  return (
    <div
      id="a4-report"
      style={{
        width: 794,
        height: 1123,
        padding: 30,
        fontFamily: "'Noto Sans Thai', 'Inter', 'Arial', sans-serif",
        background: "#ffffff",
        color: "#0f172a",
        display: "flex",
        flexDirection: "column",
        position: "fixed",
        top: 0,
        left: -10000,
        zIndex: -1,
        boxSizing: "border-box",
        overflow: "hidden",
      }}
    >
      <header style={{ borderBottom: "3px solid #111827", paddingBottom: 10, marginBottom: 12 }}>
        <div style={{ display: "flex", justifyContent: "space-between", gap: 18 }}>
          <div style={{ minWidth: 0 }}>
            <div style={{ color: accentText, fontSize: 9, fontWeight: 900, letterSpacing: "0.14em", textTransform: "uppercase" }}>
              Bangkok Urban Analytics Report
            </div>
            <h1 style={{ fontSize: 20, lineHeight: 1.2, margin: "4px 0 2px", fontWeight: 900 }}>
              {title}
            </h1>
            <div style={{ color: "#64748b", fontSize: 9, lineHeight: 1.45 }}>{subtitle}</div>
          </div>
          <div style={{ textAlign: "right", color: "#475569", fontSize: 9, lineHeight: 1.65, flexShrink: 0 }}>
            <div><b>พื้นที่:</b> {activeDistrict}</div>
            <div><b>ปีข้อมูล:</b> {compareMode ? `${compareYear} vs ${selectedYear}` : selectedYear}</div>
            <div><b>วันที่ออกรายงาน:</b> {currentDate}</div>
          </div>
        </div>
      </header>

      <section style={{ display: "grid", gridTemplateColumns: "repeat(4, 1fr)", gap: 8, marginBottom: 12 }}>
        {kpis.map(([label, value], index) => (
          <div
            key={label}
            style={{
              minHeight: 56,
              border: `1px solid ${index === 0 || index === 1 ? accentBorder : "#e2e8f0"}`,
              background: index === 0 || index === 1 ? accentSoft : "#f8fafc",
              borderRadius: 7,
              padding: "8px 9px",
              overflow: "hidden",
            }}
          >
            <div style={{ fontSize: 7.5, color: "#64748b", fontWeight: 800, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 4 }}>
              {label}
            </div>
            <div style={{ fontSize: String(value).length > 18 ? 10 : 15, lineHeight: 1.15, color: index === 0 || index === 1 ? accentText : "#111827", fontWeight: 900 }}>
              {value}
            </div>
          </div>
        ))}
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1.46fr 0.92fr", gap: 12, marginBottom: 12 }}>
        <div style={{ height: 318, border: "1px solid #cbd5e1", background: "#0b1120", borderRadius: 8, overflow: "hidden", position: "relative" }}>
          {mapSnapshot ? (
            <img
              src={mapSnapshot}
              alt="map"
              style={{ width: "100%", height: "100%", objectFit: "contain", objectPosition: "center", display: "block", background: "#0b1120" }}
            />
          ) : (
            <div style={{ height: "100%", display: "flex", flexDirection: "column", justifyContent: "center", alignItems: "center", color: "#94a3b8" }}>
              <MapPin style={{ width: 30, height: 30, opacity: 0.45 }} />
              <div style={{ fontSize: 10, marginTop: 8 }}>ไม่สามารถจับภาพแผนที่ได้</div>
            </div>
          )}
          <div style={{ position: "absolute", top: 9, right: 9, background: "rgba(255,255,255,0.92)", color: "#0f172a", borderRadius: 5, padding: "4px 6px", fontSize: 8, fontWeight: 900 }}>
            N
          </div>
          <div style={{ position: "absolute", left: 9, bottom: 9, background: "rgba(15,23,42,0.78)", color: "#fff", borderRadius: 5, padding: "4px 7px", fontSize: 8 }}>
            {mapModeLabel}
          </div>
          <div style={{ position: "absolute", right: 9, bottom: 9, background: "rgba(255,255,255,0.9)", color: "#334155", borderRadius: 5, padding: "4px 7px", fontSize: 8, display: "flex", alignItems: "center", gap: 5 }}>
            <span style={{ width: 28, height: 3, background: "#334155", display: "inline-block" }} /> 10 km
          </div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ border: `1px solid ${accentBorder}`, background: accentSoft, borderRadius: 8, padding: 12, minHeight: 154 }}>
            <div style={{ fontSize: 9, fontWeight: 900, color: accentText, letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 7 }}>
              Executive Insight
            </div>
            <p style={{ margin: 0, fontSize: 10.2, lineHeight: 1.62, color: "#334155" }}>{insight}</p>
          </div>

          <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12, flex: 1 }}>
            <div style={{ fontSize: 9, fontWeight: 900, color: "#334155", letterSpacing: "0.1em", textTransform: "uppercase", marginBottom: 8 }}>
              สัญลักษณ์แผนที่
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 7 }}>
              {legendItems.map(([color, label]) => (
                <div key={`${color}-${label}`} style={{ display: "grid", gridTemplateColumns: "13px 1fr", gap: 7, alignItems: "center" }}>
                  <span style={{ width: 13, height: 13, borderRadius: 3, background: color, border: "1px solid rgba(0,0,0,0.12)" }} />
                  <span style={{ fontSize: 8.3, color: "#475569", lineHeight: 1.25 }}>{label}</span>
                </div>
              ))}
            </div>
          </div>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 12, marginBottom: 12 }}>
        <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 9 }}>
            <BarChart3 style={{ width: 13, height: 13, color: accent }} />
            <div style={{ fontSize: 9, fontWeight: 900, color: "#334155", letterSpacing: "0.08em", textTransform: "uppercase" }}>
              {isLST ? "แนวโน้มรายเดือน" : isBuiltup && builtupAreaTrend.length ? "พื้นที่สิ่งปลูกสร้างรายปี" : isNDVI && greenTrend.length ? "พื้นที่สีเขียวรายปี" : "แนวโน้มรายปี"}
            </div>
          </div>
          <div style={{ height: 132, display: "flex", alignItems: "flex-end", gap: 4, borderBottom: "1px solid #cbd5e1", borderLeft: "1px solid #cbd5e1", padding: "0 0 3px 4px" }}>
            {chartSeries.map((value, index) => {
              const futureMonth = isLST && selectedYear === now.getFullYear() && index > now.getMonth();
              const currentPct = clampPct(value, chartMin, chartMax);
              const comparePct = clampPct(compareSeries[index] ?? 0, chartMin, chartMax);
              return (
                <div key={`${chartLabels[index]}-${index}`} style={{ flex: 1, height: "100%", display: "flex", flexDirection: "column", justifyContent: "flex-end", alignItems: "center", minWidth: 0 }}>
                  {!futureMonth && (
                    <>
                      <div style={{ width: "100%", flex: 1, display: "flex", alignItems: "flex-end", justifyContent: "center", gap: 2 }}>
                        {compareMode && isLST && <div style={{ width: "40%", height: `${comparePct}%`, minHeight: 2, background: "#94a3b8", borderRadius: "2px 2px 0 0" }} />}
                        <div style={{ width: compareMode && isLST ? "40%" : "70%", height: `${currentPct}%`, minHeight: 2, background: accent, borderRadius: "2px 2px 0 0" }} />
                      </div>
                      <div style={{ color: "#64748b", fontSize: 6.5, lineHeight: 1.1, marginTop: 2 }}>
                        {isLST ? value.toFixed(0) : value >= 1000 ? `${(value / 1000).toFixed(0)}k` : value.toFixed(isBuiltup ? 3 : 0)}
                      </div>
                    </>
                  )}
                  <div style={{ color: "#94a3b8", fontSize: 6.5, lineHeight: 1.1, marginTop: 2 }}>{chartLabels[index]}</div>
                </div>
              );
            })}
          </div>
        </div>

        <div style={{ border: "1px solid #e2e8f0", borderRadius: 8, padding: 12 }}>
          <div style={{ fontSize: 9, fontWeight: 900, color: "#334155", letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 8 }}>
            {isNDVI ? "อันดับพื้นที่สีเขียวรายเขต" : compareMode ? "อันดับการเปลี่ยนแปลงรายเขต" : "อันดับพื้นที่เสี่ยง/หนาแน่นรายเขต"}
          </div>
          <table style={{ width: "100%", borderCollapse: "collapse", fontSize: 8.8 }}>
            <thead>
              <tr style={{ color: "#94a3b8", borderBottom: "1px solid #e2e8f0" }}>
                <th style={{ textAlign: "left", paddingBottom: 5, width: 24 }}>#</th>
                <th style={{ textAlign: "left", paddingBottom: 5 }}>เขต</th>
                <th style={{ textAlign: "right", paddingBottom: 5 }}>{isLST ? (compareMode ? "Δ LST" : "LST") : isBuiltup ? (compareMode ? "Δ NDBI" : "NDBI/ไร่") : "พื้นที่"}</th>
              </tr>
            </thead>
            <tbody>
              {rankRows.map((row, index) => (
                <tr key={`${row.name}-${index}`} style={{ borderBottom: "1px solid #f1f5f9" }}>
                  <td style={{ padding: "4px 0", color: "#94a3b8", fontFamily: "monospace" }}>{index + 1}</td>
                  <td style={{ padding: "4px 0", color: "#1e293b", fontWeight: 700 }}>{row.name}</td>
                  <td style={{ padding: "4px 0", textAlign: "right", color: compareMode && row.value > 0 ? danger : "#0f172a", fontFamily: "monospace", fontWeight: 900 }}>{row.display}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </section>

      <section style={{ display: "grid", gridTemplateColumns: "1fr 1fr 1fr", gap: 10, marginBottom: 12 }}>
        {[
          ["วิธีอ่านข้อมูล", isLST ? "LST คืออุณหภูมิพื้นผิว ไม่ใช่อุณหภูมิอากาศหรือ Heat Index" : isBuiltup ? "NDBI ใช้ชี้พื้นที่สิ่งปลูกสร้างและพื้นผิวคอนกรีต ควรอ่านร่วมกับข้อมูลภาคสนาม" : "NDVI ใช้ชี้ความเขียวของพืชพรรณ ค่าขึ้นกับฤดูกาล เมฆ และเงาอาคาร"],
          ["ข้อค้นพบหลัก", isLST ? `พื้นที่เด่น: ${topNames}` : isBuiltup ? `พื้นที่ขยายตัว/หนาแน่นเด่น: ${topNames}` : `เขตสีเขียวสูงสุด: ${bestGreen}`],
          ["ข้อเสนอแนะ", isLST ? "เพิ่มร่มเงา ต้นไม้ริมถนน พื้นผิวเย็น และสวนชุมชนในเขตร้อนสูง" : isBuiltup ? "ควบคุม urban sprawl กันพื้นที่เปิดโล่ง และผูกแผนก่อสร้างกับพื้นที่สีเขียว" : "เพิ่มสวนใกล้บ้าน พื้นที่สีเขียวริมคลอง และเป้าหมายพื้นที่สีเขียวต่อหัว"],
        ].map(([heading, body]) => (
          <div key={heading} style={{ border: "1px solid #e2e8f0", background: "#f8fafc", borderRadius: 8, padding: 10, minHeight: 78 }}>
            <div style={{ fontSize: 8, color: accentText, fontWeight: 900, letterSpacing: "0.08em", textTransform: "uppercase", marginBottom: 5 }}>{heading}</div>
            <div style={{ color: "#475569", fontSize: 9.2, lineHeight: 1.45 }}>{body}</div>
          </div>
        ))}
      </section>

      <footer style={{ marginTop: "auto", borderTop: "1px solid #e2e8f0", paddingTop: 7, display: "flex", justifyContent: "space-between", gap: 16, color: "#94a3b8", fontSize: 7.5, lineHeight: 1.35 }}>
        <span>{source} · {periodLabel} · Bangkok Urban Analytics Dashboard</span>
        <span>ค่าจากดาวเทียมเพื่อการวิเคราะห์เชิงพื้นที่ ไม่ใช่ข้อมูลราชการ</span>
      </footer>
    </div>
  );
}
