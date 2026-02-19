import React, { useEffect } from 'react';
import { StyleSheet, View, ViewStyle } from 'react-native';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import 'leaflet/dist/leaflet.css';
import L from 'leaflet';

// Fix for default marker icon in leaflet
const iconRetinaUrl = require('leaflet/dist/images/marker-icon-2x.png');
const iconUrl = require('leaflet/dist/images/marker-icon.png');
const shadowUrl = require('leaflet/dist/images/marker-shadow.png');

// Only run on client side (safe check)
if (typeof window !== 'undefined') {
    delete (L.Icon.Default.prototype as any)._getIconUrl;
    L.Icon.Default.mergeOptions({
        iconRetinaUrl: iconRetinaUrl,
        iconUrl: iconUrl,
        shadowUrl: shadowUrl,
    });
}

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

    const zoom = 13;

    return (
        <View style={[styles.container, style]}>
            {/* MapContainer needs a fixed height/width context. React Native Web View provides flex layout, 
          so direct child div with 100% should work */}
            <div style={{ height: '100%', width: '100%', minHeight: 200 }}>
                {typeof window !== 'undefined' && (
                    <MapContainer
                        center={[initialRegion.latitude, initialRegion.longitude]}
                        zoom={zoom}
                        scrollWheelZoom={false}
                        style={{ height: '100%', width: '100%' }}
                    >
                        <TileLayer
                            attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                            url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                        />
                        {markers.map((marker) => (
                            <Marker
                                key={marker.id}
                                position={[marker.latitude, marker.longitude]}
                            >
                                <Popup>
                                    {marker.title} <br /> {marker.description}
                                </Popup>
                            </Marker>
                        ))}
                    </MapContainer>
                )}
            </div>
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
    },
});
