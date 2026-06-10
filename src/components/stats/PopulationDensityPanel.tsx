"use client";

import {
  Bar,
  BarChart,
  CartesianGrid,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from "recharts";
import {
  formatPopulationDensity,
  getDistrictDensity,
  getDistrictDensityRows,
} from "@/lib/district-density";

export default function PopulationDensityPanel({
  activeDistrict = "ทั้งหมด",
  accentColor = "#22d3ee",
}: {
  activeDistrict?: string;
  accentColor?: string;
}) {
  const allRows = getDistrictDensityRows();
  const selectedDensity = getDistrictDensity(activeDistrict);
  const displayRows = activeDistrict !== "ทั้งหมด" && selectedDensity !== null
    ? [{ district: activeDistrict.replace(/^เขต/, ""), density: selectedDensity }]
    : allRows;
  const average = allRows.length
    ? allRows.reduce((sum, row) => sum + row.density, 0) / allRows.length
    : null;
  const highest = allRows[0] ?? null;
  const lowest = allRows[allRows.length - 1] ?? null;

  return (
    <section className="rounded-xl border border-slate-800 bg-slate-900/45 p-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h3 className="text-xs font-black text-slate-200">ความหนาแน่นประชากรรายเขต</h3>
          <p className="mt-1 text-[10px] text-slate-500">
            ข้อมูลฐาน GeoJSON ของโครงการ หน่วยคนต่อตารางกิโลเมตร ไม่ใช่ค่าจากดาวเทียม
            และควรตรวจสอบกับสถิติทางการก่อนใช้เชิงนโยบาย
          </p>
        </div>
        <span className="rounded-md border border-slate-700 bg-slate-950/70 px-2 py-1 text-[9px] font-bold text-slate-400">
          คน/ตร.กม.
        </span>
      </div>

      <div className="mt-4 grid grid-cols-3 gap-2">
        {[
          ["เฉลี่ย 50 เขต", average, null],
          ["สูงสุด", highest?.density ?? null, highest?.district ?? null],
          ["ต่ำสุด", lowest?.density ?? null, lowest?.district ?? null],
        ].map(([label, value, district]) => (
          <div key={String(label)} className="rounded-lg bg-slate-950/55 p-3">
            <div className="text-[9px] text-slate-600">{label}</div>
            <div className="mt-1 text-sm font-black tabular-nums text-slate-200">
              {formatPopulationDensity(value as number | null)}
            </div>
            <div className="mt-0.5 truncate text-[9px] text-slate-600">
              {district ? `เขต${district}` : "คน/ตร.กม."}
            </div>
          </div>
        ))}
      </div>

      <div className="mt-4 max-h-[360px] overflow-y-auto pr-1">
        <div style={{ height: Math.max(180, displayRows.length * 18) }}>
        <ResponsiveContainer width="100%" height="100%">
          <BarChart
            data={[...displayRows].reverse()}
            layout="vertical"
            margin={{ left: 12, right: 28, top: 2, bottom: 2 }}
          >
            <CartesianGrid stroke="#1e293b" horizontal={false} />
            <XAxis type="number" stroke="#64748b" fontSize={9} />
            <YAxis
              type="category"
              dataKey="district"
              width={88}
              stroke="#94a3b8"
              fontSize={9}
            />
            <Tooltip
              formatter={(value) => [
                `${formatPopulationDensity(Number(value))} คน/ตร.กม.`,
                "ความหนาแน่นประชากร",
              ]}
              contentStyle={{
                background: "#0f172a",
                border: "1px solid #334155",
                borderRadius: 8,
                fontSize: 11,
              }}
            />
            <Bar dataKey="density" fill={accentColor} radius={[0, 3, 3, 0]} maxBarSize={12} />
          </BarChart>
        </ResponsiveContainer>
        </div>
      </div>
    </section>
  );
}
