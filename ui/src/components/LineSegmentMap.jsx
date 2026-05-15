import { useEffect, useRef, useState } from 'preact/hooks';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Leaflet's default marker images break in Vite — we use divIcon exclusively.
delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: '', shadowUrl: '', iconRetinaUrl: '' });

const OSM_URL  = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const SAT_URL  = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const OSM_ATTR = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const SAT_ATTR = 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, USDA FSA, USGS, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';

function makeIcon(label, ghost = false) {
    return L.divIcon({
        html: `<div class="line-map-marker${ghost ? ' line-map-marker-ghost' : ''}">${label}</div>`,
        iconSize:   [24, 24],
        iconAnchor: [12, 12],
        className:  '',
    });
}

export function LineSegmentMap({ p1Lat, p1Lng, p2Lat, p2Lng, onChange }) {
    const containerRef = useRef(null);
    const s = useRef({
        map: null, osmLayer: null, satLayer: null,
        m1: null, m2: null, poly: null,
        ghost: null, ghostPoly: null,
        p1Pos: null,   // latest p1 position for ghostPoly anchor
        clickStep: 0,
    });
    const [satellite, setSatellite] = useState(false);

    // ── Init map once ─────────────────────────────────────────────────────────
    useEffect(() => {
        const r   = s.current;
        const map = L.map(containerRef.current, { center: [51.5, -0.12], zoom: 13 });

        r.osmLayer = L.tileLayer(OSM_URL, { attribution: OSM_ATTR, maxZoom: 19 }).addTo(map);
        r.satLayer = L.tileLayer(SAT_URL, { attribution: SAT_ATTR, maxZoom: 19 });
        r.map = map;

        map.on('click', (e) => {
            const { lat, lng } = e.latlng;
            if (r.clickStep === 0) {
                // Place p1, clear p2, spawn ghost for p2
                clearGhost(r);
                onChange({ p1Lat: lat, p1Lng: lng, p2Lat: null, p2Lng: null });
                r.p1Pos = { lat, lng };
                r.clickStep = 1;

                r.ghost = L.marker([lat, lng], {
                    icon: makeIcon('2', true), interactive: false, zIndexOffset: -100,
                }).addTo(map);
                r.ghostPoly = L.polyline([[lat, lng], [lat, lng]], {
                    color: '#cba6f7', weight: 2, dashArray: '4 4', opacity: 0.5,
                }).addTo(map);
            } else {
                // Place p2, clear ghost
                onChange({ p2Lat: lat, p2Lng: lng });
                r.clickStep = 0;
                clearGhost(r);
            }
        });

        map.on('mousemove', (e) => {
            const r = s.current;
            if (!r.ghost) return;
            const { lat, lng } = e.latlng;
            r.ghost.setLatLng([lat, lng]);
            if (r.ghostPoly && r.p1Pos) {
                r.ghostPoly.setLatLngs([[r.p1Pos.lat, r.p1Pos.lng], [lat, lng]]);
            }
        });

        return () => { map.remove(); r.map = null; };
    }, []);

    // ── Satellite toggle ──────────────────────────────────────────────────────
    useEffect(() => {
        const r = s.current;
        if (!r.map) return;
        if (satellite) { r.osmLayer.remove(); r.satLayer.addTo(r.map); }
        else           { r.satLayer.remove(); r.osmLayer.addTo(r.map); }
    }, [satellite]);

    // ── Sync markers + line when coords change ────────────────────────────────
    useEffect(() => {
        const r   = s.current;
        const map = r.map;
        if (!map) return;

        if (r.m1)   { r.m1.remove();   r.m1   = null; }
        if (r.m2)   { r.m2.remove();   r.m2   = null; }
        if (r.poly) { r.poly.remove(); r.poly = null; }

        const has1 = p1Lat != null && p1Lng != null;
        const has2 = p2Lat != null && p2Lng != null;

        if (has1) {
            r.p1Pos = { lat: p1Lat, lng: p1Lng };
            r.m1 = draggableMarker(map, p1Lat, p1Lng, '1', ({ lat, lng }) =>
                onChange({ p1Lat: lat, p1Lng: lng }));
        }
        if (has2) {
            r.m2 = draggableMarker(map, p2Lat, p2Lng, '2', ({ lat, lng }) =>
                onChange({ p2Lat: lat, p2Lng: lng }));
        }
        if (has1 && has2) {
            r.poly = L.polyline([[p1Lat, p1Lng], [p2Lat, p2Lng]], {
                color: '#cba6f7', weight: 3, dashArray: '6 4',
            }).addTo(map);
            map.fitBounds([[p1Lat, p1Lng], [p2Lat, p2Lng]], { padding: [40, 40], maxZoom: 18 });
        } else if (has1) {
            map.setView([p1Lat, p1Lng], Math.max(map.getZoom(), 15));
        }

        r.clickStep = has1 && !has2 ? 1 : 0;

        // If p2 was set externally (text input), drop the ghost
        if (has2) clearGhost(r);
    }, [p1Lat, p1Lng, p2Lat, p2Lng]);

    const hint = p1Lat == null ? 'Click to place point 1'
               : p2Lat == null ? 'Click to place point 2'
               : 'Drag markers to reposition · click to reset';

    return (
        <div class="line-map-wrap">
            <div class="line-map-container">
                <div ref={containerRef} class="line-map" />
                <button class="sat-toggle" onClick={() => setSatellite(v => !v)}>
                    {satellite ? 'Map' : 'Satellite'}
                </button>
            </div>
            <p class="line-map-hint">{hint}</p>
        </div>
    );
}

// ── Helpers ───────────────────────────────────────────────────────────────────

function draggableMarker(map, lat, lng, label, onDrag) {
    const m = L.marker([lat, lng], { icon: makeIcon(label), draggable: true }).addTo(map);
    m.on('dragend', (e) => onDrag(e.target.getLatLng()));
    return m;
}

function clearGhost(r) {
    if (r.ghost)     { r.ghost.remove();     r.ghost     = null; }
    if (r.ghostPoly) { r.ghostPoly.remove(); r.ghostPoly = null; }
}
