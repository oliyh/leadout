import { useEffect, useRef, useState } from 'preact/hooks';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

delete L.Icon.Default.prototype._getIconUrl;
L.Icon.Default.mergeOptions({ iconUrl: '', shadowUrl: '', iconRetinaUrl: '' });

const OSM_URL  = 'https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png';
const SAT_URL  = 'https://server.arcgisonline.com/ArcGIS/rest/services/World_Imagery/MapServer/tile/{z}/{y}/{x}';
const OSM_ATTR = '© <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>';
const SAT_ATTR = 'Tiles © Esri — Source: Esri, Maxar, Earthstar Geographics, USGS, Aerogrid, IGN, IGP, UPR-EGP, and the GIS User Community';

function makeIcon(label, ghost = false) {
    return L.divIcon({
        html: `<div class="line-map-marker${ghost ? ' line-map-marker-ghost' : ''}">${label}</div>`,
        iconSize: [24, 24], iconAnchor: [12, 12], className: '',
    });
}

export function LineSegmentMap({ p1Lat, p1Lng, p2Lat, p2Lng, onChange }) {
    const containerRef = useRef(null);
    const r = useRef({
        map: null, osmLayer: null, satLayer: null,
        m1: null, m2: null, poly: null,
        ghost: null, ghostPoly: null, p1Pos: null,
        clickStep: 0,
    });
    // Always points to the latest onChange so stale closures in Leaflet event
    // handlers (set up once in the mount effect) call the current version.
    const onChangeRef = useRef(onChange);
    onChangeRef.current = onChange;

    const [satellite, setSatellite] = useState(false);
    const [expanded,  setExpanded]  = useState(false);

    // ── Init map + geolocation ────────────────────────────────────────────────
    useEffect(() => {
        const s   = r.current;
        const map = L.map(containerRef.current, { center: [51.5, -0.12], zoom: 13 });

        s.osmLayer = L.tileLayer(OSM_URL, { attribution: OSM_ATTR, maxZoom: 19 }).addTo(map);
        s.satLayer = L.tileLayer(SAT_URL, { attribution: SAT_ATTR, maxZoom: 19 });
        s.map = map;

        // Pan to user location on open (if no points placed yet)
        navigator.geolocation?.getCurrentPosition(
            ({ coords }) => {
                if (!s.p1Pos) map.setView([coords.latitude, coords.longitude], 15);
            },
            () => {},
        );

        map.on('click', (e) => {
            const { lat, lng } = e.latlng;
            if (s.clickStep === 0) {
                clearGhost(s);
                onChangeRef.current({ p1Lat: lat, p1Lng: lng, p2Lat: null, p2Lng: null });
                s.p1Pos    = { lat, lng };
                s.clickStep = 1;
                s.ghost = L.marker([lat, lng], {
                    icon: makeIcon('2', true), interactive: false, zIndexOffset: -100,
                }).addTo(map);
                s.ghostPoly = L.polyline([[lat, lng], [lat, lng]], {
                    color: '#cba6f7', weight: 2, dashArray: '4 4', opacity: 0.5,
                }).addTo(map);
            } else {
                onChangeRef.current({ p2Lat: lat, p2Lng: lng });
                s.clickStep = 0;
                clearGhost(s);
            }
        });

        map.on('mousemove', (e) => {
            const s = r.current;
            if (!s.ghost) return;
            const { lat, lng } = e.latlng;
            s.ghost.setLatLng([lat, lng]);
            if (s.ghostPoly && s.p1Pos)
                s.ghostPoly.setLatLngs([[s.p1Pos.lat, s.p1Pos.lng], [lat, lng]]);
        });

        return () => { map.remove(); s.map = null; };
    }, []);

    // ── Satellite toggle ──────────────────────────────────────────────────────
    useEffect(() => {
        const s = r.current;
        if (!s.map) return;
        if (satellite) { s.osmLayer.remove(); s.satLayer.addTo(s.map); }
        else           { s.satLayer.remove(); s.osmLayer.addTo(s.map); }
    }, [satellite]);

    // ── Expanded toggle — Leaflet must recalculate its size after CSS change ──
    useEffect(() => {
        const s = r.current;
        if (!s.map) return;
        requestAnimationFrame(() => s.map.invalidateSize());
    }, [expanded]);

    // ── Sync markers + line ───────────────────────────────────────────────────
    useEffect(() => {
        const s   = r.current;
        const map = s.map;
        if (!map) return;

        if (s.m1)   { s.m1.remove();   s.m1   = null; }
        if (s.m2)   { s.m2.remove();   s.m2   = null; }
        if (s.poly) { s.poly.remove(); s.poly = null; }

        const has1 = p1Lat != null && p1Lng != null;
        const has2 = p2Lat != null && p2Lng != null;

        if (has1) {
            s.p1Pos = { lat: p1Lat, lng: p1Lng };
            s.m1 = draggableMarker(map, p1Lat, p1Lng, '1', ({ lat, lng }) =>
                onChangeRef.current({ p1Lat: lat, p1Lng: lng }));
        }
        if (has2) {
            s.m2 = draggableMarker(map, p2Lat, p2Lng, '2', ({ lat, lng }) =>
                onChangeRef.current({ p2Lat: lat, p2Lng: lng }));
        }
        if (has1 && has2) {
            s.poly = L.polyline([[p1Lat, p1Lng], [p2Lat, p2Lng]], {
                color: '#cba6f7', weight: 3, dashArray: '6 4',
            }).addTo(map);
            map.fitBounds([[p1Lat, p1Lng], [p2Lat, p2Lng]], { padding: [40, 40], maxZoom: 18 });
        } else if (has1) {
            map.setView([p1Lat, p1Lng], Math.max(map.getZoom(), 15));
        }

        s.clickStep = has1 && !has2 ? 1 : 0;
        if (has2) clearGhost(s);
    }, [p1Lat, p1Lng, p2Lat, p2Lng]);

    const hint = p1Lat == null ? 'Click to place point 1'
               : p2Lat == null ? 'Click to place point 2'
               : 'Drag markers to reposition · click to reset';

    return (
        <div class="line-map-wrap">
            <div class={`line-map-container${expanded ? ' line-map-expanded' : ''}`}>
                <div ref={containerRef} class="line-map" />
                <button class="map-btn sat-toggle" onClick={() => setSatellite(v => !v)}>
                    {satellite ? 'Map' : 'Satellite'}
                </button>
                <button class="map-btn expand-toggle" onClick={() => setExpanded(v => !v)}
                        title={expanded ? 'Collapse map' : 'Expand map'}>
                    {expanded ? '✕' : '⛶'}
                </button>
                {expanded && <p class="line-map-hint-overlay">{hint}</p>}
            </div>
            {!expanded && <p class="line-map-hint">{hint}</p>}
        </div>
    );
}

function draggableMarker(map, lat, lng, label, onDrag) {
    const m = L.marker([lat, lng], { icon: makeIcon(label), draggable: true }).addTo(map);
    m.on('dragend', (e) => onDrag(e.target.getLatLng()));
    return m;
}

function clearGhost(s) {
    if (s.ghost)     { s.ghost.remove();     s.ghost     = null; }
    if (s.ghostPoly) { s.ghostPoly.remove(); s.ghostPoly = null; }
}
