const MONTHS_TH_FULL = [
  "มกราคม", "กุมภาพันธ์", "มีนาคม", "เมษายน",
  "พฤษภาคม", "มิถุนายน", "กรกฎาคม", "สิงหาคม",
  "กันยายน", "ตุลาคม", "พฤศจิกายน", "ธันวาคม",
];

export function buildPeriodLabel(year: number, month: number | null): string {
  if (month === null) {
    return `1 ม.ค. – 31 ธ.ค. ${year}`;
  }
  const monthName = MONTHS_TH_FULL[month - 1] ?? "";
  return `${monthName} ${year}`;
}

export function downloadCSV(
  headers: string[],
  rows: (string | number | null)[][],
  filename: string,
) {
  const escape = (v: string | number | null) => {
    const s = v === null || v === undefined ? "" : String(v);
    return s.includes(",") || s.includes('"') || s.includes("\n")
      ? `"${s.replace(/"/g, '""')}"`
      : s;
  };
  const lines = [headers, ...rows].map((row) => row.map(escape).join(",")).join("\r\n");
  const blob = new Blob(["﻿" + lines], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = filename.endsWith(".csv") ? filename : filename + ".csv";
  a.click();
  URL.revokeObjectURL(url);
}

export interface PDFReportData {
  title: string;
  subtitle: string;
  source: string;
  period: string;
  layer: string;
  district: string;
  kpis: { label: string; value: string }[];
  rankingHeaders: string[];
  rankingRows: (string | number | null)[][];
  /** Optional: data vintage description (e.g. "Supabase district_statistics" or "local fallback") */
  dataVintage?: string;
  /** Optional: data generation timestamp (ISO string) */
  generatedAt?: string;
  /** Optional: spatial resolution description */
  resolution?: string;
}

/** Opens a new window with a formatted A4 report and triggers print dialog */
export function printReport(data: PDFReportData) {
  const esc = (s: string | number | null) =>
    String(s ?? "–")
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;");

  const kpiHTML = data.kpis
    .map(
      (k) => `
      <div class="kpi">
        <div class="kpi-label">${esc(k.label)}</div>
        <div class="kpi-value">${esc(k.value)}</div>
      </div>`,
    )
    .join("");

  const theadHTML = data.rankingHeaders
    .map((h) => `<th>${esc(h)}</th>`)
    .join("");

  const tbodyHTML = data.rankingRows
    .map(
      (row, i) =>
        `<tr class="${i % 2 === 0 ? "" : "alt"}">
          <td class="rank">${i + 1}</td>
          ${row.map((cell) => `<td>${esc(cell)}</td>`).join("")}
        </tr>`,
    )
    .join("");

  const html = `<!DOCTYPE html>
<html lang="th">
<head>
<meta charset="UTF-8"/>
<title>${esc(data.title)} – ${esc(data.period)}</title>
<style>
  @page { size: A4 portrait; margin: 18mm 16mm; }
  * { box-sizing: border-box; margin: 0; padding: 0; }
  body { font-family: 'Sarabun', 'Noto Sans Thai', Arial, sans-serif; font-size: 10pt; color: #1e293b; background: #fff; }
  .header { border-bottom: 3px solid #0ea5e9; padding-bottom: 10px; margin-bottom: 14px; display: flex; justify-content: space-between; align-items: flex-end; }
  .header-left h1 { font-size: 16pt; font-weight: 800; color: #0c4a6e; }
  .header-left p  { font-size: 9pt; color: #64748b; margin-top: 2px; }
  .header-right   { text-align: right; font-size: 8pt; color: #94a3b8; }
  .badge-row { display: flex; gap: 6px; margin-bottom: 14px; flex-wrap: wrap; }
  .badge { background: #e0f2fe; color: #0369a1; padding: 3px 8px; border-radius: 99px; font-size: 8pt; font-weight: 700; }
  .kpi-row { display: grid; grid-template-columns: repeat(auto-fill, minmax(100px, 1fr)); gap: 8px; margin-bottom: 16px; }
  .kpi { background: #f8fafc; border: 1px solid #e2e8f0; border-radius: 6px; padding: 8px 10px; }
  .kpi-label { font-size: 7.5pt; color: #94a3b8; font-weight: 700; text-transform: uppercase; letter-spacing: .04em; margin-bottom: 3px; }
  .kpi-value { font-size: 11pt; font-weight: 800; color: #0f172a; }
  h2 { font-size: 10pt; color: #334155; font-weight: 700; text-transform: uppercase; letter-spacing: .06em; margin-bottom: 8px; border-left: 3px solid #0ea5e9; padding-left: 7px; }
  table { width: 100%; border-collapse: collapse; font-size: 8.5pt; }
  th { background: #0c4a6e; color: #fff; padding: 5px 8px; text-align: left; font-size: 7.5pt; text-transform: uppercase; letter-spacing: .04em; }
  td { padding: 4px 8px; border-bottom: 1px solid #f1f5f9; }
  tr.alt td { background: #f8fafc; }
  .rank { color: #94a3b8; font-weight: 700; text-align: right; width: 28px; }
  .footer { margin-top: 18px; font-size: 7.5pt; color: #94a3b8; border-top: 1px solid #e2e8f0; padding-top: 8px; display: flex; justify-content: space-between; }
</style>
</head>
<body>
  <div class="header">
    <div class="header-left">
      <h1>${esc(data.title)}</h1>
      <p>${esc(data.subtitle)} · ${esc(data.layer)}</p>
    </div>
    <div class="header-right">
      Bangkok District Analytics<br/>
      สร้างเมื่อ: ${new Date().toLocaleDateString("th-TH", { year: "numeric", month: "long", day: "numeric" })}
    </div>
  </div>
  <div class="badge-row">
    <span class="badge">${esc(data.source)}</span>
    <span class="badge">ช่วงเวลา: ${esc(data.period)}</span>
    <span class="badge">พื้นที่: ${esc(data.district)}</span>
    ${data.resolution ? `<span class="badge">ความละเอียด: ${esc(data.resolution)}</span>` : ""}
    ${data.dataVintage ? `<span class="badge" style="background:#fef3c7;color:#92400e">${esc(data.dataVintage)}</span>` : ""}
  </div>
  <div class="kpi-row">${kpiHTML}</div>
  <h2>อันดับรายเขต</h2>
  <table>
    <thead><tr><th>#</th>${theadHTML}</tr></thead>
    <tbody>${tbodyHTML}</tbody>
  </table>
  <div class="footer">
    <span>Bangkok Urban Analytics Hub · bkkanalysis.vercel.app</span>
    <span>ข้อมูล: ${esc(data.source)} · ดึงข้อมูล: ${data.generatedAt ? new Date(data.generatedAt).toLocaleString("th-TH") : new Date().toLocaleString("th-TH")}${data.dataVintage ? ` · แหล่ง: ${esc(data.dataVintage)}` : ""}</span>
  </div>
</body>
</html>`;

  const win = window.open("", "_blank", "width=900,height=700");
  if (!win) { alert("กรุณาอนุญาต pop-up เพื่อพิมพ์รายงาน"); return; }
  win.document.write(html);
  win.document.close();
  win.focus();
  setTimeout(() => { win.print(); }, 600);
}
