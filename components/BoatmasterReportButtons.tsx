import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet, TouchableOpacity, ActivityIndicator, Alert, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { downloadBoatmasterReport, getUserProfile } from '@/utils/seaTimeApi';
import { log, error as logError } from '@/utils/log';

type Format = 'msf4366' | 'pla';

const FILE_NAMES: Record<Format, string> = {
  msf4366: 'BML_Work_Record_MSF4366',
  pla: 'PLA_Details_of_Service',
};

/**
 * Download buttons for Boatmasters' Licence paperwork, pre-filled from the
 * user's logged service: the BML Work Record (MSF 4366) and the Port of London
 * LKE Details of Service sheet. Shown to MCA crew in the commercial sector.
 */
export function BoatmasterReportButtons() {
  const [visible, setVisible] = useState(false);
  const [busy, setBusy] = useState<Format | null>(null);

  useEffect(() => {
    getUserProfile()
      .then((p) => {
        const authority = p?.maritime_authority ?? 'mca';
        setVisible(authority === 'mca' && p?.vessel_sector === 'commercial');
      })
      .catch(() => {});
  }, []);

  if (!visible) return null;

  const download = async (format: Format) => {
    log(`User tapped Boatmasters report: ${format}`);
    setBusy(format);
    try {
      const blob = await downloadBoatmasterReport(format);
      const fileName = `${FILE_NAMES[format]}_${new Date().toISOString().split('T')[0]}.pdf`;
      if (Platform.OS === 'web') {
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = fileName;
        document.body.appendChild(link);
        link.click();
        document.body.removeChild(link);
        URL.revokeObjectURL(url);
        return;
      }
      const base64data = await new Promise<string>((resolve, reject) => {
        const reader = new FileReader();
        reader.onerror = () => reject(new Error('Failed to read PDF data'));
        reader.onloadend = () => resolve(reader.result as string);
        reader.readAsDataURL(blob);
      });
      const fileUri = `${FileSystem.documentDirectory}${fileName}`;
      await FileSystem.writeAsStringAsync(fileUri, base64data.split(',')[1], {
        encoding: FileSystem.EncodingType.Base64,
      });
      if (await Sharing.isAvailableAsync()) {
        await Sharing.shareAsync(fileUri, { mimeType: 'application/pdf', dialogTitle: 'Save or Share PDF', UTI: 'com.adobe.pdf' });
      } else {
        Alert.alert('Saved', `PDF saved to:\n${fileUri}`);
      }
    } catch (e: any) {
      logError('[BoatmasterReportButtons] Download failed:', e?.message || e);
      Alert.alert('Download Failed', `Unable to create the PDF. ${e?.message || 'Please try again.'}`);
    } finally {
      setBusy(null);
    }
  };

  const button = (format: Format, label: string) => (
    <TouchableOpacity style={styles.button} onPress={() => download(format)} disabled={busy !== null}>
      {busy === format ? (
        <ActivityIndicator color="#ffffff" />
      ) : (
        <>
          <IconSymbol ios_icon_name="doc.text.fill" android_material_icon_name="description" size={24} color="#ffffff" />
          <Text style={styles.buttonText}>{label}</Text>
        </>
      )}
    </TouchableOpacity>
  );

  return (
    <View>
      {button('msf4366', 'BML Work Record (MSF 4366)')}
      {button('pla', 'PLA LKE Details of Service')}
      <Text style={styles.note}>
        Pre-filled from your commercial deck service. Add the employer, then have each row signed.
      </Text>
    </View>
  );
}

const styles = StyleSheet.create({
  button: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    backgroundColor: colors.primary,
    borderRadius: 12,
    padding: 15,
    marginBottom: 10,
  },
  buttonText: {
    color: '#ffffff',
    fontSize: 16,
    fontWeight: '600',
    marginLeft: 10,
  },
  note: {
    fontSize: 12,
    lineHeight: 17,
    color: colors.textSecondary,
    marginTop: 2,
  },
});
