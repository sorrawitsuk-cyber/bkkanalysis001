/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useRef } from "react";
import L from "leaflet";
import "leaflet/dist/leaflet.css";
import { builtChangeColor, builtCoverColor, formatUrbanChange, formatUrbanPercent, formatUrbanRai } from "@/lib/urban-expansion";
import { bindLeafletKeyboardSelection } from "@/lib/leaflet-keyboard";

interface Props {
  geojsonData: any;
  rasterUrl: string | null;
  rasterVisible: boolean;
  mode: "cover" | "change";
  activeDistrict: string;
  opacity: number;
  baseMap: "dark" | "light" | "satellite" | "streets" | "none";
  onDistrictSelect: (district: string) => void;
}

const ALL_DISTRICTS = "ทั้งหมด";
const BKK_BOUNDS: [[number, number], [number, number]] = [[13.494, 100.329], [13.956, 100.935]];
const BASE_MAPS = {
  dark: {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  },
  light: {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors &copy; <a href="https://carto.com/attributions">CARTO</a>',
    url: "https://{s}.basemaps.cartocdn.com/light_all/{z}/{x}/{y}{r}.png",
  },
  satellite: {
    attribution: "Tiles &copy; Esri",
    url: "https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}",
  },
  streets: {
    attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors',
    url: "https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png",
  },
};

export default function UrbanExpansionMap(props: Props) {
  const {
    activeDistrict,
    baseMap,
    geojsonData,
    mode,
    onDistrictSelect,
    opacity,
    rasterUrl,
    rasterVisible,
  } = props;
  const mapRef = useRef<L.Map | null>(null);
  const baseRef = useRef<L.TileLayer | null>(null);
  const baseAttributionRef = useRef(BASE_MAPS.dark.attribution);
  const rasterRef = useRef<L.TileLayer | null>(null);
  const geoRef = useRef<L.GeoJSON | null>(null);

  useEffect(() => {
    if (mapRef.current) return;
    mapRef.current = L.map("urban-expansion-map", { center: [13.7563, 100.5018], zoom: 10, zoomControl: false });
    L.control.zoom({ position: "bottomright" }).addTo(mapRef.current);
    baseRef.current = L.tileLayer(BASE_MAPS.dark.url, { attribution: BASE_MAPS.dark.attribution, maxZoom: 19 }).addTo(mapRef.current);
    mapRef.current.fitBounds(BKK_BOUNDS, { padding: [12, 12] });
    return () => { mapRef.current?.remove(); mapRef.current = null; };
  }, []);

  useEffect(() => {
    if (!baseRef.current) return;
    if (baseMap === "none") return void baseRef.current.setOpacity(0);
    const nextBasemap = BASE_MAPS[baseMap];
    if (mapRef.current?.attributionControl) {
      mapRef.current.attributionControl.removeAttribution(baseAttributionRef.current);
      mapRef.current.attributionControl.addAttribution(nextBasemap.attribution);
      baseAttributionRef.current = nextBasemap.attribution;
    }
    baseRef.current.options.attribution = nextBasemap.attribution;
    baseRef.current.setOpacity(1);
    baseRef.current.setUrl(nextBasemap.url);
  }, [baseMap]);

  useEffect(() => {
    if (!mapRef.current) return;
    rasterRef.current?.remove();
    rasterRef.current = null;
    if (rasterVisible && rasterUrl) rasterRef.current = L.tileLayer(rasterUrl, { opacity, maxZoom: 20 }).addTo(mapRef.current);
  }, [opacity, rasterUrl, rasterVisible]);

  useEffect(() => {
    if (!mapRef.current || !geojsonData) return;
    geoRef.current?.remove();
    geoRef.current = L.geoJSON(geojsonData, {
      style: (feature) => {
        const p = feature?.properties ?? {};
        const selected = activeDistrict === p.district_name;
        const value = mode === "change" ? p.built_change_pp : p.built_cover_pct;
        return {
          color: selected ? "#fff" : "#94a3b8",
          weight: selected ? 2.5 : 0.8,
          fillColor: mode === "change" ? builtChangeColor(value) : builtCoverColor(value),
          fillOpacity: rasterVisible ? (selected ? 0.24 : 0.08) : (selected ? 0.82 : 0.6),
        };
      },
      onEachFeature: (feature, layer) => {
        const p = feature.properties ?? {};
        const district = p.district_name ?? p.name_th;
        bindLeafletKeyboardSelection(layer, `เลือกเขต${district}บนแผนที่`, () => onDistrictSelect(activeDistrict === district ? ALL_DISTRICTS : district));
        layer.bindTooltip(
          `<div class="min-w-[205px] rounded border border-slate-700 bg-slate-900 p-2 text-slate-100"><div class="font-bold text-slate-100">เขต${district}</div>
          <div class="mt-1 text-xs">Built-up cover: <b>${formatUrbanPercent(p.built_cover_pct)}</b></div>
          <div class="text-xs">พื้นที่: <b>${formatUrbanRai(p.built_area_rai)}</b></div>
          <div class="text-xs">เปลี่ยนจากปีฐาน: <b>${formatUrbanChange(p.built_change_pp)}</b></div>
          <div class="text-xs">สีเขียว → สิ่งปลูกสร้าง: <b>${formatUrbanPercent(p.green_to_built_pct)}</b></div></div>`,
          { sticky: true, direction: "top" },
        );
        layer.on("click", () => onDistrictSelect(activeDistrict === district ? ALL_DISTRICTS : district));
      },
    }).addTo(mapRef.current);
    if (activeDistrict === ALL_DISTRICTS) mapRef.current.fitBounds(BKK_BOUNDS, { padding: [12, 12] });
    else geoRef.current.eachLayer((layer: any) => {
      if (layer.feature?.properties?.district_name === activeDistrict && layer.getBounds) mapRef.current?.fitBounds(layer.getBounds(), { padding: [40, 40], maxZoom: 13 });
    });
  }, [activeDistrict, geojsonData, mode, onDistrictSelect, rasterVisible]);

  return <div id="urban-expansion-map" className="h-full w-full bg-slate-950" />;
}
