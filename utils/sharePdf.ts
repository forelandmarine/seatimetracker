import { Alert, Platform } from 'react-native';
import * as FileSystem from 'expo-file-system/legacy';
import * as Sharing from 'expo-sharing';

/**
 * Hands a downloaded PDF to the user: a browser download on web, otherwise a
 * file in the documents directory opened in the share sheet.
 */
export async function sharePdfBlob(blob: Blob, fileName: string): Promise<void> {
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
}
