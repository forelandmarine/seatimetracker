import React, { useEffect, useState } from 'react';
import { Modal, View, Text, TouchableOpacity, StyleSheet, Platform, useColorScheme } from 'react-native';
import DateTimePicker from '@react-native-community/datetimepicker';
import { useTranslation } from 'react-i18next';
import { colors } from '@/styles/commonStyles';

interface Props {
  visible: boolean;
  value: Date;
  title?: string;
  minimumDate?: Date;
  maximumDate?: Date;
  onCancel: () => void;
  onConfirm: (date: Date) => void;
}

/**
 * A date picker that waits for the user to confirm. On iOS the wheel sits in a
 * sheet with Cancel and Done, since it reports every turn of the wheel. On
 * Android the system dialog already has its own buttons.
 */
export function DatePickerSheet({ visible, value, title, minimumDate, maximumDate, onCancel, onConfirm }: Props) {
  const { t } = useTranslation();
  const isDark = useColorScheme() === 'dark';
  const styles = createStyles(isDark);
  const [draft, setDraft] = useState(value);

  useEffect(() => {
    if (visible) setDraft(value);
  }, [visible, value]);

  if (!visible) return null;

  if (Platform.OS !== 'ios') {
    return (
      <DateTimePicker
        value={value}
        mode="date"
        display="default"
        minimumDate={minimumDate}
        maximumDate={maximumDate}
        onChange={(event, date) => {
          if (event.type === 'set' && date) onConfirm(date);
          else onCancel();
        }}
      />
    );
  }

  return (
    <Modal visible transparent animationType="slide" onRequestClose={onCancel}>
      <View style={styles.overlay}>
        <View style={styles.sheet}>
          <View style={styles.header}>
            <TouchableOpacity onPress={onCancel} hitSlop={8}>
              <Text style={styles.cancel}>{t('common.cancel')}</Text>
            </TouchableOpacity>
            <Text style={styles.title} numberOfLines={1}>{title ?? ''}</Text>
            <TouchableOpacity onPress={() => onConfirm(draft)} hitSlop={8}>
              <Text style={styles.done}>{t('common.done')}</Text>
            </TouchableOpacity>
          </View>
          <DateTimePicker
            value={draft}
            mode="date"
            display="spinner"
            minimumDate={minimumDate}
            maximumDate={maximumDate}
            themeVariant={isDark ? 'dark' : 'light'}
            onChange={(_event, date) => {
              if (date) setDraft(date);
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    overlay: {
      flex: 1,
      justifyContent: 'flex-end',
      backgroundColor: 'rgba(0,0,0,0.4)',
    },
    sheet: {
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderTopLeftRadius: 16,
      borderTopRightRadius: 16,
      paddingBottom: 32,
    },
    header: {
      flexDirection: 'row',
      alignItems: 'center',
      justifyContent: 'space-between',
      paddingHorizontal: 16,
      paddingVertical: 14,
      borderBottomWidth: StyleSheet.hairlineWidth,
      borderBottomColor: isDark ? colors.border : colors.borderLight,
    },
    title: {
      flex: 1,
      textAlign: 'center',
      fontSize: 15,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginHorizontal: 8,
    },
    cancel: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
    done: {
      fontSize: 16,
      fontWeight: '600',
      color: colors.primary,
    },
  });
