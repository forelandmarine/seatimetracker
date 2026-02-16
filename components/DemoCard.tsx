import React from "react";
import { Link } from "expo-router";
import { Pressable, StyleSheet, View, Text } from "react-native";
import { IconSymbol } from "@/components/IconSymbol";
import { useTheme } from "@react-navigation/native";
import { ModalDemo } from "./homeData";
import { GlassView } from "expo-glass-effect";

interface DemoCardProps {
  item: ModalDemo;
}

export function DemoCard({ item }: DemoCardProps) {
  const theme = useTheme();

  return (
    <GlassView
      style={[
        styles.demoCard,
        { backgroundColor: theme.dark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.05)' }
      ]}
      glassEffectStyle="regular"
    >
      <View style={[styles.demoIcon, { backgroundColor: item.color }]}>
        <IconSymbol ios_icon_name="square.grid.3x3" android_material_icon_name="apps" color={theme.dark ? '#111111' : '#FFFFFF'} size={24} />
      </View>
      <View style={styles.demoContent}>
        <Text style={[styles.demoTitle, { color: theme.colors.text }]}>
          {item.title}
        </Text>
        <Text style={[styles.demoDescription, { color: theme.dark ? '#98989D' : '#666' }]}>
          {item.description}
        </Text>
      </View>
      <Link href={item.route as any} asChild>
        <Pressable>
          <View
            style={[
              styles.tryButton,
              { backgroundColor: theme.dark ? 'rgba(255,255,255,0.15)' : 'rgba(0,0,0,0.08)' }
            ]}
          >
            <Text style={[styles.tryButtonText, { color: theme.colors.primary }]}>
              Try It
            </Text>
          </View>
        </Pressable>
      </Link>
    </GlassView>
  );
}

const styles = StyleSheet.create({
  demoCard: {
    borderRadius: 12,
    padding: 16,
    marginBottom: 12,
    flexDirection: 'row',
    alignItems: 'center',
  },
  demoIcon: {
    width: 48,
    height: 48,
    borderRadius: 24,
    justifyContent: 'center',
    alignItems: 'center',
    marginRight: 16,
  },
  demoContent: {
    flex: 1,
  },
  demoTitle: {
    fontSize: 18,
    fontWeight: '600',
    marginBottom: 4,
  },
  demoDescription: {
    fontSize: 14,
    lineHeight: 18,
  },
  tryButton: {
    paddingHorizontal: 16,
    paddingVertical: 8,
    borderRadius: 6,
  },
  tryButtonText: {
    fontSize: 14,
    fontWeight: '600',
  },
});
