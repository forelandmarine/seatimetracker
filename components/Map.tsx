import React, { useMemo } from 'react';
import { StyleSheet, View, ViewStyle, ActivityIndicator } from 'react-native';
import { WebView } from 'react-native-webview';

export interface MapMarker {
    id: string;
    latitude: number;
    longitude: number;
    title?: string;
    description?: string;
}

interface MapProps {
    markers?: MapMarker[];
    initialRegion?: {
        latitude: number;
        longitude: number;
        latitudeDelta: number;
        longitudeDelta: number;
    };
    style?: ViewStyle;
    showsUserLocation?: boolean;
}

export const Map = ({
    markers = [],
    initialRegion = {
        latitude: 37.78825,
        longitude: -122.4324,
        latitudeDelta: 0.0922,
        longitudeDelta: 0.0421,
    },
    style,
    showsUserLocation = false
}: MapProps) => {

    // HTML Content for Leaflet Map
    const mapHtml = useMemo(() => {
        const markersJson = JSON.stringify(markers);
        const centerLat = initialRegion.latitude;
        const centerLng = initialRegion.longitude;
        const zoom = 13;

        return `
        <!DOCTYPE html>
        <html>
        <head>
            <meta name="viewport" content="width=device-width, initial-scale=1.0, maximum-scale=1.0, user-scalable=no" />
            <link rel="stylesheet" href="https://unpkg.com/leaflet@1.9.4/dist/leaflet.css" />
            <link rel="stylesheet" href="https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.css" />
            <script src="https://unpkg.com/leaflet@1.9.4/dist/leaflet.js"></script>
            <script src="https://unpkg.com/leaflet-routing-machine@3.2.12/dist/leaflet-routing-machine.js"></script>
            <style>
                body { margin: 0; padding: 0; }
                #map { height: 100vh; width: 100vw; }
                /* Hide the routing container if desired, or style it. By default it shows on top right */
                .leaflet-routing-container {
                    background-color: white;
                    padding: 10px;
                    max-width: 200px;
                    opacity: 0.9;
                }
            </style>
        </head>
        <body>
            <div id="map"></div>
            <script>
                var map = L.map('map').setView([${centerLat}, ${centerLng}], ${zoom});

                L.tileLayer('https://tile.openstreetmap.org/{z}/{x}/{y}.png', {
                    maxZoom: 19,
                    attribution: '&copy; OpenStreetMap'
                }).addTo(map);

                // Markers
                var markersData = ${markersJson};
                markersData.forEach(function(m) {
                    var marker = L.marker([m.latitude, m.longitude]).addTo(map);
                    if (m.title || m.description) {
                         marker.bindPopup("<b>" + (m.title || "") + "</b><br>" + (m.description || ""));
                    }
                });

                // Routing - Basic implementation
                // Exposed function to set route from React Native
                window.calculateRoute = function(startLat, startLng, endLat, endLng) {
                    if (window.routingControl) {
                        map.removeControl(window.routingControl);
                    }
                    window.routingControl = L.Routing.control({
                        waypoints: [
                            L.latLng(startLat, startLng),
                            L.latLng(endLat, endLng)
                        ],
                        routeWhileDragging: false,
                        showAlternatives: false,
                        addWaypoints: false, // Disable dragging waypoints for simplicity on mobile
                        fitSelectedRoutes: true
                    }).addTo(map);
                };
            </script>
        </body>
        </html>
        `;
    }, [markers, initialRegion]);
    return (
        <View style={[styles.container, style]}>
            <WebView
                originWhitelist={['*']}
                source={{ html: mapHtml }}
                style={styles.webview}
                scrollEnabled={false}
                startInLoadingState={true}
                renderLoading={() => <View style={styles.loading}><ActivityIndicator /></View>}
            />
        </View>
    );
};

const styles = StyleSheet.create({
    container: {
        flex: 1,
        overflow: 'hidden',
        borderRadius: 12,
        width: '100%',
        minHeight: 200,
        backgroundColor: '#e5e7eb',
    },
    webview: {
        flex: 1,
        backgroundColor: 'transparent',
    },
    loading: {
        position: 'absolute',
        top: 0,
        left: 0,
        right: 0,
        bottom: 0,
        justifyContent: 'center',
        alignItems: 'center',
    },
});
