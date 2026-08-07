import Link from "next/link";
import {
  ArrowRight,
  BadgeCheck,
  CircleDashed,
  FileWarning,
  Layers3,
  ScanSearch,
} from "lucide-react";
import AppShell from "@/components/observatory/AppShell";
import BangkokBoundaryPreview from "@/components/observatory/BangkokBoundaryPreview";
import QuestionBuilder from "@/components/observatory/QuestionBuilder";
import districtGeoJson from "@/data/observatory/bkk-districts.provisional.json";
import { getRegistrySummary } from "@/lib/observatory/registry";

const workflows = [
  {
    title: "สำรวจสภาพล่าสุดที่มีข้อมูล",
    description: "อ่านภาพรวมความร้อน พืชพรรณ น้ำ และบริบทเมืองจากข้อมูลที่พร้อมใช้งาน",
    result: "เปิดแผนที่",
    href: "/observatory",
  },
  {
    title: "เปรียบเทียบพื้นที่และเวลา",
    description: "เลือกปีที่ต้องการดูและปีอ้างอิง เพื่อเปรียบเทียบเขตหรือช่วงเวลาอย่างเป็นธรรม",
    result: "เลือกช่วงเวลา",
    href: "/observatory?lens=vegetation&year=2025&baseline=2024",
  },
  {
    title: "ตรวจการเปลี่ยนแปลงหรือเหตุการณ์",
    description: "ดูว่าสัญญาณเปลี่ยนต่อเนื่องหรือเป็นเพียงภาพบางช่วงที่ต้องตรวจซ้ำ",
    result: "ดูการเปลี่ยนแปลง",
    href: "/observatory?lens=urban&year=2024&baseline=2018",
  },
  {
    title: "ประเมินบริบทที่อาจได้รับผล",
    description: "อ่านผลร่วมกับประชากร บริการเมือง และข้อควรระวังก่อนนำไปวางแผน",
    result: "ดูบริบทพื้นที่",
    href: "/areas",
  },
];

const registrySummary = getRegistrySummary();
const readiness = [
  {
    label: "โครงพื้นที่ 50 เขต",
    detail: "พร้อมใช้เป็นขอบเขตเริ่มต้น และรอตรวจรับเป็นฐานอ้างอิงถาวร",
    state: "provisional",
  },
  {
    label: `ข้อมูลพร้อมใช้ ${registrySummary.publicDatasetCount} จาก ${registrySummary.datasetCount} ชุด`,
    detail: "แสดงเฉพาะชุดที่ระบุที่มาและข้อควรระวังแล้ว",
    state: registrySummary.publicDatasetCount > 0 ? "validated" : "acceptance",
  },
  {
    label: `หัวข้อวิเคราะห์พร้อมใช้ ${registrySummary.publicProductCount} จาก ${registrySummary.productCount} รายการ`,
    detail: "หัวข้อที่ยังตรวจไม่ครบจะบอกสถานะแทนการแสดงค่า",
    state: registrySummary.publicProductCount > 0 ? "validated" : "acceptance",
  },
  {
    label: "ที่มาและข้อควรระวัง",
    detail: "อ้างอิงรายการข้อมูลชุดเดียวกันทั้งระบบ",
    state: "checking",
  },
];

const districtNames = districtGeoJson.features
  .map((feature) => feature.properties.nameTh)
  .sort((a, b) => a.localeCompare(b, "th"));

export default function Home() {
  return (
    <AppShell>
      <main className="mx-auto max-w-[1600px] px-4 py-6 sm:px-6 lg:py-8">
        <section className="grid gap-6 border-b border-[var(--oe-line)] pb-7 xl:grid-cols-[minmax(0,1fr)_390px] xl:items-end">
          <div>
            <div className="mb-3 flex items-center gap-2 text-sm font-semibold text-[var(--oe-primary-ink)]">
              <ScanSearch aria-hidden="true" className="h-4 w-4" />
              พื้นที่ทำงานสำหรับตรวจสัญญาณเมือง
            </div>
            <h1 className="max-w-5xl text-3xl font-bold leading-[1.25] tracking-[-0.025em] text-balance sm:text-4xl">
              วิเคราะห์กรุงเทพมหานครจากข้อมูลดาวเทียม แล้วอ่านร่วมกับบริบทเมืองที่ตรวจสอบที่มาได้
            </h1>
            <p className="mt-4 max-w-3xl text-base leading-7 text-[var(--oe-muted)] text-pretty">
              ระบบเริ่มจากคำถาม พื้นที่ เวลา และฐานเปรียบเทียบ ผลทุกชิ้นต้องระบุแหล่งข้อมูล
              วิธีอ่านผล และข้อควรระวังก่อนนำไปตรวจสอบต่อ
            </p>
          </div>
          <div className="border-l border-[var(--oe-line)] pl-5">
            <p className="text-xs font-bold text-[var(--oe-muted)]">ขอบเขตการใช้งาน</p>
            <p className="mt-2 text-sm leading-6">
              ผลดาวเทียมเป็นสัญญาณคัดกรอง ไม่ใช่ข้อยืนยันระดับภาคสนาม
              และยังไม่สรุปเป็นคะแนนเดียวจนกว่าวิธีวิเคราะห์จะตรวจสอบครบ
            </p>
          </div>
        </section>

        <section className="py-6">
          <QuestionBuilder areas={districtNames} />
        </section>

        <section className="grid gap-4 xl:grid-cols-[minmax(0,1fr)_360px]">
          <Link
            href="/observatory"
            className="group rounded-[var(--radius-panel)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)] focus-visible:ring-offset-2"
            aria-label="เปิดพื้นที่วิเคราะห์จากแผนที่กรุงเทพมหานคร"
          >
            <BangkokBoundaryPreview />
            <span className="mt-2 inline-flex items-center gap-2 text-sm font-bold text-[var(--oe-primary-ink)]">
              เปิดแผนที่และเลือกพื้นที่
              <ArrowRight aria-hidden="true" className="h-4 w-4 transition-transform duration-150 group-hover:translate-x-1" />
            </span>
          </Link>

          <aside className="rounded-[var(--radius-panel)] border border-[var(--oe-line)] bg-white">
            <div className="border-b border-[var(--oe-line)] p-4">
              <div className="flex items-center gap-2">
                <Layers3 aria-hidden="true" className="h-4 w-4 text-[var(--oe-primary)]" />
              <h2 className="text-sm font-bold">สถานะข้อมูล</h2>
              </div>
              <p className="mt-1 text-xs leading-5 text-[var(--oe-muted)]">
                สถานะนี้บอกว่าหน้าจอใดพร้อมแสดงผล และช่วงใดยังต้องรอตรวจ
              </p>
            </div>
            <ul>
              {readiness.map((item) => (
                <li key={item.label} className="flex gap-3 border-b border-[var(--oe-line-soft)] p-4 last:border-b-0">
                  {item.state === "validated" ? (
                    <BadgeCheck aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--oe-success)]" />
                  ) : item.state === "checking" ? (
                    <ScanSearch aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--oe-info)]" />
                  ) : item.state === "acceptance" || item.state === "provisional" ? (
                    <FileWarning aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--oe-warning)]" />
                  ) : (
                    <CircleDashed aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-[var(--oe-muted)]" />
                  )}
                  <div>
                    <p className="text-sm font-bold">{item.label}</p>
                    <p className="mt-1 text-xs leading-5 text-[var(--oe-muted)]">{item.detail}</p>
                  </div>
                </li>
              ))}
            </ul>
            <div className="border-t border-[var(--oe-line)] p-4">
              <Link href="/evidence" className="inline-flex min-h-11 items-center gap-2 text-sm font-bold text-[var(--oe-primary-ink)] outline-none focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)]">
                ดูที่มาและข้อควรระวัง
                <ArrowRight aria-hidden="true" className="h-4 w-4" />
              </Link>
            </div>
          </aside>
        </section>

        <section className="mt-10 border-t border-[var(--oe-line)] pt-7">
          <div className="grid gap-5 lg:grid-cols-[300px_minmax(0,1fr)]">
            <div>
              <h2 className="text-xl font-bold">งานหลักของ Observatory</h2>
              <p className="mt-2 text-sm leading-6 text-[var(--oe-muted)]">
                ทุกงานเริ่มจากคำถามเดียวกัน เลือกพื้นที่และเวลาได้ และเปิดดูหลักฐานย้อนหลังได้
              </p>
            </div>
            <ol className="border-y border-[var(--oe-line)]">
              {workflows.map((workflow, index) => (
                <li key={workflow.title} className="border-b border-[var(--oe-line-soft)] last:border-b-0">
                  <Link
                    href={workflow.href}
                    className="grid gap-2 rounded-[var(--radius-control)] py-4 outline-none transition-colors hover:bg-[var(--oe-surface-muted)] focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)] sm:grid-cols-[36px_minmax(0,1fr)_190px] sm:items-start"
                  >
                    <span className="font-mono text-xs font-bold text-[var(--oe-primary-ink)]">{String(index + 1).padStart(2, "0")}</span>
                    <div>
                      <h3 className="text-sm font-bold">{workflow.title}</h3>
                      <p className="mt-1 text-sm leading-6 text-[var(--oe-muted)]">{workflow.description}</p>
                    </div>
                    <span className="inline-flex items-center gap-2 text-xs font-semibold text-[var(--oe-primary-ink)] sm:justify-end">
                      {workflow.result}
                      <ArrowRight aria-hidden="true" className="h-3.5 w-3.5" />
                    </span>
                  </Link>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mt-10 grid gap-5 border-y border-[var(--oe-line)] py-7 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div>
            <h2 className="text-xl font-bold">กติกาก่อนอ่านผล</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--oe-muted)]">
              ถ้าข้อมูลยังไม่พร้อม ระบบจะแจ้งสถานะให้รู้ แทนการใส่ค่าประมาณที่อาจทำให้เข้าใจผิด
            </p>
          </div>
          <dl className="grid gap-x-8 gap-y-5 md:grid-cols-2">
            <div>
              <dt className="text-sm font-bold">วันที่ข้อมูลกับวันที่ประมวลผลอาจไม่ตรงกัน</dt>
              <dd className="mt-1 text-sm leading-6 text-[var(--oe-muted)]">ควรดูช่วงเวลาของข้อมูลก่อนนำไปเปรียบเทียบ</dd>
            </div>
            <div>
              <dt className="text-sm font-bold">ความละเอียดของข้อมูลต้องเหมาะกับคำถาม</dt>
              <dd className="mt-1 text-sm leading-6 text-[var(--oe-muted)]">ข้อมูลภาพรวมเมืองไม่ควรถูกอ่านเหมือนการสำรวจรายถนน</dd>
            </div>
            <div>
              <dt className="text-sm font-bold">ความสัมพันธ์ไม่ใช่สาเหตุ</dt>
              <dd className="mt-1 text-sm leading-6 text-[var(--oe-muted)]">ผลเชื่อมโยงกับประชากรหรือบริการเมืองเป็นจุดเริ่มตรวจต่อ</dd>
            </div>
            <div>
              <dt className="text-sm font-bold">พื้นที่ที่ไม่มีข้อมูลต้องถูกบอกตรง ๆ</dt>
              <dd className="mt-1 text-sm leading-6 text-[var(--oe-muted)]">ไม่เติมศูนย์ ไม่จัดอันดับ และไม่ซ่อนพื้นที่ที่ข้อมูลยังไม่พอ</dd>
            </div>
          </dl>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 py-6 text-xs text-[var(--oe-muted)]">
          <span>Bangkok City Observatory · อัปเดตแนวทาง 2026-07-26</span>
          <span>แผนที่เมือง + ข้อมูลเปิดกรุงเทพฯ</span>
        </footer>
      </main>
    </AppShell>
  );
}
