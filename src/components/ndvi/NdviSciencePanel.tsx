"use client";

import { AlertTriangle, BookOpen, Braces, CheckCircle2, Satellite } from "lucide-react";

const INTERPRETATION_ROWS = [
  { range: "< 0.00", label: "น้ำ เงา หรือพื้นผิวที่ไม่ใช่พืช", color: "#7f1d1d" },
  { range: "0.00–0.20", label: "พืชพรรณน้อยหรือพื้นผิวผสม", color: "#b45309" },
  { range: "0.20–0.40", label: "พืชพรรณระดับต่ำถึงปานกลาง", color: "#facc15" },
  { range: "0.40–0.60", label: "พืชพรรณค่อนข้างหนาแน่น", color: "#84cc16" },
  { range: "> 0.60", label: "พืชพรรณหนาแน่นมาก", color: "#047857" },
];

export default function NdviSciencePanel() {
  return (
    <div className="space-y-5">
      <section className="rounded-xl border border-emerald-500/25 bg-emerald-500/5 p-5">
        <div className="flex items-start gap-3">
          <div className="rounded-lg border border-emerald-500/25 bg-slate-950/70 p-2">
            <BookOpen className="h-5 w-5 text-emerald-300" />
          </div>
          <div>
            <h2 className="text-base font-black text-slate-100">NDVI ตอบคำถามอะไร</h2>
            <p className="mt-2 max-w-4xl text-sm leading-7 text-slate-300">
              NDVI วัดความแตกต่างระหว่างแสงอินฟราเรดใกล้ที่พืชสะท้อนมาก กับแสงสีแดงที่คลอโรฟิลล์ดูดกลืน
              จึงใช้เป็นสัญญาณของปริมาณและความสมบูรณ์ของพืชพรรณในช่วงเวลาที่ดาวเทียมสังเกต
            </p>
          </div>
        </div>
      </section>

      <div className="grid gap-5 lg:grid-cols-2">
        <section className="rounded-xl border border-slate-800 bg-slate-900/55 p-5">
          <div className="flex items-center gap-2">
            <Braces className="h-4 w-4 text-emerald-300" />
            <h2 className="text-sm font-black text-slate-100">สูตรและช่วงค่า</h2>
          </div>
          <div className="mt-4 rounded-lg bg-slate-950/70 p-4 text-center font-mono text-base text-emerald-200">
            NDVI = (NIR - Red) / (NIR + Red)
          </div>
          <ul className="mt-4 space-y-2 text-[12px] leading-6 text-slate-400">
            <li>ค่าทางทฤษฎีอยู่ระหว่าง -1 ถึง +1 และไม่มีหน่วย</li>
            <li>ชั้นภาพรายพิกเซลใช้ Sentinel-2: แถบ B8 เป็น NIR และ B4 เป็น Red ที่ความละเอียดประมาณ 10 เมตร</li>
            <li>ชั้นภาพใช้ composite มัธยฐานรายปีเพื่อลดผลของเมฆและภาพผิดปกติ ไม่ใช่ภาพถ่ายวันเดียว</li>
            <li>ค่าสรุปรายเขตอาจมาจากอีกชุดข้อมูลหนึ่ง จึงต้องตรวจป้ายแหล่งข้อมูลและสถานะ observed/modeled ประกอบ</li>
          </ul>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/55 p-5">
          <div className="flex items-center gap-2">
            <Satellite className="h-4 w-4 text-emerald-300" />
            <h2 className="text-sm font-black text-slate-100">แนวทางแปลความหมาย</h2>
          </div>
          <div className="mt-4 space-y-2">
            {INTERPRETATION_ROWS.map((row) => (
              <div key={row.range} className="grid grid-cols-[14px_72px_1fr] items-center gap-2 text-[11px]">
                <span className="h-3.5 w-3.5 rounded-sm" style={{ backgroundColor: row.color }} />
                <span className="font-mono text-slate-300">{row.range}</span>
                <span className="text-slate-400">{row.label}</span>
              </div>
            ))}
          </div>
          <p className="mt-4 text-[10px] leading-5 text-slate-500">
            ช่วงเหล่านี้เป็นแนวทางทั่วไป ไม่ใช่มาตรฐานสากลตายตัว เกณฑ์ที่เหมาะสมขึ้นกับฤดูกาล ชนิดพืช
            เซนเซอร์ วิธีทำ composite และลักษณะพื้นที่ศึกษา
          </p>
        </section>

        <section className="rounded-xl border border-slate-800 bg-slate-900/55 p-5">
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-300" />
            <h2 className="text-sm font-black text-slate-100">ใช้สนับสนุนการตัดสินใจ</h2>
          </div>
          <ul className="mt-4 space-y-3 text-[12px] leading-6 text-slate-400">
            <li>คัดกรองเขตหรือย่านที่สัญญาณพืชพรรณต่ำเพื่อเปิดภาพรายละเอียดและสำรวจต่อ</li>
            <li>ติดตามทิศทางการเพิ่มหรือลด โดยเปรียบเทียบช่วงฤดูกาลเดียวกัน</li>
            <li>อ่านร่วมกับ Tree Cover, อุณหภูมิพื้นผิว, ประชากร และการใช้ประโยชน์ที่ดิน</li>
          </ul>
        </section>

        <section className="rounded-xl border border-amber-500/25 bg-amber-500/5 p-5">
          <div className="flex items-center gap-2">
            <AlertTriangle className="h-4 w-4 text-amber-300" />
            <h2 className="text-sm font-black text-amber-100">สิ่งที่ NDVI ยืนยันไม่ได้</h2>
          </div>
          <ul className="mt-4 space-y-3 text-[12px] leading-6 text-amber-100/70">
            <li>ไม่ใช่จำนวนต้นไม้ ขนาดเรือนยอดไม้ หรือทะเบียนสวนสาธารณะ</li>
            <li>ไม่แยกต้นไม้ หญ้า พืชเกษตร และพุ่มไม้ได้อย่างน่าเชื่อถือด้วย NDVI เพียงตัวเดียว</li>
            <li>ค่าเฉลี่ยรายเขตอาจซ่อนพื้นที่เล็กที่เขียวมากหรือเสื่อมโทรมมาก</li>
            <li>ผลต่างข้ามปีอาจเกิดจากฝน ฤดูกาล เมฆ เงา และจำนวนภาพ ไม่ใช่การเปลี่ยนพื้นที่จริงทั้งหมด</li>
          </ul>
        </section>
      </div>
    </div>
  );
}
