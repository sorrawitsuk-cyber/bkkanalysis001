import Link from "next/link";
import { ArrowRight, MapPinned } from "lucide-react";
import AppShell from "@/components/observatory/AppShell";
import districtGeoJson from "@/data/observatory/bkk-districts.provisional.json";

const districts = districtGeoJson.features
  .map((feature) => ({
    id: feature.properties.legacyId,
    areaCode: feature.properties.areaCode,
    nameTh: feature.properties.nameTh,
    nameEn: feature.properties.nameEn,
  }))
  .sort((a, b) => a.nameTh.localeCompare(b.nameTh, "th"));

export default function AreasPage() {
  return (
    <AppShell>
      <main className="mx-auto max-w-[1200px] px-4 py-7 sm:px-6">
        <header className="grid gap-5 border-b border-[var(--oe-line)] pb-6 md:grid-cols-[minmax(0,1fr)_320px]">
          <div>
            <div className="flex items-center gap-2 text-sm font-semibold text-[var(--oe-primary-ink)]">
              <MapPinned className="h-4 w-4" />
              พื้นที่ศึกษา
            </div>
            <h1 className="mt-3 text-3xl font-bold tracking-[-0.025em]">เลือกเขตเพื่อเริ่มอ่านหลักฐานเชิงพื้นที่</h1>
            <p className="mt-3 max-w-3xl text-sm leading-7 text-[var(--oe-muted)]">
              รุ่นนี้ใช้รายชื่อและขอบเขตระดับเขตเป็นจุดเริ่มต้น
              ข้อมูลประกอบอื่นจะแสดงเฉพาะเมื่อผ่านการตรวจสอบแล้ว
            </p>
          </div>
          <div className="border-l border-[var(--oe-line)] pl-5 text-sm leading-6 text-[var(--oe-muted)]">
            ขอบเขตพื้นที่ แหล่งที่มา และวันที่เผยแพร่ยังอยู่ในขั้นตรวจรับ
            ก่อนใช้เป็นฐานอ้างอิงถาวร
          </div>
        </header>

        <section className="mt-6 overflow-hidden rounded-[var(--radius-panel)] border border-[var(--oe-line)] bg-white">
          <div className="border-b border-[var(--oe-line)] px-4 py-3">
            <h2 className="text-sm font-bold">50 เขตของกรุงเทพมหานคร</h2>
            <p className="mt-1 text-xs text-[var(--oe-muted)]">เลือกเขตเพื่อเปิดแผนที่และอ่านข้อมูลที่เกี่ยวข้อง</p>
          </div>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3">
            {districts.map((district) => (
              <Link
                key={district.areaCode}
                href={`/observatory?area=${encodeURIComponent(district.nameTh)}&lens=heat&year=2024&baseline=2018`}
                className="group flex min-h-16 items-center gap-3 border-b border-r border-[var(--oe-line-soft)] px-4 py-3 outline-none hover:bg-[var(--oe-surface-muted)] focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-[var(--oe-primary)]"
              >
                <span className="font-mono text-xs font-bold text-[var(--oe-primary-ink)]">{district.areaCode.replace("BKK-", "")}</span>
                <span className="min-w-0">
                  <span className="block text-sm font-bold">{district.nameTh}</span>
                  <span className="block truncate text-xs text-[var(--oe-muted)]">{district.nameEn}</span>
                </span>
                <ArrowRight className="ml-auto h-4 w-4 shrink-0 text-[var(--oe-muted)] transition-transform duration-150 group-hover:translate-x-1" />
              </Link>
            ))}
          </div>
        </section>
      </main>
    </AppShell>
  );
}
