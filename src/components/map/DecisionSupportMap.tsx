/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";

function FitBounds({ data }: { data: any }) {
  const map = useMap();
  useEffect(() => {
    if (!data) return;
    const layer = L.geoJSON(data);
    const bounds = layer.getBounds();
    if (bounds.isValid()) map.fitBounds(bounds, { padding: [20, 20] });
  }, [data, map]);
  return null;
}

function scoreColor(score: number | null, coverage: number | null) {
  if (coverage !== null && coverage < 40) return "#475569";
  if (score === null) return "#475569";
  if (score >= 80) return "#b91c1c";
  if (score >= 60) return "#f97316";
  if (score >= 40) return "#eab308";
  return "#16a34a";
}

export default function DecisionSupportMap({
  data,
  activeDistrict,
  onDistrictSelect,
}: {
  data: any;
  activeDistrict: string;
  onDistrictSelect: (district: string) => void;
}) {
  return (
    <MapContainer center={[13.7563, 100.5018]} zoom={10} className="h-full w-full bg-slate-950" attributionControl={false}>
      <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_all/{z}/{x}/{y}{r}.png" />
      {data && (
        <>
          <GeoJSON
            key={`${activeDistrict}-${data.features?.[0]?.properties?.score ?? "empty"}`}
            data={data}
            style={(feature) => {
              const selected = activeDistrict === "ทั้งหมด" || feature?.properties?.district_name === activeDistrict;
              return {
                color: feature?.properties?.district_name === activeDistrict ? "#fff" : "#1e293b",
                weight: feature?.properties?.district_name === activeDistrict ? 3 : 1,
                fillColor: scoreColor(
                  feature?.properties?.score ?? null,
                  feature?.properties?.coverage ?? null,
                ),
                fillOpacity: selected ? 0.78 : 0.18,
              };
            }}
            onEachFeature={(feature, layer) => {
              const properties = feature.properties ?? {};
              layer.bindTooltip(
                `<div class="min-w-[180px]">
                  <strong>${properties.district_name}</strong><br/>
                  คะแนน: <strong>${properties.score ?? "ไม่ออกคะแนน"}</strong>${properties.score == null ? "" : "/100"}<br/>
                  ระดับ: ${properties.level}<br/>
                  ความเชื่อมั่น: ${properties.confidence} (${properties.coverage}%)
                </div>`,
                { sticky: true },
              );
              layer.on("click", () => onDistrictSelect(properties.district_name));
            }}
          />
          <FitBounds data={data} />
        </>
      )}
    </MapContainer>
  );
}
