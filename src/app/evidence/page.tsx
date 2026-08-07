import Link from "next/link";
import { ArrowUpRight, Database, FlaskConical, ShieldCheck } from "lucide-react";
import AppShell from "@/components/observatory/AppShell";
import {
  getRegistrySummary,
  REGISTRY_DATASETS,
  REGISTRY_PRODUCTS,
  type AcceptanceStatus,
} from "@/lib/observatory/registry";

const readinessLabels: Record<AcceptanceStatus, string> = {
  provisional: "ใช้ชั่วคราว",
  acceptance: "รอตรวจรับข้อมูล",
  research: "ใช้ทดลอง",
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
  "เปรียบเทียบเดือนหรือฤดูกาลเดียวกัน และบอกปีอ้างอิงให้ชัด",
  "นับเฉพาะพื้นที่ที่ข้อมูลพร้อมพอสำหรับการอ่านผล",
  "แสดงทั้งค่ากลางและช่วงของค่า ไม่ใช้ค่าเฉลี่ยอย่างเดียว",
  "การเปลี่ยนแปลงควรเห็นต่อเนื่องมากกว่าหนึ่งภาพ",
  "ไม่เติมค่าศูนย์แทนข้อมูลที่หาย และไม่จัดอันดับเมื่อข้อมูลยังไม่พอ",
  "เก็บที่มา วิธีคำนวณ ขอบเขตพื้นที่ และรุ่นข้อมูลไว้ตรวจสอบย้อนหลัง",
];

const measurementLabels: Record<string, string> = {
  administrative: "ข้อมูลจากทะเบียนหรือหน่วยงาน",
  "model-derived": "ข้อมูลที่ประมวลผลจากแบบจำลอง",
  observed: "ข้อมูลจากการสังเกต",
  proxy: "ข้อมูลตัวแทนสำหรับอ่านสัญญาณ",
};

const redistributionLabels: Record<string, string> = {
  allowed: "เผยแพร่ซ้ำได้ตามเงื่อนไข",
  pending: "รอยืนยันสิทธิการใช้",
  restricted: "ใช้แสดงผลเท่านั้น ยังไม่ส่งออกซ้ำ",
};

function plainDatasetText(value: string) {
  return value
    .replaceAll("polygon", "ขอบเขต")
    .replaceAll("candidate", "ข้อมูลที่รอตรวจรับ")
    .replaceAll("geometry", "ขอบเขต")
    .replaceAll("source snapshot", "สำเนาข้อมูลที่ใช้")
    .replaceAll("source", "แหล่งข้อมูล")
    .replaceAll("metadata", "คำอธิบายข้อมูล")
    .replaceAll("License not specified", "ยังไม่ระบุสิทธิการใช้")
    .replaceAll("license", "สิทธิการใช้")
    .replaceAll("checksum", "รหัสตรวจไฟล์")
    .replaceAll("topology", "ความต่อเนื่องของขอบเขต")
    .replaceAll("version", "รุ่นข้อมูล")
    .replaceAll("resource", "ไฟล์เผยแพร่")
    .replaceAll("service CRS EPSG:4326", "ระบบพิกัดของบริการแผนที่")
    .replaceAll("service metadata", "คำอธิบายบริการ")
    .replaceAll("layer", "ชั้นข้อมูล")
    .replaceAll("technical QA", "การตรวจสอบคุณภาพข้อมูล")
    .replaceAll("processing", "การจัดทำข้อมูล")
    .replaceAll("ephemeral", "ชั่วคราว")
    .replaceAll("canonical public boundary", "ขอบเขตเผยแพร่อย่างเป็นทางการ")
    .replaceAll("cache", "เก็บสำเนา")
    .replaceAll("republish", "เผยแพร่ซ้ำ")
    .replaceAll("band", "ชั้นข้อมูล")
    .replaceAll("nominal", "โดยประมาณ")
    .replaceAll("pixel spacing", "ระยะห่างของข้อมูล")
    .replaceAll("orbit", "รอบการเก็บภาพ")
    .replaceAll("product", "ชุดข้อมูล")
    .replaceAll("QA", "การตรวจสอบคุณภาพ");
}

function plainCompositeText(value: string) {
  return value
    .replace("same-season clear-sky composite", "รวมภาพฤดูกาลเดียวกันที่เมฆรบกวนน้อย")
    .replace("same-season surface-reflectance composite", "รวมภาพฤดูกาลเดียวกันเพื่ออ่านสภาพพื้นผิว")
    .replace("same-season multi-acquisition composite", "รวมภาพหลายช่วงในฤดูกาลเดียวกัน")
    .replace("event window with 1, 3 and 7 day antecedent context", "ดูช่วงเหตุการณ์ร่วมกับฝนสะสม 1, 3 และ 7 วันก่อนหน้า")
    .replace("latest compatible vintage with explicit reference date", "ใช้ข้อมูลล่าสุดที่ระบุวันอ้างอิงชัดเจน")
    .replace("daily QA then monthly aggregation", "ตรวจข้อมูลรายวันแล้วสรุปเป็นรายเดือน")
    .replace("monthly or annual quality-controlled composite", "รวมข้อมูลรายเดือนหรือรายปีหลังตรวจคุณภาพ");
}

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
            <h1 className="mt-3 text-3xl font-bold tracking-[-0.025em]">ข้อมูลที่ระบบใช้และข้อควรระวังก่อนอ่านผล</h1>
            <p className="mt-3 max-w-4xl text-sm leading-7 text-[var(--oe-muted)]">
              หน้านี้บอกว่าระบบใช้ข้อมูลอะไร ข้อมูลชุดไหนพร้อมใช้ และอะไรที่ยังต้องระวัง
              ระบบจะแสดงผลวิเคราะห์ต่อเมื่อที่มา สิทธิการใช้ วิธีอ่านค่า และความครบของข้อมูลผ่านการตรวจรับแล้ว
            </p>
          </div>
          <div className="rounded-[var(--radius-panel)] bg-[var(--oe-info-soft)] p-4 text-sm leading-6 text-[var(--oe-info-ink)]">
            <div className="flex items-center gap-2 font-bold">
              <ShieldCheck className="h-4 w-4" />
              นโยบายเมื่อข้อมูลไม่พร้อม
            </div>
            <p className="mt-2">
              หากข้อมูลจริงใช้ไม่ได้ ระบบจะแจ้งว่าไม่พร้อม หรือใช้ชุดข้อมูลล่าสุดที่ผ่านการตรวจรับ
              และจะไม่สร้างค่าจำลองเพื่อเติมแผนที่ให้ดูเหมือนพร้อมใช้งาน
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
            <p className="text-xs font-bold text-[var(--oe-muted)]">พร้อมแสดงผล</p>
            <p className="mt-2 text-2xl font-bold text-[var(--oe-success-ink)]">{summary.publicProductCount}</p>
          </div>
          <div className="p-4">
            <p className="text-xs font-bold text-[var(--oe-muted)]">อยู่ระหว่างตรวจรับ / ทดลอง</p>
            <p className="mt-2 text-2xl font-bold">
              {summary.products.acceptance + summary.products.research + summary.products.provisional}
            </p>
          </div>
        </section>

        <section className="mt-6 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--oe-line)] bg-white">
          <div className="border-b border-[var(--oe-line)] px-4 py-4">
            <h2 className="text-base font-bold">ทะเบียนแหล่งข้อมูล</h2>
            <p className="mt-1 text-xs leading-5 text-[var(--oe-muted)]">
              แหล่งข้อมูลที่ยังไม่ผ่านการตรวจรับ ใช้ได้เฉพาะงานเตรียมระบบและการทดลองเท่านั้น
            </p>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
              <caption className="sr-only">ทะเบียนแหล่งข้อมูลสำหรับ Bangkok Urban Earth Observatory</caption>
              <thead className="bg-[var(--oe-surface-muted)] text-xs text-[var(--oe-muted)]">
                <tr>
                  <th className="px-4 py-3 font-bold">แหล่งข้อมูล</th>
                  <th className="px-4 py-3 font-bold">บทบาท</th>
                  <th className="px-4 py-3 font-bold">อ่านอย่างไร</th>
                  <th className="px-4 py-3 font-bold">ระดับพื้นที่ / ความถี่</th>
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
                    <td className="px-4 py-4 leading-6">{plainDatasetText(dataset.roleTh)}</td>
                    <td className="px-4 py-4 text-xs font-semibold">
                      {measurementLabels[dataset.measurementType] ?? plainDatasetText(dataset.measurementType)}
                    </td>
                    <td className="px-4 py-4 text-xs leading-5 text-[var(--oe-muted)]">
                      <span className="block">{plainDatasetText(dataset.spatialResolution)}</span>
                      <span className="block">{plainDatasetText(dataset.temporalCadence)}</span>
                    </td>
                    <td className="px-4 py-4">
                      <span className={`inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${readinessTone[dataset.acceptance.status]}`}>
                        {readinessLabels[dataset.acceptance.status]}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs leading-5 text-[var(--oe-muted)]">
                      <ul className="space-y-1">
                        {dataset.acceptance.blockers.map((blocker) => (
                          <li key={blocker}>• {plainDatasetText(blocker)}</li>
                        ))}
                      </ul>
                      <span className="mt-2 block font-semibold">
                        สิทธิการใช้: {plainDatasetText(dataset.license.name)} · {redistributionLabels[dataset.license.redistribution]}
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
                แต่ละรายการต้องระบุข้อมูลที่ใช้ วิธีอ่านค่า ความครบของข้อมูล และจำนวนภาพขั้นต่ำก่อนเผยแพร่
              </p>
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="w-full min-w-[1050px] border-collapse text-left text-sm">
              <caption className="sr-only">ทะเบียนผลิตภัณฑ์วิเคราะห์ของ Bangkok Urban Earth Observatory</caption>
              <thead className="bg-[var(--oe-surface-muted)] text-xs text-[var(--oe-muted)]">
                <tr>
                  <th className="px-4 py-3 font-bold">ผลิตภัณฑ์</th>
                  <th className="px-4 py-3 font-bold">ข้อมูลที่ใช้</th>
                  <th className="px-4 py-3 font-bold">วิธีอ่าน / หน่วย</th>
                  <th className="px-4 py-3 font-bold">เงื่อนไขก่อนแสดงผล</th>
                  <th className="px-4 py-3 font-bold">ข้อจำกัด</th>
                </tr>
              </thead>
              <tbody>
                {REGISTRY_PRODUCTS.map((product) => (
                  <tr key={product.id} className="border-t border-[var(--oe-line-soft)] align-top">
                    <td className="px-4 py-4">
                      <p className="font-bold">{product.nameTh}</p>
                      <span className={`mt-2 inline-flex rounded-full px-2.5 py-1 text-[11px] font-bold ${readinessTone[product.publishGate.status]}`}>
                        {readinessLabels[product.publishGate.status]}
                      </span>
                    </td>
                    <td className="px-4 py-4 text-xs leading-5">
                      {product.sourceDatasetIds.length} ชุดข้อมูลที่ตรวจสอบแล้ว
                    </td>
                    <td className="px-4 py-4 text-xs leading-5 text-[var(--oe-muted)]">
                      <span className="mt-1 block">{plainCompositeText(product.recipe.temporalComposite)}</span>
                      <span className="mt-1 block">หน่วย: {product.unit}</span>
                      {product.evidence ? (
                        <span className="mt-2 block font-semibold text-[var(--oe-success-ink)]">
                          ชุดทดสอบมาตรฐาน: ผ่าน
                        </span>
                      ) : (
                        <span className="mt-2 block">ชุดทดสอบมาตรฐาน: ยังไม่มี</span>
                      )}
                    </td>
                    <td className="px-4 py-4 text-xs leading-5">
                      <span className="block">พื้นที่ที่มีข้อมูล ≥ {Math.round(product.publishGate.minValidCoverage * 100)}%</span>
                      <span className="block">จำนวนภาพ ≥ {product.publishGate.minSceneCount}</span>
                      <span className="block">แหล่งข้อมูลต้องผ่านการตรวจรับทุกชุด</span>
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
            <h2 className="text-xl font-bold">กติกาก่อนแสดงผล</h2>
            <p className="mt-2 text-sm leading-6 text-[var(--oe-muted)]">
              ทุกผลวิเคราะห์ต้องผ่านกติกาเหล่านี้ก่อนนำไปแสดงบนหน้าเว็บ
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
            <h2 className="text-base font-bold">แนวทางทดลองถูกบันทึกไว้แล้ว</h2>
            <p className="mt-1 text-sm text-[var(--oe-muted)]">ใช้หน้านี้เพื่อตรวจสถานะข้อมูลก่อนเปิดพื้นที่วิเคราะห์</p>
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
