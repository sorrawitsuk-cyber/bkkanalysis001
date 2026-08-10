/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect } from "react";
import { GeoJSON, MapContainer, TileLayer, useMap } from "react-leaflet";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { bindLeafletKeyboardSelection } from "@/lib/leaflet-keyboard";
import type { DecisionMode } from "@/lib/decision-support";

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

function heatFlagColor(flagCount: number | null, ready: boolean) {
  if (!ready || flagCount === null) return "#475569";
  if (flagCount >= 3) return "#b91c1c";
  if (flagCount === 2) return "#ea580c";
  if (flagCount === 1) return "#d97706";
  return "#0f766e";
}

export default function DecisionSupportMap({
  data,
  mode,
  activeDistrict,
  onDistrictSelect,
}: {
  data: any;
  mode: DecisionMode;
  activeDistrict: string;
  onDistrictSelect: (district: string) => void;
}) {
  return (
    <MapContainer center={[13.7563, 100.5018]} zoom={10} className="h-full w-full bg-slate-950" attributionControl={false}>
      <TileLayer
        attribution="&copy; OpenStreetMap contributors"
        url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
      />
      {data && (
        <>
          <GeoJSON
            key={`${mode}-${activeDistrict}-${data.features?.[0]?.properties?.score ?? "empty"}`}
            data={data}
            style={(feature) => {
              const selected = activeDistrict === "ทั้งหมด" || feature?.properties?.district_name === activeDistrict;
              return {
                color: feature?.properties?.district_name === activeDistrict ? "#fff" : "#1e293b",
                weight: feature?.properties?.district_name === activeDistrict ? 3 : 1,
                fillColor: mode === "heat"
                  ? heatFlagColor(
                      feature?.properties?.screening?.flag_count ?? null,
                      Boolean(feature?.properties?.screening?.ready),
                    )
                  : scoreColor(
                      feature?.properties?.score ?? null,
                      feature?.properties?.coverage ?? null,
                    ),
                fillOpacity: selected ? 0.78 : 0.18,
              };
            }}
            onEachFeature={(feature, layer) => {
              const properties = feature.properties ?? {};
              bindLeafletKeyboardSelection(layer, `เลือกเขต${properties.district_name}บนแผนที่`, () => onDistrictSelect(properties.district_name));
              const tooltip = mode === "heat"
                ? `<div class="min-w-[200px]">
                    <strong>${properties.district_name}</strong><br/>
                    สัญญาณคัดกรอง: <strong>${properties.screening?.flag_count ?? "ข้อมูลไม่พอ"}${properties.screening?.ready ? "/3" : ""}</strong><br/>
                    LST เฉลี่ยรายเขต: ${properties.mean_lst == null ? "ไม่มีข้อมูล" : `${Number(properties.mean_lst).toFixed(2)} °C`}<br/>
                    ประชากรทะเบียน: ${properties.population == null ? "ไม่มีข้อมูล" : Number(properties.population).toLocaleString("th-TH")} คน<br/>
                    เข้าถึงพื้นที่คลายร้อน: ${properties.recreation_access_pct == null ? "ไม่มีข้อมูล" : `${Number(properties.recreation_access_pct).toFixed(1)}%`}
                  </div>`
                : `<div class="min-w-[180px]">
                    <strong>${properties.district_name}</strong><br/>
                    คะแนน: <strong>${properties.score ?? "ไม่ออกคะแนน"}</strong>${properties.score == null ? "" : "/100"}<br/>
                    ระดับ: ${properties.level}<br/>
                    ความเชื่อมั่น: ${properties.confidence} (${properties.coverage}%)
                  </div>`;
              layer.bindTooltip(
                tooltip,
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
