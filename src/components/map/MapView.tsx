/* eslint-disable @typescript-eslint/no-explicit-any */
"use client";

import { useEffect, useState } from "react";
import { MapContainer, TileLayer, GeoJSON } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix standard Leaflet icon issues in Next.js
const iconRetinaUrl = '/leaflet/marker-icon-2x.png';
const iconUrl = '/leaflet/marker-icon.png';
const shadowUrl = '/leaflet/marker-shadow.png';

if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl,
    iconUrl,
    shadowUrl,
  });
}

interface MapViewProps {
  onSelectDistrict: (district: any) => void;
  activeTag: string;
  selectedYear: number;
}

export default function MapView({ onSelectDistrict, activeTag, selectedYear }: MapViewProps) {
  const [geoData, setGeoData] = useState<any>(null);

  useEffect(() => {
    // Fetch district boundaries and properties with year param
    fetch(`/api/districts?year=${selectedYear}`)
      .then(res => res.json())
      .then(data => setGeoData(data))
      .catch(err => console.error(err));
  }, [selectedYear]);

  // Dynamic choropleth color scale based on selected tag
  const getChoroplethColor = (feature: any) => {
    const props = feature.properties;
    
    if (activeTag === "ความหนาแน่น") {
      const d = props.density;
      return d > 10000 ? '#800026' : d > 8000 ? '#BD0026' : d > 6000 ? '#E31A1C' : d > 4000 ? '#FC4E2A' : d > 2000 ? '#FD8D3C' : '#FFEDA0';
    } 
    if (activeTag === "ประชากร") {
      const p = props.population;
      return p > 150000 ? '#08519c' : p > 100000 ? '#3182bd' : p > 70000 ? '#6baed6' : '#c6dbef';
    }
    if (activeTag === "อัตราการเติบโต") {
      const g = props.growth_rate;
      return g > 2 ? '#006d2c' : g > 0 ? '#31a354' : g > -1 ? '#fdae6b' : '#d94801';
    }
    if (activeTag === "การเข้าถึง") {
      const a = props.accessibility_index;
      return a > 8 ? '#4a1486' : a > 6 ? '#6a51a3' : a > 4 ? '#9e9ac8' : '#cbc9e2';
    }
    if (activeTag === "การร้องเรียน") {
      const t = props.traffy_issues || 0;
      return t > 2500 ? '#990000' : t > 1500 ? '#d73027' : t > 800 ? '#fc8d59' : t > 300 ? '#fee090' : '#ffffbf';
    }
    
    // Default (Green Space / พื้นที่สีเขียว)
    return '#78c679';
  };

  const style = (feature: any) => {
    return {
      fillColor: getChoroplethColor(feature),
      weight: 1.5,
      opacity: 1,
      color: 'white',
      dashArray: '3',
      fillOpacity: 0.75
    };
  };

  const onEachFeature = (feature: any, layer: any) => {
    layer.on({
      mouseover: (e: any) => {
        const target = e.target;
        target.setStyle({
          weight: 3,
          color: '#6366f1',
          dashArray: '',
          fillOpacity: 0.9
        });
        target.bringToFront();
        // Add tooltip dynamically
        let valueStr = "";
        const p = feature.properties;
        if (activeTag === "ความหนาแน่น") valueStr = `${p.density} คน/ตร.กม.`;
        else if (activeTag === "ประชากร") valueStr = `${p.population} คน`;
        else if (activeTag === "อัตราการเติบโต") valueStr = `${p.growth_rate}%`;
        else if (activeTag === "การเข้าถึง") valueStr = `ดัชนี ${p.accessibility_index}`;
        else if (activeTag === "การร้องเรียน") valueStr = `${p.traffy_issues || 0} เรื่อง`;

        layer.bindTooltip(`<b>${p.name_th}</b><br/>${valueStr}`, {
          sticky: true,
          className: 'bg-white/90 backdrop-blur-sm border-0 shadow-lg rounded-lg text-sm px-3 py-2 font-sans'
        }).openTooltip();
      },
      mouseout: () => {
        const target = layer;
        target.setStyle(style(feature));
        layer.closeTooltip();
      },
      click: (e: any) => {
        L.DomEvent.stopPropagation(e);
        onSelectDistrict(feature.properties);
      }
    });
  };

  return (
    <MapContainer 
      center={[13.7563, 100.5018]} 
      zoom={11} 
      className="w-full h-full z-0"
      zoomControl={false}
      attributionControl={false}
    >
      <TileLayer
        url="https://{s}.basemaps.cartocdn.com/light_nolabels/{z}/{x}/{y}{r}.png"
      />
      {geoData && (
        <GeoJSON 
          key={`${activeTag}-${selectedYear}`} // Force re-render on tag or year change
          data={geoData} 
          style={style}
          onEachFeature={onEachFeature}
        />
      )}
      <div className="absolute bottom-2 right-2 text-[10px] text-slate-400 z-[1000] bg-white/50 px-2 py-1 rounded">
        &copy; CARTO
      </div>
    </MapContainer>
  );
}
