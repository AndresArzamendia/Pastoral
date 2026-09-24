'use client';

import { useEffect, useRef, useState } from 'react';

export interface ChapelMapPoint {
  id: string | number;
  name: string;
  lat?: number;
  lng?: number;
  zonaId: number;
  estadoComunidad?: string;
  comunidadNombre?: string;
  markerColor?: string;
  address?: string;
  locationUrl?: string;
  photo?: string;
}

interface ZonaMapProps {
  chapels?: ChapelMapPoint[];
  selectedZone?: number | null;
  height?: string;
  zoneColors?: Record<number, string>;
  polygons?: Record<number, [number, number][]>;
  tempPolygon?: [number, number][];
  showAllZones?: boolean;
  mapCenterLat?: number;
  mapCenterLng?: number;
  mapZoom?: number;
  scrollWheelZoom?: boolean;
  drawingMode?: boolean;
  hideFallbackPolygon?: boolean;
  enableSearch?: boolean;
}

interface PlaceSuggestion {
  place_id: number;
  display_name: string;
  lat: string;
  lon: string;
  type?: string;
  class?: string;
  importance?: number;
  address?: Record<string, string>;
}

const DEFAULT_ZONE_COLORS: Record<number, { fill: string; border: string; text: string }> = {
  1: { fill: 'rgba(59, 130, 246, 0.25)',  border: '#3B82F6', text: 'Zona 1' },
  2: { fill: 'rgba(34, 197, 94, 0.25)',   border: '#22C55E', text: 'Zona 2' },
  3: { fill: 'rgba(234, 179, 8, 0.25)',   border: '#EAB308', text: 'Zona 3' },
  4: { fill: 'rgba(239, 68, 68, 0.25)',   border: '#EF4444', text: 'Zona 4' },
};

const MARKER_COLORS: Record<number, string> = {
  1: '#3B82F6',
  2: '#22C55E',
  3: '#F59E0B',
  4: '#EF4444',
};

// Función matemática para calcular el centro exacto (Centroide) de los polígonos personalizados
const getPolygonCenter = (coords: [number, number][]): [number, number] => {
  if (!coords || coords.length === 0) return [-25.2688, -57.4754];
  let latSum = 0;
  let lngSum = 0;
  coords.forEach(([lat, lng]) => {
    latSum += lat;
    lngSum += lng;
  });
  return [latSum / coords.length, lngSum / coords.length];
};

const FALLBACK_POLYGONS: Record<number, [number, number][]> = {
  1: [[-25.235, -57.510], [-25.235, -57.445], [-25.265, -57.445], [-25.265, -57.510]],
  2: [[-25.265, -57.510], [-25.265, -57.445], [-25.295, -57.445], [-25.295, -57.510]],
  3: [[-25.235, -57.445], [-25.235, -57.385], [-25.265, -57.385], [-25.265, -57.445]],
  4: [[-25.265, -57.445], [-25.265, -57.385], [-25.295, -57.385], [-25.295, -57.445]],
};

const ZONE_CENTERS: Record<number, [number, number]> = {
  1: [-25.250, -57.478],
  2: [-25.280, -57.478],
  3: [-25.250, -57.415],
  4: [-25.280, -57.415],
};

export default function ZonaMap({ 
  chapels = [],
  selectedZone = null,
  height = '500px',
  zoneColors = {},
  polygons = {},
  showAllZones = false,
  mapCenterLat,
  mapCenterLng,
  mapZoom,
  tempPolygon = [],
  scrollWheelZoom = false,
  drawingMode = false,
  hideFallbackPolygon = false,
  enableSearch = false,
}: ZonaMapProps) {
  const mapRef = useRef<HTMLDivElement>(null);
  const leafletMapRef = useRef<any>(null);
  const layersRef = useRef<any[]>([]);
  const baseLayerRef = useRef<any>(null);
  const zoomControlRef = useRef<any>(null);
  const searchMarkerRef = useRef<any>(null);
  const searchTimerRef = useRef<number | null>(null);
const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState<PlaceSuggestion[]>([]);
  const [searchLoading, setSearchLoading] = useState(false);
  const [selectedPlace, setSelectedPlace] = useState<PlaceSuggestion | null>(null);
  const [infoChapel, setInfoChapel] = useState<ChapelMapPoint | null>(null);
  const infoPinnedRef = useRef(false);
  const hoverTimerRef = useRef<number | null>(null);

  const closeInfo = () => {
    infoPinnedRef.current = false;
    if (hoverTimerRef.current) {
      window.clearTimeout(hoverTimerRef.current);
      hoverTimerRef.current = null;
    }
    setInfoChapel(null);
  };

  useEffect(() => {
    return () => {
      if (searchTimerRef.current) {
        window.clearTimeout(searchTimerRef.current);
      }
      if (hoverTimerRef.current) {
        window.clearTimeout(hoverTimerRef.current);
      }
    };
  }, []);

  useEffect(() => {
    if (!enableSearch) {
      setSearchQuery('');
      setSearchResults([]);
      setSelectedPlace(null);
    }
  }, [enableSearch]);

  useEffect(() => {
    if (!enableSearch) return;

    const query = searchQuery.trim();
    if (query.length < 3) {
      setSearchResults([]);
      return;
    }

    if (searchTimerRef.current) {
      window.clearTimeout(searchTimerRef.current);
    }

    searchTimerRef.current = window.setTimeout(() => {
      setSearchLoading(true);
      fetch(`https://nominatim.openstreetmap.org/search?format=jsonv2&addressdetails=1&limit=6&q=${encodeURIComponent(query)}`)
        .then(r => r.json())
        .then((data: PlaceSuggestion[]) => {
          setSearchResults(Array.isArray(data) ? data : []);
        })
        .catch(() => setSearchResults([]))
        .finally(() => setSearchLoading(false));
    }, 350);

    return () => {
      if (searchTimerRef.current) {
        window.clearTimeout(searchTimerRef.current);
      }
    };
  }, [enableSearch, searchQuery]);

  const focusPlace = (place: PlaceSuggestion) => {
    const map = leafletMapRef.current;
    if (!map) return;

    const L = require('leaflet');
    const lat = Number(place.lat);
    const lng = Number(place.lon);

    try {
      map.setView([lat, lng], Math.max(map.getZoom?.() || 14, 15), { animate: true });
    } catch (e) {}

    if (searchMarkerRef.current && map.removeLayer) {
      try { map.removeLayer(searchMarkerRef.current); } catch (e) {}
    }

    const marker = L.marker([lat, lng]).addTo(map).bindPopup(`
      <div style="min-width: 180px; max-width: 240px; font-size: 12px; line-height: 1.4; padding: 2px 0;">
        <strong style="display:block; margin-bottom:4px;">${place.display_name}</strong>
        <div style="color:#666; margin-bottom:4px;">${place.class || 'Lugar'} · ${place.type || 'Ubicación'}</div>
        <div style="color:#333;">Lat: ${lat.toFixed(5)}<br/>Lng: ${lng.toFixed(5)}</div>
      </div>
    `).openPopup();

    searchMarkerRef.current = marker;
    setSelectedPlace(place);
    setSearchResults([]);
  };

  useEffect(() => {
    if (!mapRef.current) return;

    let L: any;
    try { 
      L = require('leaflet'); 
    } catch { 
      return; 
    }

    if (!leafletMapRef.current) {
      delete (L.Icon.Default.prototype as any)._getIconUrl;
      L.Icon.Default.mergeOptions({
        iconRetinaUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon-2x.png',
        iconUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-icon.png',
        shadowUrl: 'https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/images/marker-shadow.png',
      });

      const center: [number, number] = mapCenterLat && mapCenterLng
        ? [mapCenterLat, mapCenterLng]
        : selectedZone ? ZONE_CENTERS[selectedZone] : [-25.2688, -57.4754];

      const zoom = mapZoom || (selectedZone ? 14 : 13);

const map = L.map(mapRef.current, {
        zoomControl: false,
        scrollWheelZoom,
        zoomSnap: 0.5,
        zoomDelta: 0.5,
        wheelPxPerZoomLevel: 120,
        inertia: true,
        inertiaDeceleration: 3400,
        inertiaMaxSpeed: 1600,
        touchZoom: true,
        doubleClickZoom: true,
        boxZoom: true,
        keyboard: true,
        zoomAnimation: true,
        fadeAnimation: true,
        markerZoomAnimation: true,
      }).setView(center, zoom);
      leafletMapRef.current = map;
      zoomControlRef.current = L.control.zoom({ position: drawingMode ? 'bottomright' : 'topright' }).addTo(map);

      const baseLayers = [
        { url: 'https://tile.openstreetmap.org/{z}/{x}/{y}.png', options: { attribution: '&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>', maxZoom: 20, maxNativeZoom: 19, crossOrigin: true } }
      ];

      const layer = L.tileLayer(baseLayers[0].url, baseLayers[0].options).addTo(map);
      baseLayerRef.current = layer;

      // ─── SOLUCIÓN MAPA EN BLANCO: Forzar recálculo inmediato ───
      setTimeout(() => { 
        try { 
          map.invalidateSize(); 
        } catch (e) {} 
      }, 50);
    }

    const map = leafletMapRef.current;
    
    // Repetimos la sincronización dimensional del contenedor por seguridad
    try { 
      map.invalidateSize(); 
    } catch (e) {}

    let resizeObserver: ResizeObserver | null = null;
    if (typeof ResizeObserver !== 'undefined' && mapRef.current) {
      resizeObserver = new ResizeObserver(() => { 
        try { map.invalidateSize(false); } catch (e) {} 
      });
      resizeObserver.observe(mapRef.current);
    }

    layersRef.current.forEach(layer => {
      if (layer && layer.remove) layer.remove();
      else if (map && map.removeLayer) { try { map.removeLayer(layer); } catch(e) {} }
    });
    layersRef.current = [];

    if (zoomControlRef.current && map && map.removeControl) {
      try { map.removeControl(zoomControlRef.current); } catch (e) {}
      zoomControlRef.current = null;
    }
    zoomControlRef.current = L.control.zoom({ position: drawingMode ? 'bottomright' : 'topright' }).addTo(map);

    // Dibujar polígonos de zonas activas
    const zonesToDraw = (selectedZone && !showAllZones) ? [selectedZone] : [1, 2, 3, 4];
    zonesToDraw.forEach((zId) => {
      const savedPolygon = polygons[zId];
      const coords = (savedPolygon && savedPolygon.length > 0) 
        ? savedPolygon 
        : (!hideFallbackPolygon ? FALLBACK_POLYGONS[zId] : undefined);
      
      if (!coords || coords.length === 0) return;

      const customColor = zoneColors[zId];
      const defaultColor = DEFAULT_ZONE_COLORS[zId];
      const borderColor = customColor || defaultColor.border;
      const fillColor = customColor ? `${customColor}55` : defaultColor.fill;

      const polygon = L.polygon(coords, {
        color: borderColor,
        fillColor: fillColor,
        fillOpacity: (selectedZone === zId || !selectedZone || showAllZones) ? 0.35 : 0.08,
        weight: (selectedZone === zId) ? 3 : 1.5,
        dashArray: (savedPolygon && savedPolygon.length > 0) ? undefined : '6 4',
        className: (savedPolygon && savedPolygon.length > 0) ? 'zone-polygon' : 'zone-polygon zone-fallback',
      }).addTo(map);

      const polyEl: SVGElement | null = polygon.getElement?.();
      if (polyEl) {
        polyEl.style.setProperty('--mc', borderColor);
        polyEl.style.setProperty('--anim-delay', `${zId * 140}ms`);
      }

      layersRef.current.push(polygon);

      if (selectedZone === zId || !selectedZone || showAllZones) {
        const polygonCenter = getPolygonCenter(coords);
        const textTooltip = L.tooltip({
          permanent: true,
          direction: 'center',
          className: 'zone-tooltip-centered'
        })
        .setLatLng(polygonCenter)
        .setContent(`<strong>Zona ${zId}</strong>`)
        .addTo(map);

        layersRef.current.push(textTooltip);
      }
    });

    // ─── LÓGICA MEJORADA: CONEXIÓN MAGNÉTICA A CUALQUIER PUNTO PREVIO ───
    const onMapClickInternal = (e: any) => {
      if ((window as any).onPJLMapClick) {
        const clickLat = e.latlng.lat;
        const clickLng = e.latlng.lng;

        if (tempPolygon && tempPolygon.length > 0) {
          let closestPoint: [number, number] | null = null;
          let minDistance = Infinity;

          // Recorremos todos los puntos existentes para ver cuál está más cerca del nuevo clic
          tempPolygon.forEach((pt) => {
            const ptLatLng = L.latLng(pt[0], pt[1]);
            const clickLatLng = L.latLng(clickLat, clickLng);
            const dist = ptLatLng.distanceTo(clickLatLng); // Distancia real en metros

            if (dist < minDistance) {
              minDistance = dist;
              closestPoint = pt;
            }
          });

          // Si el clic se hizo a menos de 40 metros de CUALQUIER punto anterior, 
          // se acopla magnéticamente a ese punto exacto en vez de crear uno encima.
          if (closestPoint && minDistance < 40) {
            (window as any).onPJLMapClick(closestPoint[0], closestPoint[1]);
            return;
          }
        }

        // Si no está cerca de ningún punto previo, se crea uno normal
        (window as any).onPJLMapClick(clickLat, clickLng);
      }
    };
    map.on('click', onMapClickInternal);
    layersRef.current.push({ remove: () => map.off('click', onMapClickInternal) });

    // Dibujar los marcadores premium de las capillas ⛪
    const chapelsToShow = selectedZone ? chapels.filter(c => c.zonaId === selectedZone) : chapels;
    chapelsToShow.forEach((chapel) => {
      const markerColor = chapel.markerColor || zoneColors[chapel.zonaId] || MARKER_COLORS[chapel.zonaId] || '#C8973A';
      const currentZoneCoords = polygons[chapel.zonaId] || FALLBACK_POLYGONS[chapel.zonaId];
      const referenceCenter = getPolygonCenter(currentZoneCoords);
      
      const idxInZone = chapels.filter(c => c.zonaId === chapel.zonaId).indexOf(chapel);
      const latOffset = (idxInZone % 4) * 0.002 - 0.004;
      const lngOffset = Math.floor(idxInZone / 4) * 0.002 - 0.004;
      
      const lat = chapel.lat || (referenceCenter[0] + latOffset);
      const lng = chapel.lng || (referenceCenter[1] + lngOffset);

      const svgIcon = L.divIcon({
        html: `
          <div class="capm" style="--mc:${markerColor};--d:${(idxInZone % 8) * 80}ms">
            <span class="capm-name">${String(chapel.name).replace(/'/g, '&#39;').replace(/"/g, '&quot;')}</span>
            <div class="capm-pin"><span class="capm-ico">${chapel.photo ? `<img class="capm-img" src="${chapel.photo.replace(/"/g, '&quot;')}" alt="" />` : '⛪'}</span></div>
            <div class="capm-drop"></div>
          </div>`,
        className: 'premium-marker capm-wrap',
        iconSize: [44, 56],
        iconAnchor: [22, 54],
        popupAnchor: [0, -56],
      });

      const marker = L.marker([lat, lng], { icon: svgIcon, riseOnHover: true, title: chapel.name }).addTo(map);

      marker.on('click', () => {
        infoPinnedRef.current = true;
        setInfoChapel(chapel);
      });
      marker.on('mouseover', () => {
        if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
        infoPinnedRef.current = false;
        setInfoChapel(chapel);
      });
      marker.on('mouseout', () => {
        if (hoverTimerRef.current) window.clearTimeout(hoverTimerRef.current);
        hoverTimerRef.current = window.setTimeout(() => {
          if (!infoPinnedRef.current) {
            infoPinnedRef.current = false;
            setInfoChapel(null);
          }
        }, 350);
      });
      
      layersRef.current.push(marker);
    });

    // Dibujar la traza interactiva actual
    if (tempPolygon && tempPolygon.length > 0) {
      try {
        const polyline = L.polyline(tempPolygon, { color: '#C8973A', weight: 4, dashArray: '8, 8' }).addTo(map);
        layersRef.current.push(polyline);
        
        tempPolygon.forEach((p, i) => {
          const dot = L.circleMarker(p, { 
            radius: 6, 
            fillColor: '#C8973A', 
            color: '#fff', 
            weight: 2, 
            fillOpacity: 1 
          }).addTo(map);
          
          layersRef.current.push(dot);
        });
        
        if (tempPolygon.length > 2) {
          const fill = L.polygon(tempPolygon, { color: 'transparent', fillColor: '#C8973A', fillOpacity: 0.18 }).addTo(map);
          layersRef.current.push(fill);
        }
      } catch (err) { console.error('Leaflet Temp Draw Error:', err); }
    }

    // Ejecutar un invalidateSize extra diferido al renderizar elementos reactivos
    const mapTimeout = setTimeout(() => { try { map.invalidateSize(); } catch(e){} }, 300);

    return () => {
      clearTimeout(mapTimeout);
      resizeObserver?.disconnect();
      if (searchMarkerRef.current && map && map.removeLayer) {
        try { map.removeLayer(searchMarkerRef.current); } catch (e) {}
        searchMarkerRef.current = null;
      }
      if (zoomControlRef.current && map && map.removeControl) {
        try { map.removeControl(zoomControlRef.current); } catch (e) {}
        zoomControlRef.current = null;
      }
      layersRef.current.forEach(layer => {
        if (layer.remove) layer.remove();
        else if (map && map.removeLayer) { try { map.removeLayer(layer); } catch(e) {} }
      });
      layersRef.current = [];
    };
  }, [chapels, selectedZone, zoneColors, polygons, tempPolygon, showAllZones, mapCenterLat, mapCenterLng, mapZoom, scrollWheelZoom, drawingMode, hideFallbackPolygon]);

  useEffect(() => {
    return () => { if (leafletMapRef.current) { leafletMapRef.current.remove(); leafletMapRef.current = null; } };
  }, []);

  return (
    <>
      <link rel="stylesheet" href="https://cdnjs.cloudflare.com/ajax/libs/leaflet/1.9.4/leaflet.min.css" />
      <style>{`
        .zone-tooltip-centered {
          background: rgba(26, 39, 68, 0.88) !important;
          border: 2px solid white !important;
          color: white !important;
          font-weight: 800 !important;
          border-radius: 8px !important;
          font-size: 13px !important;
          padding: 6px 12px !important;
          box-shadow: 0 4px 15px rgba(0,0,0,0.3) !important;
          text-align: center;
          white-space: nowrap;
        }
        .zone-tooltip-centered::before { display: none !important; }
        .leaflet-drawing-cursor .leaflet-container { cursor: crosshair !important; }
        .zona-map-search {
          position: absolute;
          top: 14px;
          left: 14px;
          z-index: 1200;
          width: min(92vw, 360px);
          pointer-events: auto;
        }
        .zona-map-search input {
          width: 100%;
          border: 1px solid rgba(200, 151, 58, 0.35);
          border-radius: 14px;
          padding: 12px 14px;
          background: rgba(255,255,255,0.96);
          color: var(--navy);
          box-shadow: 0 10px 24px rgba(0,0,0,0.12);
          outline: none;
        }
        .zona-map-search-results {
          margin-top: 8px;
          background: rgba(255,255,255,0.98);
          border: 1px solid rgba(200, 151, 58, 0.28);
          border-radius: 14px;
          overflow: hidden;
          box-shadow: 0 14px 30px rgba(0,0,0,0.16);
          max-height: 240px;
          overflow-y: auto;
        }
        .zona-map-search-results button {
          width: 100%;
          border: 0;
          background: transparent;
          text-align: left;
          padding: 12px 14px;
          cursor: pointer;
          display: block;
          border-bottom: 1px solid rgba(0,0,0,0.06);
        }
        .zona-map-search-results button:hover {
          background: rgba(200,151,58,0.08);
        }
        .zona-map-search-meta {
          display: inline-block;
          margin-top: 4px;
          font-size: 11px;
          color: #7a6a55;
        }
.zona-map-details {
          position: absolute;
          right: 14px;
          bottom: 14px;
          z-index: 1200;
          width: min(92vw, 320px);
          background: rgba(26, 39, 68, 0.94);
          color: #fff;
          border: 1px solid rgba(200,151,58,0.3);
          border-radius: 16px;
          padding: 12px 14px;
          box-shadow: 0 14px 30px rgba(0,0,0,0.18);
        }
        .capm-wrap { background: transparent !important; border: none !important; }
        .capm { position: relative; width: 44px; height: 56px; cursor: pointer; filter: drop-shadow(0 6px 10px rgba(26,39,68,0.35)); }
        .capm-pin {
          position: absolute; left: 3px; top: 3px; width: 38px; height: 38px;
          border-radius: 50% 50% 50% 4px;
          background: linear-gradient(160deg, var(--mc, #C8973A), #12203f 135%);
          border: 3px solid #fff;
          box-shadow: 0 5px 16px rgba(26,39,68,0.4);
          transform: rotate(-45deg);
          display: flex; align-items: center; justify-content: center;
          transform-origin: 50% 62%;
          transition: transform .16s ease;
          animation: capmPop .55s cubic-bezier(.34,1.56,.64,1) both;
          animation-delay: var(--d, 0ms);
        }
        .capm-pin .capm-ico {
          transform: rotate(45deg);
          font-size: 15px; line-height: 1; font-weight: 900;
          display: flex; align-items: center; justify-content: center;
          width: 100%; height: 100%;
        }
        .capm-pin .capm-ico img { width: 100%; height: 100%; object-fit: cover; border-radius: 50% 50% 50% 4px; }
        .capm:hover .capm-pin { transform: rotate(-45deg) scale(1.15); }
        @keyframes capmPop {
          0% { opacity: 0; transform: rotate(-45deg) scale(0); }
          60% { transform: rotate(-45deg) scale(1.22); }
          100% { transform: rotate(-45deg) scale(1); opacity: 1; }
        }
        .capm-drop {
          position: absolute; left: 50%; top: 45px; margin-left: -5px;
          width: 10px; height: 6px; border-radius: 50%;
          background: var(--mc, #C8973A); opacity: .45; transform: scale(.5);
          animation: capmPulse 2.4s ease-out infinite;
        }
        @keyframes capmPulse {
          0% { transform: scale(.5); opacity: .7; }
          70% { transform: scale(2.2); opacity: 0; }
          100% { transform: scale(2.2); opacity: 0; }
        }
        .capm-name {
          position: absolute; left: 50%; top: -8px;
          transform: translateX(-50%) translateY(-100%);
          background: rgba(26,39,68,0.94); color: #fff;
          font-size: 11px; font-weight: 800; white-space: nowrap;
          padding: 4px 10px; border-radius: 999px;
          opacity: 0; pointer-events: none;
          transition: opacity .18s ease, transform .18s ease;
          z-index: 10;
        }
        .capm:hover .capm-name { opacity: 1; }
        .zone-polygon {
          animation: zoneIn .9s ease both, zoneGlow 3.4s ease-in-out infinite;
          animation-delay: var(--anim-delay, 0ms), var(--anim-delay, 0ms);
        }
        .zone-fallback { animation-duration: 1.2s, 3.4s; }
        @keyframes zoneIn {
          0% { opacity: 0; stroke-dashoffset: 600; }
          100% { opacity: 1; stroke-dashoffset: 0; }
        }
        @keyframes zoneGlow {
          0%, 100% { filter: drop-shadow(0 0 0 rgba(255,255,255,0)); }
          50% { filter: drop-shadow(0 0 8px var(--mc, #C8973A)); }
        }
        .cap-info-card {
          position: absolute; top: 16px; left: 50%;
          transform: translateX(-50%);
          width: min(340px, calc(100% - 28px));
          z-index: 1400;
          background: linear-gradient(150deg, var(--zcolor, #C8973A), #131f3c 80%);
          color: #fff; border-radius: 18px; padding: 14px;
          border: 2px solid rgba(255,255,255,0.9);
          box-shadow: 0 22px 45px rgba(15,25,55,0.5);
          animation: capCardIn .38s cubic-bezier(.22,1.2,.4,1) both;
          pointer-events: auto;
        }
        @keyframes capCardIn {
          0% { opacity: 0; transform: translateX(-50%) translateY(-18px) scale(.94); }
          100% { opacity: 1; transform: translateX(-50%) translateY(0) scale(1); }
        }
        .cap-info-x {
          position: absolute; top: 8px; right: 8px;
          width: 26px; height: 26px; border-radius: 50%;
          border: 2px solid rgba(255,255,255,0.85);
          background: rgba(255,255,255,0.18); color: #fff;
          font-weight: 900; font-size: 12px; line-height: 1; cursor: pointer;
          display: flex; align-items: center; justify-content: center;
          transition: background .15s ease, transform .15s ease;
        }
        .cap-info-x:hover { background: rgba(255,255,255,0.38); transform: scale(1.08); }
        .cap-info-head { display: flex; align-items: center; gap: 10px; margin-bottom: 8px; padding-right: 30px; }
        .cap-info-avatar {
          width: 42px; height: 42px; border-radius: 12px; flex-shrink: 0;
          background: rgba(255,255,255,0.22);
          border: 2px solid rgba(255,255,255,0.75);
          display: flex; align-items: center; justify-content: center;
          font-size: 18px; overflow: hidden;
        }
        .cap-info-avatar img { width: 100%; height: 100%; object-fit: cover; }
        .cap-info-titles { min-width: 0; flex: 1; }
        .cap-info-titles strong { display: block; font-size: 14px; line-height: 1.2; letter-spacing: .3px; }
        .cap-info-titles span { display: block; font-size: 11px; opacity: .85; margin-top: 2px; }
        .cap-info-estado {
          font-size: 10px; font-weight: 900; letter-spacing: .5px;
          padding: 4px 9px; border-radius: 999px; flex-shrink: 0;
          background: rgba(255,255,255,0.18);
        }
        .cap-info-estado.is-activo { background: rgba(45,212,160,0.35); }
        .cap-info-estado.is-nuc { background: rgba(251,113,133,0.38); }
        .cap-info-rows { display: flex; flex-direction: column; gap: 5px; margin-bottom: 10px; }
        .cap-info-row {
          display: flex; align-items: center; gap: 8px;
          font-size: 11.5px; line-height: 1.4;
          background: rgba(255,255,255,0.1);
          border-radius: 10px; padding: 5px 9px; overflow-wrap: anywhere;
        }
        .cir-ico { width: 22px; text-align: center; flex-shrink: 0; }
        .cap-info-link {
          display: flex; align-items: center; justify-content: center; gap: 6px;
          width: 100%; background: #fff; color: var(--zcolor, #C8973A);
          font-weight: 900; font-size: 11px; letter-spacing: 1px;
          padding: 9px 12px; border-radius: 12px; text-decoration: none;
          transition: transform .15s ease, box-shadow .15s ease;
        }
        .cap-info-link:hover { transform: translateY(-1px); box-shadow: 0 8px 18px rgba(0,0,0,0.28); }
        .zona-map-inner { box-shadow: inset 0 0 40px rgba(18,32,63,0.05); }
        .leaflet-container { font-family: inherit; }
        .leaflet-control-zoom a { border-radius: 8px !important; }
@media (max-width: 768px) {
          .zona-map-search {
            width: calc(100vw - 28px);
          }
          .zona-map-details {
            left: 14px;
            right: 14px;
            width: auto;
          }
          .cap-info-card { top: 12px; width: calc(100% - 24px); }
          .cap-info-avatar { width: 38px; height: 38px; font-size: 16px; }
          .cap-info-titles strong { font-size: 13px; }
        }
        @media (max-width: 480px) {
          .capm-name { display: none; }
        }
      `}</style>
      <div style={{ position: 'relative', width: '100%', height: '100%' }}>
        {enableSearch && (
          <div className="zona-map-search">
            <input
              value={searchQuery}
              onChange={(e) => setSearchQuery(e.target.value)}
              placeholder="Buscar lugar, dirección o referencia..."
              aria-label="Buscar ubicación en el mapa"
            />
            {searchLoading && <div className="zona-map-search-meta">Buscando ubicaciones…</div>}
            {searchResults.length > 0 && (
              <div className="zona-map-search-results">
                {searchResults.map(place => (
                  <button key={place.place_id} type="button" onClick={() => focusPlace(place)}>
                    <strong style={{ display: 'block', color: 'var(--navy)' }}>{place.display_name}</strong>
                    <span className="zona-map-search-meta">
                      {place.class || 'Lugar'} {place.type ? `· ${place.type}` : ''}
                    </span>
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
        {enableSearch && selectedPlace && (
          <div className="zona-map-details">
            <div style={{ fontSize: '11px', fontWeight: 900, letterSpacing: '1px', color: 'var(--gold)', marginBottom: '6px' }}>UBICACIÓN SELECCIONADA</div>
            <div style={{ fontWeight: 800, lineHeight: 1.35, marginBottom: '6px' }}>{selectedPlace.display_name}</div>
            <div style={{ fontSize: '12px', opacity: 0.9 }}>
              {selectedPlace.class || 'Lugar'} {selectedPlace.type ? `· ${selectedPlace.type}` : ''}
            </div>
            <div style={{ fontSize: '12px', marginTop: '8px', opacity: 0.9 }}>
              Lat: {Number(selectedPlace.lat).toFixed(5)} · Lng: {Number(selectedPlace.lon).toFixed(5)}
            </div>
          </div>
        )}
<div ref={mapRef} className={`zona-map-inner${drawingMode ? ' leaflet-drawing-cursor' : ''}`} style={{ height, width: '100%', borderRadius: '12px', zIndex: 1 }} />
        {infoChapel && (() => {
          const ic = infoChapel;
          const infoColor = ic.markerColor || zoneColors[ic.zonaId] || MARKER_COLORS[ic.zonaId] || '#C8973A';
          const estadoKey = String(ic.estadoComunidad || 'Activo').toLowerCase();
          const mapsHref = ic.locationUrl
            ? (ic.locationUrl.startsWith('http://') || ic.locationUrl.startsWith('https://')
                ? ic.locationUrl
                : `https://www.google.com/maps/?q=${encodeURIComponent(ic.locationUrl)}`)
            : '';
          return (
            <div className="cap-info-card" style={{ ['--zcolor' as any]: infoColor }}>
              <button type="button" className="cap-info-x" aria-label="Cerrar información de la capilla" onClick={closeInfo}>✕</button>
              <div className="cap-info-head">
                <div className="cap-info-avatar">
                  {ic.photo ? <img src={ic.photo} alt="" /> : <span>⛪</span>}
                </div>
                <div className="cap-info-titles">
                  <strong>{ic.name}</strong>
                  {ic.comunidadNombre && <span>{ic.comunidadNombre}</span>}
                </div>
                <span className={`cap-info-estado is-${estadoKey === 'nucleación' || estadoKey.includes('nucleacion') ? 'nuc' : 'activo'}`}>
                  {ic.estadoComunidad || 'Activo'}
                </span>
              </div>
              <div className="cap-info-rows">
                <div className="cap-info-row"><span className="cir-ico">📍</span><span>Zona Pastoral {ic.zonaId}</span></div>
                {ic.address && <div className="cap-info-row"><span className="cir-ico">🏠</span><span>{ic.address}</span></div>}
                {typeof ic.lat === 'number' && typeof ic.lng === 'number' && (
                  <div className="cap-info-row"><span className="cir-ico">🧭</span><span>{ic.lat.toFixed(6)}, {ic.lng.toFixed(6)}</span></div>
                )}
              </div>
              {mapsHref && (
                <a className="cap-info-link" href={mapsHref} target="_blank" rel="noopener noreferrer">🗺️ VER EN GOOGLE MAPS ↗</a>
              )}
            </div>
          );
        })()}
      </div>
    </>
  );
}
