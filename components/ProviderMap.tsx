import React, { useMemo } from 'react';
import { View, StyleSheet, useColorScheme } from 'react-native';
import { WebView } from 'react-native-webview';
import type { ProviderHit } from '@/utils/trainingProviders';

/**
 * Map of search results for "Find a course". Same Esri basemaps as CartoMap.
 * Tapping a marker's popup posts the provider id back so the screen can open it.
 */
export default function ProviderMap({
  hits,
  origin,
  onOpen,
  height = 420,
}: {
  hits: ProviderHit[];
  origin: { lat: number; lng: number } | null;
  onOpen: (id: string) => void;
  height?: number;
}) {
  const isDark = useColorScheme() === 'dark';
  const points = useMemo(
    () =>
      hits
        .filter((h) => h.provider.lat != null && h.provider.lng != null)
        .slice(0, 400)
        .map((h) => ({ id: h.provider.id, n: h.provider.name, c: h.provider.city ?? '', la: h.provider.lat, lo: h.provider.lng })),
    [hits],
  );

  const html = `<!DOCTYPE html><html><head>
<meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
<link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
<script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
<style>html,body,#map{margin:0;padding:0;height:100%;width:100%;background:${isDark ? '#1a1a1a' : '#fff'}}
.pop{font:14px -apple-system,system-ui,sans-serif}.pop a{color:#0077BE;font-weight:600;text-decoration:none}</style>
</head><body><div id="map"></div><script>
const pts = ${JSON.stringify(points)};
const origin = ${JSON.stringify(origin)};
const map = L.map('map', { zoomControl: true });
const svc = '${isDark ? 'Canvas/World_Dark_Gray' : 'Ocean/World_Ocean'}';
const url = (l) => 'https://server.arcgisonline.com/ArcGIS/rest/services/' + svc + '_' + l + '/MapServer/tile/{z}/{y}/{x}';
L.tileLayer(url('Base'), { attribution: 'Esri', maxZoom: 18, maxNativeZoom: ${isDark ? 18 : 16} }).addTo(map);
L.tileLayer(url('Reference'), { maxZoom: 18, maxNativeZoom: ${isDark ? 18 : 16} }).addTo(map);
const dot = (bg) => L.divIcon({ className: '', html: '<div style="background:' + bg + ';width:14px;height:14px;border-radius:50%;border:2px solid ${isDark ? '#2c2c2e' : '#fff'};box-shadow:0 1px 4px rgba(0,0,0,.35)"></div>', iconSize: [18, 18], iconAnchor: [9, 9] });
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const bounds = [];
pts.forEach((p) => {
  const m = L.marker([p.la, p.lo], { icon: dot('#0077BE') }).addTo(map);
  m.bindPopup('<div class="pop"><b>' + esc(p.n) + '</b><br>' + esc(p.c) + '<br><a href="#" onclick="window.ReactNativeWebView.postMessage(\\'' + p.id + '\\');return false;">Open</a></div>');
  bounds.push([p.la, p.lo]);
});
if (origin) { L.marker([origin.lat, origin.lng], { icon: dot('#FF6F00') }).addTo(map); bounds.push([origin.lat, origin.lng]); }
if (bounds.length > 1) map.fitBounds(bounds, { padding: [30, 30], maxZoom: 11 });
else if (bounds.length === 1) map.setView(bounds[0], 10);
else map.setView([30, 0], 2);
</script></body></html>`;

  return (
    <View style={[styles.container, { height }]}>
      <WebView
        source={{ html }}
        style={styles.webview}
        javaScriptEnabled
        domStorageEnabled
        onMessage={(e) => onOpen(e.nativeEvent.data)}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: { borderRadius: 12, overflow: 'hidden', marginHorizontal: 16, marginTop: 8 },
  webview: { flex: 1, backgroundColor: 'transparent' },
});
