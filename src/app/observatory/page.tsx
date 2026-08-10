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

type ObservatorySeason = "hot" | "wet" | "cool";

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
  const isVegetation = lens === "vegetation";
  const year = safeYear(first(params.year), isVegetation ? 2025 : 2024);
  const baseline = Math.min(
    safeYear(first(params.baseline), isVegetation ? 2024 : 2018),
    year - 1,
  );
  const requestedSeason = first(params.season);
  const season: ObservatorySeason =
    requestedSeason === "hot" || requestedSeason === "cool"
      ? requestedSeason
      : "wet";
  const area = first(params.area) || "bangkok";
  const mode = first(params.mode) === "gee" ? "gee" : "district";
  const compare = first(params.compare) === "1";

  return (
    <AppShell>
      <ObservatoryWorkspace
        initialLens={lens}
        initialYear={year}
        initialBaseline={baseline}
        initialSeason={season}
        initialArea={area}
        initialMode={mode}
        initialCompare={compare}
      />
    </AppShell>
  );
}
