"use client";

import { Download, FileText, Loader2 } from "lucide-react";
import { useState } from "react";
import { downloadCSV, printReport, type PDFReportData } from "@/lib/export-utils";
import type { AccentColor } from "./MonthYearPicker";

const ACCENT_MAP: Record<AccentColor, { btn: string; text: string }> = {
  sky:     { btn: "bg-sky-500 hover:bg-sky-400 shadow-sky-500/30",     text: "text-sky-400" },
  cyan:    { btn: "bg-cyan-500 hover:bg-cyan-400 shadow-cyan-500/30",   text: "text-cyan-400" },
  yellow:  { btn: "bg-yellow-500 hover:bg-yellow-400 shadow-yellow-500/30", text: "text-yellow-400" },
  red:     { btn: "bg-red-500 hover:bg-red-400 shadow-red-500/30",     text: "text-red-400" },
  emerald: { btn: "bg-emerald-500 hover:bg-emerald-400 shadow-emerald-500/30", text: "text-emerald-400" },
  indigo:  { btn: "bg-indigo-500 hover:bg-indigo-400 shadow-indigo-500/30", text: "text-indigo-400" },
  orange:  { btn: "bg-orange-500 hover:bg-orange-400 shadow-orange-500/30", text: "text-orange-400" },
};

export interface ExportPanelProps {
  reportData: PDFReportData;
  csvFilename: string;
  csvHeaders: string[];
  csvRows: (string | number | null)[][];
  accentColor?: AccentColor;
}

export default function ExportPanel({
  reportData,
  csvFilename,
  csvHeaders,
  csvRows,
  accentColor = "sky",
}: ExportPanelProps) {
  const [printing, setPrinting] = useState(false);
  const c = ACCENT_MAP[accentColor];

  const handleCSV = () => {
    downloadCSV(csvHeaders, csvRows, csvFilename);
  };

  const handlePDF = () => {
    setPrinting(true);
    try {
      printReport(reportData);
    } finally {
      setTimeout(() => setPrinting(false), 800);
    }
  };

  return (
    <div className="bg-[#0f172a]/95 backdrop-blur-md rounded-2xl p-4 border border-slate-800 shadow-2xl w-full">
      <h4 className={`text-[10px] font-bold ${c.text} uppercase tracking-widest mb-3 flex items-center gap-2`}>
        <Download className="w-3.5 h-3.5" /> ออกรายงาน (Export)
      </h4>

      <div className="flex flex-col gap-2">
        {/* CSV */}
        <button
          onClick={handleCSV}
          disabled={csvRows.length === 0}
          className="flex items-center justify-center gap-2 w-full py-2.5 rounded-xl border border-slate-700 bg-slate-800/60 text-slate-300 hover:bg-slate-700/60 hover:text-white transition-all text-[10px] font-bold disabled:opacity-40 disabled:cursor-not-allowed"
        >
          <FileText className="w-3.5 h-3.5" />
          ดาวน์โหลด CSV (Excel)
        </button>

        {/* PDF */}
        <button
          onClick={handlePDF}
          disabled={printing || csvRows.length === 0}
          className={`flex items-center justify-center gap-2 w-full py-2.5 rounded-xl text-white shadow-lg transition-all text-[10px] font-bold disabled:opacity-50 disabled:cursor-not-allowed ${c.btn}`}
        >
          {printing
            ? <><Loader2 className="w-3.5 h-3.5 animate-spin" /> กำลังสร้าง PDF…</>
            : <><FileText className="w-3.5 h-3.5" /> พิมพ์ / บันทึก PDF</>
          }
        </button>
      </div>

      <p className="mt-2 text-[8.5px] text-slate-600 leading-snug">
        CSV: ข้อมูลตัวเลขทุกเขต · PDF: เปิดหน้าต่างพิมพ์ (Ctrl+P → Save as PDF)
      </p>
    </div>
  );
}
