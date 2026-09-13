
import React from 'react';
import { View, StyleSheet, Text, useColorScheme } from 'react-native';
import { WebView } from 'react-native-webview';
import { colors } from '@/styles/commonStyles';

interface TrackPoint {
  latitude: number;
  longitude: number;
  timestamp?: string;
}

interface CartoMapProps {
  latitude: number;
  longitude: number;
  vesselName?: string;
  /**
   * Optional list of recent positions to render as a polyline track.
   * Should be ordered oldest → newest. The current position is added
   * automatically as the last point.
   */
  track?: TrackPoint[];
}

export default function CartoMap({ latitude, longitude, vesselName, track }: CartoMapProps) {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';

  // Build track polyline JS — embed coordinates safely as JSON
  const trackJson = JSON.stringify(
    (track || [])
      .filter((p) => p.latitude != null && p.longitude != null)
      .map((p) => [Number(p.latitude), Number(p.longitude)])
  );

  // Generate HTML for the map using Esri basemaps with theme support
  const mapHTML = `
    <!DOCTYPE html>
    <html>
    <head>
      <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
      <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
      <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
      <style>
        body, html {
          margin: 0;
          padding: 0;
          height: 100%;
          width: 100%;
          background-color: ${isDark ? '#1a1a1a' : '#ffffff'};
        }
        #map {
          height: 100%;
          width: 100%;
        }
      </style>
    </head>
    <body>
      <div id="map"></div>
      <script>
        // Initialize map centered on vessel location
        const map = L.map('map', {
          center: [${latitude}, ${longitude}],
          zoom: 10,
          zoomControl: true,
          attributionControl: true
        });

        // Add Esri basemap - Ocean Base in light mode so open water shows
        // bathymetry under the track, Dark Gray Canvas in dark mode.
        // Esri serves tiles as {z}/{y}/{x}, the reverse of Leaflet's usual
        // {z}/{x}/{y}, and offers no retina or subdomain variants. Place names
        // live in a separate reference layer drawn over the base.
        const esriService = '${isDark ? 'Canvas/World_Dark_Gray' : 'Ocean/World_Ocean'}';
        const esriUrl = (layer) =>
          'https://server.arcgisonline.com/ArcGIS/rest/services/' + esriService + '_' + layer +
          '/MapServer/tile/{z}/{y}/{x}';

        // Ocean Base is only cached to zoom 16, Dark Gray Canvas well past 20.
        // maxNativeZoom lets Leaflet upscale beyond that instead of going blank.
        const esriMaxNative = ${isDark ? '20' : '16'};

        L.tileLayer(esriUrl('Base'), {
          attribution: '${isDark
            ? 'Esri, HERE, Garmin, &copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
            : 'Esri, Garmin, GEBCO, NOAA NGDC, and other contributors'}',
          maxZoom: 20,
          maxNativeZoom: esriMaxNative
        }).addTo(map);

        L.tileLayer(esriUrl('Reference'), {
          maxZoom: 20,
          maxNativeZoom: esriMaxNative
        }).addTo(map);

        // Create custom vessel icon with theme-aware styling
        const vesselIcon = L.divIcon({
          className: 'vessel-marker',
          html: '<div style="background-color: #007AFF; width: 16px; height: 16px; border-radius: 50%; border: 3px solid ${isDark ? '#2c2c2e' : 'white'}; box-shadow: 0 2px 8px rgba(0,0,0,${isDark ? '0.6' : '0.3'});"></div>',
          iconSize: [22, 22],
          iconAnchor: [11, 11]
        });

        // Add marker for vessel
        const marker = L.marker([${latitude}, ${longitude}], { icon: vesselIcon }).addTo(map);

        ${vesselName ? `marker.bindPopup('<div style="color: ${isDark ? '#ffffff' : '#000000'}; background-color: ${isDark ? '#2c2c2e' : '#ffffff'};"><b>${vesselName}</b><br>Lat: ${latitude.toFixed(4)}<br>Lon: ${longitude.toFixed(4)}</div>');` : ''}

        // Optionally render the recent track as a polyline
        const trackPoints = ${trackJson};
        if (trackPoints && trackPoints.length > 1) {
          const fullTrack = [...trackPoints, [${latitude}, ${longitude}]];
          L.polyline(fullTrack, {
            color: '${isDark ? '#5386B6' : '#0077BE'}',
            weight: 3,
            opacity: 0.85,
            smoothFactor: 1,
          }).addTo(map);
          // Fit the map to show the whole track
          map.fitBounds(L.latLngBounds(fullTrack), { padding: [30, 30], maxZoom: 12 });
        }

        // Disable scroll zoom on mobile for better UX
        map.scrollWheelZoom.disable();
        map.on('click', function() {
          if (map.scrollWheelZoom.enabled()) {
            map.scrollWheelZoom.disable();
          } else {
            map.scrollWheelZoom.enable();
          }
        });
      </script>
    </body>
    </html>
  `;

  return (
    <View style={styles.container}>
      <WebView
        source={{ html: mapHTML }}
        style={styles.webview}
        scrollEnabled={false}
        bounces={false}
        javaScriptEnabled={true}
        domStorageEnabled={true}
        startInLoadingState={true}
        renderLoading={() => (
          <View style={[styles.loadingContainer, { backgroundColor: isDark ? colors.cardBackground : colors.card }]}>
            <Text style={[styles.loadingText, { color: isDark ? colors.textSecondary : colors.textSecondaryLight }]}>
              Loading map...
            </Text>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  container: {
    height: 200,
    borderRadius: 8,
    overflow: 'hidden',
    marginTop: 12,
  },
  webview: {
    flex: 1,
    backgroundColor: 'transparent',
  },
  loadingContainer: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
  },
  loadingText: {
    fontSize: 14,
  },
});
