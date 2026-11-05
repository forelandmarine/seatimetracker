import React, { useState } from 'react';
import { View, Text, TouchableOpacity, Platform } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import type { CertRoute } from '@/constants/certRoutes';

const MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];

/** 'YYYY-MM-DD' as a local date, so the picker does not shift it a day across time zones. */
const parseDay = (day: string): Date => {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
};
const toDay = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
const formatDay = (day: string): string => {
  const date = parseDay(day);
  return `${date.getDate()} ${MONTHS[date.getMonth()]} ${date.getFullYear()}`;
};

interface Props {
  routes: CertRoute[];
  route: CertRoute;
  startDate: string | null;
  onSelectRoute: (id: string) => void;
  onSetStartDate: (day: string | null) => void;
  isDark: boolean;
}

/**
 * Which route the user is taking to their target certificate, and the date the
 * route counts service from where it has one. Shown under the progress bars
 * only when the certificate has more than one route.
 */
export function RoutePicker({ routes, route, startDate, onSelectRoute, onSetStartDate, isDark }: Props) {
  const [open, setOpen] = useState(false);
  const [showDate, setShowDate] = useState(false);

  const textColor = isDark ? colors.text : colors.textLight;
  const mutedColor = isDark ? colors.textSecondary : colors.textSecondaryLight;
  const lineColor = isDark ? 'rgba(255,255,255,0.1)' : 'rgba(0,0,0,0.08)';

  return (
    <View style={{ marginTop: 16, paddingTop: 14, borderTopWidth: 1, borderTopColor: lineColor }}>
      <TouchableOpacity
        onPress={() => setOpen((v) => !v)}
        style={{ flexDirection: 'row', alignItems: 'center' }}
        accessibilityLabel="Change your route"
      >
        <View style={{ flex: 1 }}>
          <Text style={{ fontSize: 12, color: mutedColor, marginBottom: 2 }}>Your route</Text>
          <Text style={{ fontSize: 14, fontWeight: '600', color: textColor }}>{route.label}</Text>
        </View>
        <Text style={{ fontSize: 13, color: colors.primary, fontWeight: '600' }}>
          {open ? 'Done' : 'Change'}
        </Text>
        <IconSymbol
          ios_icon_name={open ? 'chevron.up' : 'chevron.down'}
          android_material_icon_name={open ? 'expand-less' : 'expand-more'}
          size={16}
          color={colors.primary}
        />
      </TouchableOpacity>

      {open &&
        routes.map((r) => {
          const selected = r.id === route.id;
          return (
            <TouchableOpacity
              key={r.id}
              onPress={() => {
                onSelectRoute(r.id);
                setOpen(false);
              }}
              style={{
                flexDirection: 'row',
                marginTop: 10,
                padding: 10,
                borderRadius: 10,
                borderWidth: 1,
                borderColor: selected ? colors.primary : lineColor,
              }}
              accessibilityRole="radio"
              accessibilityState={{ selected }}
            >
              <IconSymbol
                ios_icon_name={selected ? 'largecircle.fill.circle' : 'circle'}
                android_material_icon_name={selected ? 'radio-button-checked' : 'radio-button-unchecked'}
                size={18}
                color={selected ? colors.primary : mutedColor}
              />
              <View style={{ flex: 1, marginLeft: 10 }}>
                <Text style={{ fontSize: 14, fontWeight: '600', color: textColor }}>{r.label}</Text>
                <Text style={{ fontSize: 12, color: mutedColor, lineHeight: 17, marginTop: 2 }}>
                  {r.summary} ({r.source})
                </Text>
              </View>
            </TouchableOpacity>
          );
        })}

      {!open && <Text style={{ fontSize: 12, color: mutedColor, lineHeight: 17, marginTop: 4 }}>{route.summary}</Text>}

      {route.startDate && (
        <View style={{ marginTop: 12 }}>
          <Text style={{ fontSize: 12, color: mutedColor, marginBottom: 4 }}>{route.startDate.label}</Text>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 16 }}>
            <TouchableOpacity onPress={() => setShowDate((v) => !v)} accessibilityLabel={route.startDate.label}>
              <Text style={{ fontSize: 14, fontWeight: '600', color: colors.primary }}>
                {startDate ? formatDay(startDate) : 'Add date'}
              </Text>
            </TouchableOpacity>
            {startDate && (
              <TouchableOpacity onPress={() => onSetStartDate(null)} accessibilityLabel="Clear the date">
                <Text style={{ fontSize: 13, color: mutedColor }}>Clear</Text>
              </TouchableOpacity>
            )}
          </View>
          {showDate && (
            <DateTimePicker
              value={startDate ? parseDay(startDate) : new Date()}
              mode="date"
              display={Platform.OS === 'ios' ? 'inline' : 'default'}
              maximumDate={new Date()}
              onChange={(event, selected) => {
                if (Platform.OS !== 'ios') setShowDate(false);
                if (event.type === 'set' && selected) {
                  onSetStartDate(toDay(selected));
                  if (Platform.OS === 'ios') setShowDate(false);
                }
              }}
            />
          )}
          {!startDate && (
            <Text style={{ fontSize: 12, color: mutedColor, lineHeight: 17, marginTop: 4 }}>
              {route.startDate.scope === 'all'
                ? 'Until you add it, all your service is counted, including service before this date that will not count.'
                : 'Until you add it, the "after" bars count all your service, including service before this date that will not count.'}
            </Text>
          )}
        </View>
      )}

      {route.caveat && (
        <Text style={{ fontSize: 12, color: mutedColor, lineHeight: 17, marginTop: 10 }}>{route.caveat}</Text>
      )}
    </View>
  );
}
