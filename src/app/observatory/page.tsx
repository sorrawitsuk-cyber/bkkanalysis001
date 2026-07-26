import AppShell from "@/components/observatory/AppShell";
import ObservatoryWorkspace from "@/components/observatory/ObservatoryWorkspace";
import {
  DEFAULT_LENS_ID,
  OBSERVATORY_LENSES,
  type ObservatoryLensId,
} from "@/lib/observatory/catalog";

type ObservatoryPageProps = {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
};

function first(value: string | string[] | undefined) {
  return Array.isArray(value) ? value[0] : value;
}

function safeYear(value: string | undefined, fallback: number) {
  const parsed = Number(value);
  return Number.isInteger(parsed) && parsed >= 2015 && parsed <= 2026 ? parsed : fallback;
}

export default async function ObservatoryPage({ searchParams }: ObservatoryPageProps) {
  const params = await searchParams;
  const requestedLens = first(params.lens);
  const lens = OBSERVATORY_LENSES.some((item) => item.id === requestedLens)
    ? requestedLens as ObservatoryLensId
    : DEFAULT_LENS_ID;
  const year = safeYear(first(params.year), 2024);
  const baseline = Math.min(safeYear(first(params.baseline), 2018), year - 1);
  const area = first(params.area) || "bangkok";

  return (
    <AppShell>
      <ObservatoryWorkspace
        initialLens={lens}
        initialYear={year}
        initialBaseline={baseline}
        initialArea={area}
      />
    </AppShell>
  );
}
