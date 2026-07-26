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
import {
  getRegistrySummary,
  OBSERVATORY_REGISTRY,
} from "@/lib/observatory/registry";

const workflows = [
  {
    title: "สำรวจสภาพล่าสุดที่มีข้อมูล",
    description: "อ่านสภาพผิวเมือง ความร้อน พืชพรรณ น้ำ และบริบทที่มี coverage เพียงพอ",
    result: "แผนที่สถานะ + หลักฐาน",
  },
  {
    title: "เปรียบเทียบพื้นที่และเวลา",
    description: "กำหนด baseline ที่อยู่ในฤดูกาลเดียวกัน และรักษาหน่วยกับช่วงสีให้เทียบกันได้",
    result: "ค่าจริง + ผลต่าง",
  },
  {
    title: "ตรวจการเปลี่ยนแปลงหรือเหตุการณ์",
    description: "ใช้หลาย acquisition แยกสัญญาณต่อเนื่องออกจาก noise และข้อมูลขาดหาย",
    result: "ก่อน / หลัง + persistence",
  },
  {
    title: "ประเมินบริบทที่อาจได้รับผล",
    description: "เชื่อมประชากรตามทะเบียน แบบจำลองประชากร และทรัพย์สินโดยไม่หลอมเป็นตัวเลขเดียว",
    result: "exposure + ข้อจำกัด",
  },
];

const registrySummary = getRegistrySummary();
const boundaryArtifact = OBSERVATORY_REGISTRY.runtimeArtifacts[0];
const readiness = [
  {
    label: "โครงพื้นที่ 50 เขต",
    detail: `${boundaryArtifact.status} · ล้าง attribute legacy แล้ว · รอตรวจรับขอบเขต กทม.`,
    state: "provisional",
  },
  {
    label: `แหล่งข้อมูล ${registrySummary.datasetCount} ชุด`,
    detail: `${registrySummary.publicDatasetCount} ชุดผ่าน publish gate`,
    state: registrySummary.publicDatasetCount > 0 ? "validated" : "acceptance",
  },
  {
    label: `ผลิตภัณฑ์วิเคราะห์ ${registrySummary.productCount} รายการ`,
    detail: `${registrySummary.publicProductCount} รายการพร้อมเผยแพร่ค่าจริง`,
    state: registrySummary.publicProductCount > 0 ? "validated" : "acceptance",
  },
  {
    label: `Evidence registry ${OBSERVATORY_REGISTRY.registryVersion}`,
    detail: "API และหน้า Evidence อ่านจากทะเบียนเดียวกัน",
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
              วิธีคำนวณ coverage และข้อจำกัดก่อนนำไปตรวจสอบต่อ
            </p>
          </div>
          <div className="border-l border-[var(--oe-line)] pl-5">
            <p className="text-xs font-bold text-[var(--oe-muted)]">ขอบเขตการใช้งาน</p>
            <p className="mt-2 text-sm leading-6">
              ผลดาวเทียมเป็นสัญญาณคัดกรอง ไม่ใช่ข้อยืนยันระดับภาคสนาม
              และยังไม่มีคะแนนจัดลำดับรวมจนกว่าวิธีวิเคราะห์จะผ่าน validation
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
                <h2 className="text-sm font-bold">Data readiness</h2>
              </div>
              <p className="mt-1 text-xs leading-5 text-[var(--oe-muted)]">
                สถานะนี้บอกความพร้อมของ pipeline ไม่ได้บอกว่าค่าทุกปีพร้อมใช้งาน
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
                ตรวจทะเบียนแหล่งข้อมูล
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
                ทุก workflow ใช้ query state และหลักฐานรูปแบบเดียวกัน เพื่อให้ผลทำซ้ำและตรวจสอบย้อนหลังได้
              </p>
            </div>
            <ol className="border-y border-[var(--oe-line)]">
              {workflows.map((workflow, index) => (
                <li key={workflow.title} className="grid gap-2 border-b border-[var(--oe-line-soft)] py-4 last:border-b-0 sm:grid-cols-[36px_minmax(0,1fr)_190px] sm:items-start">
                  <span className="font-mono text-xs font-bold text-[var(--oe-primary-ink)]">{String(index + 1).padStart(2, "0")}</span>
                  <div>
                    <h3 className="text-sm font-bold">{workflow.title}</h3>
                    <p className="mt-1 text-sm leading-6 text-[var(--oe-muted)]">{workflow.description}</p>
                  </div>
                  <p className="text-xs font-semibold text-[var(--oe-muted)] sm:text-right">{workflow.result}</p>
                </li>
              ))}
            </ol>
          </div>
        </section>

        <section className="mt-10 grid gap-5 border-y border-[var(--oe-line)] py-7 lg:grid-cols-[300px_minmax(0,1fr)]">
          <div>
            <h2 className="text-xl font-bold">กติกาก่อนอ่านผล</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--oe-muted)]">
              ระบบใหม่เลือกไม่แสดงค่าดีกว่าแสดง fallback ที่อาจทำให้เข้าใจว่าเป็นข้อมูลจริง
            </p>
          </div>
          <dl className="grid gap-x-8 gap-y-5 md:grid-cols-2">
            <div>
              <dt className="text-sm font-bold">ช่วงสังเกตไม่เท่ากับวันที่ประมวลผล</dt>
              <dd className="mt-1 text-sm leading-6 text-[var(--oe-muted)]">ทั้งสองวันต้องแสดงแยกกันพร้อม latency ของแหล่งข้อมูล</dd>
            </div>
            <div>
              <dt className="text-sm font-bold">Resolution ต้องตรงกับข้อสรุป</dt>
              <dd className="mt-1 text-sm leading-6 text-[var(--oe-muted)]">ข้อมูล 10 กิโลเมตรจะไม่ถูกนำเสนอเสมือนเป็นค่าระดับถนน</dd>
            </div>
            <div>
              <dt className="text-sm font-bold">ความสัมพันธ์ไม่ใช่สาเหตุ</dt>
              <dd className="mt-1 text-sm leading-6 text-[var(--oe-muted)]">ผลเชื่อมโยงกับประชากรหรือบริการเมืองเป็นจุดเริ่มตรวจต่อ</dd>
            </div>
            <div>
              <dt className="text-sm font-bold">No-data เป็นสถานะข้อมูล</dt>
              <dd className="mt-1 text-sm leading-6 text-[var(--oe-muted)]">ไม่เติมศูนย์ ไม่จัดอันดับ และไม่ซ่อนพื้นที่ที่ coverage ต่ำ</dd>
            </div>
          </dl>
        </section>

        <footer className="flex flex-wrap items-center justify-between gap-3 py-6 text-xs text-[var(--oe-muted)]">
          <span>Bangkok Urban Earth Observatory · R&D baseline 2026-07-26</span>
          <span>Remote sensing + Bangkok Open Data</span>
        </footer>
      </main>
    </AppShell>
  );
}
