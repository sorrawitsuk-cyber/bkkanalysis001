import Link from "next/link";
import { ArrowUpRight, Database, FlaskConical, ShieldCheck } from "lucide-react";
import AppShell from "@/components/observatory/AppShell";
import {
  getRegistrySummary,
  OBSERVATORY_REGISTRY,
  REGISTRY_DATASETS,
  REGISTRY_PRODUCTS,
  type AcceptanceStatus,
} from "@/lib/observatory/registry";

const readinessLabels: Record<AcceptanceStatus, string> = {
  provisional: "ใช้ชั่วคราว",
  acceptance: "รอตรวจรับข้อมูล",
  research: "ใช้เพื่อ R&D",
  validated: "ผ่านการตรวจรับ",
  retired: "ยุติการใช้",
};

const readinessTone: Record<AcceptanceStatus, string> = {
  provisional: "bg-[var(--oe-warning-soft)] text-[var(--oe-warning-ink)]",
  acceptance: "bg-[var(--oe-info-soft)] text-[var(--oe-info-ink)]",
  research: "bg-[var(--oe-surface-muted)] text-[var(--oe-muted)]",
  validated: "bg-[var(--oe-success-soft)] text-[var(--oe-success-ink)]",
  retired: "bg-[var(--oe-surface-muted)] text-[var(--oe-muted)]",
};

const methodRules = [
  "เปรียบเทียบเดือนหรือฤดูกาลเดียวกัน และเปิดเผย baseline",
  "ใช้ pixel-area weighting พร้อม valid coverage",
  "รายงาน median, percentile และ IQR ไม่ใช้ค่าเฉลี่ยเขตเพียงค่าเดียว",
  "change candidate ต้องต่อเนื่องหลาย acquisition",
  "ไม่เติม missing ด้วยศูนย์และไม่จัดอันดับเมื่อ coverage ต่ำ",
  "เก็บ dataset, method, code, boundary และ processing version ทุกผลลัพธ์",
];

export default function EvidencePage() {
  const summary = getRegistrySummary();

  return (
    <AppShell>
      <main className="mx-auto max-w-[1400px] px-4 py-7 sm:px-6">
        <header className="grid gap-5 border-b border-[var(--oe-line)] pb-6 lg:grid-cols-[minmax(0,1fr)_380px]">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--oe-primary-ink)]">
              <Database className="h-4 w-4" />
              หลักฐานข้อมูล
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-[-0.025em]">ทะเบียนแหล่งข้อมูลและข้อจำกัดก่อนนำไปวิเคราะห์</h1>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-[var(--oe-muted)]">
              ทะเบียนรุ่น {OBSERVATORY_REGISTRY.registryVersion} แยกสถานะแหล่งข้อมูลออกจากสถานะผลิตภัณฑ์
              และยังไม่เผยแพร่ค่าจริงจนกว่า source, license, method, coverage และ processing run จะผ่านเกณฑ์ครบ
            </p>
          </div>
          <div className="rounded-[var(--radius-panel)] bg-[var(--oe-info-soft)] p-4 text-sm leading-6 text-[var(--oe-info-ink)]">
            <div className="flex items-center gap-2 font-bold">
              <ShieldCheck className="h-4 w-4" />
              Data failure policy
            </div>
            <p className="mt-2">
              หากข้อมูลจริงใช้ไม่ได้ ระบบจะแสดง unavailable หรือ last validated vintage
              และจะไม่สร้างค่าจำลองเพื่อเติมแผนที่
            </p>
          </div>
        </header>

        <section className="mt-6 grid overflow-hidden rounded-[var(--radius-panel)] border border-[var(--oe-line)] bg-white sm:grid-cols-2 lg:grid-cols-4">
          <div className="border-b border-[var(--oe-line-soft)] p-4 sm:border-r lg:border-b-0">
            <p className="text-xs font-bold text-[var(--oe-muted)]">แหล่งข้อมูลในทะเบียน</p>
            <p className="mt-2 text-2xl font-bold">{summary.datasetCount}</p>
          </div>
          <div className="border-b border-[var(--oe-line-soft)] p-4 lg:border-b-0 lg:border-r">
            <p className="text-xs font-bold text-[var(--oe-muted)]">ผลิตภัณฑ์วิเคราะห์</p>
            <p className="mt-2 text-2xl font-bold">{summary.productCount}</p>
          </div>
          <div className="border-b border-[var(--oe-line-soft)] p-4 sm:border-b-0 sm:border-r">
            <p className="text-xs font-bold text-[var(--oe-muted)]">ผ่าน publish gate</p>
            <p className="mt-2 text-2xl font-bold text-[var(--oe-success-ink)]">{summary.publicProductCount}</p>
          </div>
          <div className="p-4">
            <p className="text-xs font-bold text-[var(--oe-muted)]">อยู่ระหว่างตรวจรับ / R&D</p>
            <p className="mt-2 text-2xl font-bold">
              {summary.products.acceptance + summary.products.research + summary.products.provisional}
            </p>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--oe-line)] bg-white">
          <div className="border-b border-[var(--oe-line)] px-4 py-4">
            <h2 className="text-base font-bold">ทะเบียนแหล่งข้อมูล</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--oe-muted)]">
              แหล่งข้อมูลที่สถานะยังไม่เป็น “ผ่านการตรวจรับ” ใช้ได้เฉพาะงานเตรียมระบบและการวิจัย
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
              <caption className="sr-only">ทะเบียนแหล่งข้อมูลสำหรับ Bangkok Urban Earth Observatory</caption>
              <thead className="bg-[var(--oe-surface-muted)] text-xs text-[var(--oe-muted)]">
                <tr>
                  <th className="px-4 py-3 font-bold">แหล่งข้อมูล</th>
                  <th className="px-4 py-3 font-bold">บทบาท</th>
                  <th className="px-4 py-3 font-bold">ชนิด</th>
                  <th className="px-4 py-3 font-bold">พื้นที่ / เวลา</th>
                  <th className="px-4 py-3 font-bold">สถานะ</th>
                  <th className="px-4 py-3 font-bold">ข้อจำกัดหลัก</th>
                </tr>
              </thead>
              <tbody>
                {REGISTRY_DATASETS.map((dataset) => (
                  <tr key={dataset.id} className="border-t border-[var(--oe-line-soft)] align-top">
                    <td className="px-4 py-4">
                      <a
                        href={dataset.sourceUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="inline-flex items-center gap-1.5 font-bold text-[var(--oe-primary-ink)] outline-none hover:underline focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)]"
                      >
                        {dataset.name}
                        <ArrowUpRight className="h-3.5 w-3.5" />
                      </a>
                      <p className="mt-1 text-xs text-[var(--oe-muted)]">{dataset.owner}</p>
                    </td>
                    <td className="px-4 py-4 leading-6">{dataset.roleTh}</td>
                    <td className="px-4 py-4 text-xs font-semibold">{dataset.measurementType}</td>
                    <td className="px-4 py-4 text-xs leading-5 text-[var(--oe-muted)]">
                      <span className="block">{dataset.spatialResolution}</span>
                      <span className="block">{dataset.temporalCadence}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${readinessTone[dataset.acceptance.status]}`}>
                        {readinessLabels[dataset.acceptance.status]}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs leading-5 text-[var(--oe-muted)]">
                      <ul className="space-y-1">
                        {dataset.acceptance.blockers.map((blocker) => (
                          <li key={blocker}>• {blocker}</li>
                        ))}
                      </ul>
                      <span className="mt-2 block font-semibold">
                        License: {dataset.license.name} · {dataset.license.redistribution}
                      </span>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--oe-line)] bg-white">
          <div className="flex items-start gap-3 border-b border-[var(--oe-line)] px-4 py-4">
            <FlaskConical className="mt-0.5 h-4 w-4 shrink-0 text-[var(--oe-primary)]" />
            <div>
              <h2 className="text-base font-bold">ทะเบียนผลิตภัณฑ์วิเคราะห์</h2>
              <p className="mt-1 text-xs leading-5 text-[var(--oe-muted)]">
                แต่ละผลิตภัณฑ์ล็อก source, method version, coverage และจำนวนฉากขั้นต่ำก่อนเผยแพร่
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
              <caption className="sr-only">ทะเบียนผลิตภัณฑ์วิเคราะห์ของ Bangkok Urban Earth Observatory</caption>
              <thead className="bg-[var(--oe-surface-muted)] text-xs text-[var(--oe-muted)]">
                <tr>
                  <th className="px-4 py-3 font-bold">ผลิตภัณฑ์</th>
                  <th className="px-4 py-3 font-bold">แหล่งข้อมูล</th>
                  <th className="px-4 py-3 font-bold">วิธี / หน่วย</th>
                  <th className="px-4 py-3 font-bold">Publish gate</th>
                  <th className="px-4 py-3 font-bold">ข้อจำกัด</th>
                </tr>
              </thead>
              <tbody>
                {REGISTRY_PRODUCTS.map((product) => (
                  <tr key={product.id} className="border-t border-[var(--oe-line-soft)] align-top">
                    <td className="px-4 py-4">
                      <p className="font-bold">{product.nameTh}</p>
                      <p className="mt-1 text-xs text-[var(--oe-muted)]">{product.nameEn}</p>
                      <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${readinessTone[product.publishGate.status]}`}>
                        {readinessLabels[product.publishGate.status]}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs leading-5">
                      {product.sourceDatasetIds.map((datasetId) => (
                        <span key={datasetId} className="block font-mono">{datasetId}</span>
                      ))}
                    </td>
                    <td className="px-4 py-4 text-xs leading-5 text-[var(--oe-muted)]">
                      <span className="block font-mono font-semibold text-[var(--oe-text)]">
                        {product.recipe.methodVersion}
                      </span>
                      <span className="mt-1 block">{product.recipe.temporalComposite}</span>
                      <span className="mt-1 block">หน่วย: {product.unit}</span>
                      {product.evidence ? (
                        <span className="mt-2 block font-semibold text-[var(--oe-success-ink)]">
                          Golden fixture QA: ผ่าน
                        </span>
                      ) : (
                        <span className="mt-2 block">Golden fixture QA: ยังไม่มี</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-xs leading-5">
                      <span className="block">coverage ≥ {Math.round(product.publishGate.minValidCoverage * 100)}%</span>
                      <span className="block">scene ≥ {product.publishGate.minSceneCount}</span>
                      <span className="block">source ต้องผ่านการตรวจรับทุกชุด</span>
                    </td>
                    <td className="px-4 py-4 text-xs leading-5 text-[var(--oe-muted)]">
                      <ul className="space-y-1">
                        {product.limitationsTh.map((limitation) => (
                          <li key={limitation}>• {limitation}</li>
                        ))}
                      </ul>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </section>

        <section className="mt-8 grid gap-6 border-y border-[var(--oe-line)] py-7 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div>
            <h2 className="text-xl font-bold">Method gates</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--oe-muted)]">
              product recipe ต้องผ่านกติกาเหล่านี้ก่อน publish asset และ observation ไปยัง API v2
            </p>
          </div>
          <ol className="grid gap-x-8 gap-y-4 md:grid-cols-2">
            {methodRules.map((rule, index) => (
              <li key={rule} className="flex gap-3">
                <span className="font-mono text-xs font-bold text-[var(--oe-primary-ink)]">{String(index + 1).padStart(2, "0")}</span>
                <span className="text-sm leading-6">{rule}</span>
              </li>
            ))}
          </ol>
        </section>

        <section className="mt-8 flex flex-wrap items-center justify-between gap-4 rounded-[var(--radius-panel)] border border-[var(--oe-line)] bg-white p-5">
          <div>
            <h2 className="text-base font-bold">R&D baseline ถูกบันทึกใน repository แล้ว</h2>
            <p className="mt-1 text-sm text-[var(--oe-muted)]">ดู target schema, migration policy และ release sequence ในเอกสารโครงการ</p>
          </div>
          <Link
            href="/observatory"
            className="inline-flex min-h-11 items-center gap-2 rounded-[var(--radius-control)] bg-[var(--oe-primary)] px-4 text-sm font-bold text-white outline-none hover:bg-[var(--oe-primary-hover)] focus-visible:ring-2 focus-visible:ring-[var(--oe-primary)] focus-visible:ring-offset-2"
          >
            เปิดพื้นที่วิเคราะห์
          </Link>
        </section>
      </main>
    </AppShell>
  );
}
