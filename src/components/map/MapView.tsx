"use client";

import { memo, useEffect, useState, useRef, useMemo } from "react";
import { MapContainer, TileLayer, GeoJSON, CircleMarker, Popup, useMap } from "react-leaflet";
import "leaflet/dist/leaflet.css";
import L from "leaflet";
import { bindLeafletKeyboardSelection } from "@/lib/leaflet-keyboard";

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
  activeDistrict: string;
  traffyData: any;
  mapMode: 'points' | 'heatmap';
  onDistrictSelect: (district: string) => void;
}

type BoundsTuple = [[number, number], [number, number]];

const EMPTY_FEATURES: any[] = [];

const getMarkerColor = (state: string) => {
  switch (state) {
    case 'รอรับเรื่อง': return '#ef4444';
    case 'กำลังดำเนินการ': return '#eab308';
    case 'ส่งต่อ(ใหม่)': return '#f97316';
    case 'เสร็จสิ้น': return '#22c55e';
    default: return '#64748b';
  }
};

function getFeatureKey(feature: any, index: number) {
  return feature.properties?.ticket_id || `${feature.geometry?.coordinates?.join(',')}-${index}`;
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
function MapBoundsFitter({
  bounds,
  boundsKey
}: {
  bounds: BoundsTuple | null;
  boundsKey: string;
}) {
  const map = useMap();
  const lastFitKeyRef = useRef<string>('');

  useEffect(() => {
    if (!bounds || !boundsKey || lastFitKeyRef.current === boundsKey) return;
    
    try {
      const latLngBounds = L.latLngBounds(bounds[0], bounds[1]);
      
      if (latLngBounds.isValid()) {
        lastFitKeyRef.current = boundsKey;
        map.flyToBounds(latLngBounds, { padding: [50, 50], duration: 1.5, maxZoom: 14 });
      }
    } catch (e) {
      console.error("Error fitting bounds:", e);
    }
  }, [bounds, boundsKey, map]);
  return null;
}

function TraffyPopupContent({
  color,
  isOpen,
  props
}: {
  color: string;
  isOpen: boolean;
  props: any;
}) {
  if (!isOpen) return null;

  return (
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
  );
}

const TraffyPointMarker = memo(function TraffyPointMarker({
  feature,
  index
}: {
  feature: any;
  index: number;
}) {
  const [isPopupOpen, setIsPopupOpen] = useState(false);
  const coords = feature.geometry.coordinates;
  const props = feature.properties;
  const color = getMarkerColor(props.state);
  const isResolved = props.state === 'เสร็จสิ้น';

  const center = useMemo(() => [coords[1], coords[0]] as L.LatLngExpression, [coords]);
  const pathOptions = useMemo(() => ({
    color,
    fillColor: color,
    fillOpacity: isResolved ? 0.25 : 0.75,
    weight: isResolved ? 0.5 : 1.5
  }), [color, isResolved]);
  const eventHandlers = useMemo(() => ({
    popupopen: () => setIsPopupOpen(true),
    popupclose: () => setIsPopupOpen(false)
  }), []);

  return (
    <CircleMarker
      center={center}
      eventHandlers={eventHandlers}
      radius={isResolved ? 4 : 6}
      pathOptions={pathOptions}
    >
      <Popup className="dark-popup">
        <TraffyPopupContent color={color} isOpen={isPopupOpen} props={props} />
      </Popup>
    </CircleMarker>
  );
}, (prevProps, nextProps) => (
  prevProps.feature === nextProps.feature &&
  prevProps.index === nextProps.index
));

export default function MapView({ activeTag, activeDistrict, traffyData, mapMode, onDistrictSelect }: MapViewProps) {
  const [districtGeoData, setDistrictGeoData] = useState<any>(null);
  const canvasRenderer = useMemo(() => L.canvas(), []);
  const districtRenderer = useMemo(() => L.svg(), []);

  useEffect(() => {
    fetch(`/api/districts?year=2024`)
      .then(res => res.json())
      .then(data => setDistrictGeoData(data))
      .catch(err => console.error(err));
  }, []);

  const traffyFeatures = traffyData?.features ?? EMPTY_FEATURES;

  const districtStyle = (feature: any) => {
    const name = feature?.properties?.name_th ?? feature?.properties?.district_name;
    const selected = activeDistrict !== 'ทั้งหมด' && name === activeDistrict;
    const dimmed = activeDistrict !== 'ทั้งหมด' && !selected;
    return {
      renderer: districtRenderer,
      fillColor: selected ? '#f97316' : '#0f172a',
      weight: selected ? 2.5 : 0.8,
      opacity: selected ? 1 : 0.7,
      color: selected ? '#ffffff' : '#475569',
      fillOpacity: selected ? 0.24 : dimmed ? 0.01 : 0.015,
    };
  };

  // Filter features based on sidebar selection
  const filteredFeatures = useMemo(() => {
    if (!traffyFeatures.length) return EMPTY_FEATURES;
    return traffyFeatures.filter((f: any) => {
      if (activeTag === 'ทั้งหมด') return true;
      if (activeTag === 'รอรับเรื่อง' && f.properties.state === 'รอรับเรื่อง') return true;
      if (activeTag === 'กำลังดำเนินการ' && f.properties.state === 'กำลังดำเนินการ') return true;
      if (activeTag === 'เสร็จสิ้น' && f.properties.state === 'เสร็จสิ้น') return true;
      if (activeTag === 'ส่งต่อ' && (f.properties.state === 'ส่งต่อ(ใหม่)' || f.properties.state?.includes('ส่งต่อ'))) return true;
      return false;
    });
  }, [traffyFeatures, activeTag]);

  const dataBounds = useMemo(() => {
    if (!filteredFeatures.length) return { bounds: null, key: '' };

    let minLat = Infinity;
    let maxLat = -Infinity;
    let minLon = Infinity;
    let maxLon = -Infinity;
    let validCount = 0;

    for (const feature of filteredFeatures) {
      const coords = feature.geometry?.coordinates;
      const lon = coords?.[0];
      const lat = coords?.[1];

      if (typeof lat !== 'number' || typeof lon !== 'number') continue;

      minLat = Math.min(minLat, lat);
      maxLat = Math.max(maxLat, lat);
      minLon = Math.min(minLon, lon);
      maxLon = Math.max(maxLon, lon);
      validCount += 1;
    }

    if (!validCount) return { bounds: null, key: '' };

    return {
      bounds: [[minLat, minLon], [maxLat, maxLon]] as BoundsTuple,
      key: [
        validCount,
        minLat.toFixed(6),
        minLon.toFixed(6),
        maxLat.toFixed(6),
        maxLon.toFixed(6)
      ].join(':')
    };
  }, [filteredFeatures]);

  const hasActiveFilter = activeTag !== 'ทั้งหมด';

  const pointMarkers = useMemo(() => (
    filteredFeatures.map((feature: any, index: number) => (
      <TraffyPointMarker
        key={getFeatureKey(feature, index)}
        feature={feature}
        index={index}
      />
    ))
  ), [filteredFeatures]);

  return (
    <MapContainer
      center={[13.7563, 100.5018]}
      zoom={11}
      className="w-full h-full z-0 bg-[#020617]"
      zoomControl={true}
      attributionControl={false}
      // Use Canvas renderer for much better performance with many markers
      renderer={canvasRenderer}
    >
      <TileLayer url="https://{s}.basemaps.cartocdn.com/dark_nolabels/{z}/{x}/{y}{r}.png" />

      {/* Auto fit bounds when data changes */}
      <MapBoundsFitter bounds={dataBounds.bounds} boundsKey={dataBounds.key} />

      {hasActiveFilter && (
        <div className="pointer-events-none absolute left-3 top-3 z-[1000] rounded-md border border-cyan-300/30 bg-slate-950/85 px-3 py-2 text-[11px] leading-tight text-slate-100 shadow-lg backdrop-blur-sm">
          <div className="font-bold text-cyan-200">กรอง: {activeTag}</div>
          <div className="mt-0.5 text-slate-300">
            แสดง {filteredFeatures.length.toLocaleString('th-TH')} จาก {traffyFeatures.length.toLocaleString('th-TH')} รายการ
          </div>
        </div>
      )}

      {/* District boundaries */}
      {districtGeoData && (
        <GeoJSON
          data={districtGeoData}
          style={districtStyle}
          onEachFeature={(feature, layer) => {
            const name = feature?.properties?.name_th ?? feature?.properties?.district_name;
            if (!name) return;
            bindLeafletKeyboardSelection(layer, `เลือกเขต${name}บนแผนที่`, () => onDistrictSelect(activeDistrict === name ? 'ทั้งหมด' : name));
            layer.bindTooltip(`เขต${name} · คลิกเพื่อกรองเรื่องร้องเรียน`, { sticky: true });
            layer.on({
              click: () => onDistrictSelect(activeDistrict === name ? 'ทั้งหมด' : name),
              mouseover: () => (layer as L.Path).setStyle({ weight: 2.5, color: '#ffffff', fillOpacity: 0.16 }),
              mouseout: () => (layer as L.Path).setStyle(districtStyle(feature)),
            });
          }}
        />
      )}

      {/* MODE: Heatmap */}
      {mapMode === 'heatmap' && filteredFeatures.length > 0 && (
        <HeatmapLayer features={filteredFeatures} />
      )}

      {/* MODE: Points */}
      {mapMode === 'points' && pointMarkers}

      <div className="absolute bottom-2 right-2 text-[10px] text-slate-500 z-[1000] bg-black/50 px-2 py-1 rounded backdrop-blur-sm">
        &copy; CARTO &copy; OpenStreetMap | Data: Traffy Fondue
      </div>
    </MapContainer>
  );
}
