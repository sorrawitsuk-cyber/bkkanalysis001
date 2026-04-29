"use client";

import { useEffect, useState, useRef, useMemo } from "react";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";

// Fix Leaflet icons in Next.js
if (typeof window !== 'undefined') {
  delete (L.Icon.Default.prototype as any)._getIconUrl;
  L.Icon.Default.mergeOptions({
    iconRetinaUrl: '/leaflet/marker-icon-2x.png',
    iconUrl: '/leaflet/marker-icon.png',
    shadowUrl: '/leaflet/marker-shadow.png',
  });
}

interface MapViewProps {
  activeTag: string;
  traffyData: any;
  mapMode: 'points' | 'heatmap';
}

// Heatmap sub-component (uses leaflet.heat)
function HeatmapLayer({ features }: { features: any[] }) {
  const map = useMap();
  const heatLayerRef = useRef<any>(null);

  useEffect(() => {
    if (!map || !features.length) return;

    // Dynamically import leaflet.heat (client-only)
    import('leaflet.heat').then(() => {
      // Remove previous layer
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
      }

      const heatPoints = features.map(f => {
        const [lon, lat] = f.geometry.coordinates;
        return [lat, lon, 1]; // [lat, lon, intensity]
      });

      heatLayerRef.current = (L as any).heatLayer(heatPoints, {
        radius: 18,
        blur: 25,
        maxZoom: 15,
        max: 1.0,
        gradient: {
          0.0: '#0c1322',
          0.2: '#1e3a5f',
          0.4: '#3b82f6',
          0.6: '#22d3ee',
          0.8: '#fbbf24',
          1.0: '#ef4444'
        }
      }).addTo(map);
    });

    return () => {
      if (heatLayerRef.current) {
        map.removeLayer(heatLayerRef.current);
        heatLayerRef.current = null;
      }
    };
  }, [map, features]);

  return null;
}

// Auto-fit map to data bounds
function MapBoundsFitter({ features }: { features: any[] }) {
  const map = useMap();
  useEffect(() => {
    if (!features || features.length === 0) return;
    
    try {
      const bounds = L.latLngBounds(features.map(f => [
        f.geometry.coordinates[1], // lat
        f.geometry.coordinates[0]  // lon
      ]));
      
      if (bounds.isValid()) {
        map.flyToBounds(bounds, { padding: [50, 50], duration: 1.5, maxZoom: 14 });
      }
    } catch (e) {
      console.error("Error fitting bounds:", e);
    }
  }, [features, map]);
  return null;
}

export default function MapView({ activeTag, traffyData, mapMode }: MapViewProps) {
  const [districtGeoData, setDistrictGeoData] = useState<any>(null);

  useEffect(() => {
    fetch(`/api/districts?year=2024`)
      .then(res => res.json())
      .then(data => setDistrictGeoData(data))
      .catch(err => console.error(err));
  }, []);

  const districtStyle = {
    fillColor: 'transparent',
    weight: 0.8,
    opacity: 0.6,
    color: '#334155',
    fillOpacity: 0
  };

  const getMarkerColor = (state: string) => {
    switch (state) {
      case 'รอรับเรื่อง': return '#ef4444';
      case 'กำลังดำเนินการ': return '#eab308';
      case 'ส่งต่อ(ใหม่)': return '#f97316';
      case 'เสร็จสิ้น': return '#22c55e';
      default: return '#64748b';
    }
  };

  // Filter features based on sidebar selection
  const filteredFeatures = useMemo(() => {
    if (!traffyData?.features) return [];
    return traffyData.features.filter((f: any) => {
      if (activeTag === 'ทั้งหมด') return true;
      if (activeTag === 'รอรับเรื่อง' && f.properties.state === 'รอรับเรื่อง') return true;
      if (activeTag === 'กำลังดำเนินการ' && f.properties.state === 'กำลังดำเนินการ') return true;
      if (activeTag === 'เสร็จสิ้น' && f.properties.state === 'เสร็จสิ้น') return true;
      if (activeTag === 'ส่งต่อ' && (f.properties.state === 'ส่งต่อ(ใหม่)' || f.properties.state?.includes('ส่งต่อ'))) return true;
      return false;
    });
  }, [traffyData, activeTag]);

  return (
    <MapContainer
      center={[13.7563, 100.5018]}
      zoom={11}
      className="w-full h-full z-0 bg-[#020617]"
      zoomControl={true}
      attributionControl={false}
      // Use Canvas renderer for much better performance with many markers
      renderer={L.canvas()}
    >
      <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png" />

      {/* Auto fit bounds when data changes */}
      <MapBoundsFitter features={traffyData?.features || []} />

      {/* District boundaries */}
      {districtGeoData && (
        <GeoJSON data={districtGeoData} style={districtStyle} interactive={false} />
      )}

      {/* MODE: Heatmap */}
      {mapMode === 'heatmap' && filteredFeatures.length > 0 && (
        <HeatmapLayer features={filteredFeatures} />
      )}

      {/* MODE: Points */}
      {mapMode === 'points' && filteredFeatures.map((feature: any, index: number) => {
        const coords = feature.geometry.coordinates;
        const props = feature.properties;
        const color = getMarkerColor(props.state);
        const isResolved = props.state === 'เสร็จสิ้น';

        return (
          <CircleMarker
            key={props.ticket_id || index}
            center={[coords[1], coords[0]]}
            radius={isResolved ? 4 : 6}
            pathOptions={{
              color,
              fillColor: color,
              fillOpacity: isResolved ? 0.25 : 0.75,
              weight: isResolved ? 0.5 : 1.5
            }}
          >
            <Popup className="dark-popup">
              <div className="p-2 w-64 text-slate-800">
                <div className="flex items-center gap-2 mb-2">
                  <span className="px-2 py-0.5 text-[10px] font-bold rounded-full text-white" style={{ backgroundColor: color }}>
                    {props.state}
                  </span>
                  <span className="text-xs text-slate-500">{props.ticket_id}</span>
                </div>
                <p className="text-sm font-semibold mb-1 line-clamp-2 leading-tight">{props.description}</p>
                <div className="text-[10px] text-slate-500 mb-2">
                  📍 {props.address || 'ไม่มีที่อยู่'} <br />
                  🕒 {props.timestamp ? new Date(props.timestamp).toLocaleString('th-TH') : ''}
                </div>
                {props.photo_url && (
                  <img src={props.photo_url} alt="Incident" className="w-full h-24 object-cover rounded-md mt-2" loading="lazy" />
                )}
                <div className="mt-2 text-[10px] font-medium text-indigo-600">
                  หมวดหมู่: {props.problem_type} | เขต: {props.district || '-'}
                </div>
              </div>
            </Popup>
          </CircleMarker>
        );
      })}

      <div className="absolute bottom-2 right-2 text-[10px] text-slate-500 z-[1000] bg-black/50 px-2 py-1 rounded backdrop-blur-sm">
        &copy; CARTO &copy; OpenStreetMap | Data: Traffy Fondue
      </div>
    </MapContainer>
  );
}
