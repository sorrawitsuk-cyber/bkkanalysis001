/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useMemo } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import {
  formatPopulation,
  formatPopulationPercent,
  populationColor,
  populationMetricValue,
  type PopulationMetric,
  type PopulationRow,
} from "@/lib/population";

function FitBounds({ data, activeId }: { data: any; activeId: number | null }) {
  const map = useMap();
  useEffect(() => {
    if (!data) return;
    const selected = activeId === null
      ? data
      : {
          type: "FeatureCollection",
          features: data.features.filter((feature: any) => Number(feature.properties?.id) === activeId),
        };
    const bounds = L.geoJSON(selected).getBounds();
    if (bounds.isValid()) map.flyToBounds(bounds, { padding: [30, 30], duration: 0.5 });
  }, [activeId, data, map]);
  return null;
}

const METRIC_LABELS: Record<PopulationMetric, string> = {
  population: "ประชากร",
  density: "ความหนาแน่น",
  change_pct: "เปลี่ยนจากปีก่อน",
  houses: "จำนวนบ้าน",
};

export default function PopulationMap({
  geojsonData,
  rows,
  metric,
  activeId,
  onSelect,
}: {
  geojsonData: any;
  rows: PopulationRow[];
  metric: PopulationMetric;
  activeId: number | null;
  onSelect: (row: PopulationRow) => void;
}) {
  const values = rows
    .map((row) => populationMetricValue(row, metric))
    .filter((value): value is number => typeof value === "number" && Number.isFinite(value));
  const min = Math.min(...values, 0);
  const max = Math.max(...values, 1);
  const rowById = useMemo(() => new Map(rows.map((row) => [row.id, row])), [rows]);
  const mapKey = `${metric}-${geojsonData?.features?.length ?? 0}`;

  return (
    <MapContainer
      key={mapKey}
      center={[13.7563, 100.5018]}
      zoom={10}
      className="h-full w-full bg-slate-950"
      attributionControl={false}
    >
      <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
      {geojsonData && (
        <>
          <GeoJSON
            data={geojsonData}
            style={(feature) => {
              const row = rowById.get(Number(feature?.properties?.id));
              const value = row ? populationMetricValue(row, metric) : null;
              const selected = activeId === null || row?.id === activeId;
              return {
                color: row?.id === activeId ? "#ffffff" : "#64748b",
                weight: row?.id === activeId ? 2.5 : 0.7,
                fillColor: populationColor(value, min, max, metric),
                fillOpacity: selected ? 0.78 : 0.15,
              };
            }}
            onEachFeature={(feature, layer) => {
              const row = rowById.get(Number(feature.properties?.id));
              if (!row) return;
              layer.bindTooltip(`
                <div class="min-w-[220px]">
                  <strong>${row.level === "district" ? "เขต" : ""}${row.name}</strong>
                  ${row.level === "subdistrict" ? `<span class="text-slate-500"> · เขต${row.district_name}</span>` : ""}
                  <br/>ประชากร: <strong>${formatPopulation(row.population)} คน</strong>
                  <br/>ความหนาแน่น: ${formatPopulation(row.density)} คน/ตร.กม.
                  <br/>เปลี่ยนจากปีก่อน: ${formatPopulationPercent(row.change_pct)}
                  <br/>ชาย ${formatPopulation(row.male)} · หญิง ${formatPopulation(row.female)}
                  <br/>บ้าน: ${formatPopulation(row.houses)} หลัง
                </div>
              `, { sticky: true });
              layer.on("click", () => onSelect(row));
            }}
          />
          <FitBounds data={geojsonData} activeId={activeId} />
        </>
      )}
      <div className="leaflet-bottom leaflet-left">
        <div className="leaflet-control m-3 rounded-lg border border-slate-700 bg-slate-950/90 px-3 py-2 text-[10px] text-slate-300 shadow-xl">
          <div className="mb-1 font-bold">{METRIC_LABELS[metric]}</div>
          <div className="flex items-center gap-1">
            <span>{metric === "change_pct" ? "ลดลง" : "น้อย"}</span>
            <span className={`h-2 w-24 rounded ${
              metric === "change_pct"
                ? "bg-gradient-to-r from-red-700 via-yellow-400 to-emerald-600"
                : "bg-gradient-to-r from-indigo-200 via-indigo-500 to-indigo-950"
            }`} />
            <span>{metric === "change_pct" ? "เพิ่มขึ้น" : "มาก"}</span>
          </div>
        </div>
      </div>
    </MapContainer>
  );
}
