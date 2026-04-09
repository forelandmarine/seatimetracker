
import { StyleSheet, ViewStyle, TextStyle } from 'react-native';

// Maritime Color Palette
export const colors = {
  // Primary Maritime Blues
  primary: '#0077BE',           // Ocean Blue - main brand color
  secondary: '#003D5C',         // Deep Sea Blue - darker accent
  accent: '#00A8E8',            // Bright Cyan - highlights

  // Backgrounds
  background: '#0A1929',        // Dark Navy (dark mode)
  backgroundLight: '#F0F8FF',   // Alice Blue (light mode)
  cardBackground: '#1A2332',    // Dark cards (dark mode)
  card: '#FFFFFF',              // White cards (light mode)
  cardBackgroundLight: '#FFFFFF', // Alias for card — used by some screens

  // Text Colors
  text: '#E8F1F5',              // Light text (dark mode)
  textLight: '#1A1A1A',         // Dark text (light mode)
  textSecondary: '#8B9DAF',     // Muted text (dark mode)
  textSecondaryLight: '#5A6C7D', // Muted text (light mode)

  // Status Colors
  success: '#00C853',           // Green for confirmed
  warning: '#FFB300',           // Amber for pending
  error: '#D32F2F',             // Red for rejected/danger
  danger: '#D32F2F',

  // Borders
  border: '#2A3F54',            // Dark border (dark mode)
  borderLight: '#D1E3F0',       // Light border (light mode)

  // Special
  highlight: '#FFD54F',

  // Maritime Accents
  wave: '#4FC3F7',
  foam: '#B3E5FC',
  lighthouse: '#FF6F00',

  // UI neutrals
  white: '#FFFFFF',
  black: '#000000',

  // Switch colors
  switchTrackOff: '#767577',
  switchTrackOn: '#0077BE',
  switchThumbOff: '#F4F3F4',
  switchThumbOn: '#FFFFFF',
};

// Typography scale — use these instead of hardcoded fontSize/fontWeight
export const typography = {
  h1: { fontSize: 28, fontWeight: '700' as const },
  h2: { fontSize: 22, fontWeight: '700' as const },
  h3: { fontSize: 18, fontWeight: '600' as const },
  body: { fontSize: 16, fontWeight: '400' as const },
  bodyBold: { fontSize: 16, fontWeight: '600' as const },
  small: { fontSize: 14, fontWeight: '400' as const },
  caption: { fontSize: 12, fontWeight: '400' as const },
  label: { fontSize: 13, fontWeight: '600' as const },
  button: { fontSize: 16, fontWeight: '600' as const },
};

// Spacing scale — consistent across screens
export const spacing = {
  xs: 4,
  sm: 8,
  md: 16,
  lg: 20,
  xl: 24,
  xxl: 32,
};

export const buttonStyles = StyleSheet.create({
  instructionsButton: {
    backgroundColor: colors.primary,
    alignSelf: 'center',
    width: '100%',
  },
  backButton: {
    backgroundColor: colors.secondary,
    alignSelf: 'center',
    width: '100%',
  },
});

export const commonStyles = StyleSheet.create({
  wrapper: {
    backgroundColor: colors.background,
    width: '100%',
    height: '100%',
  },
  container: {
    flex: 1,
    backgroundColor: colors.background,
    width: '100%',
    height: '100%',
    justifyContent: 'center',
    alignItems: 'center',
  },
  content: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    maxWidth: 800,
    width: '100%',
  },
  title: {
    fontSize: 24,
    fontWeight: '800',
    textAlign: 'center',
    color: colors.text,
    marginBottom: 10
  },
  text: {
    fontSize: 16,
    fontWeight: '500',
    color: colors.text,
    marginBottom: 8,
    lineHeight: 24,
    textAlign: 'center',
  },
  section: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  buttonContainer: {
    width: '100%',
    alignItems: 'center',
    paddingHorizontal: 20,
  },
  card: {
    backgroundColor: colors.cardBackground,
    borderColor: colors.border,
    borderWidth: 1,
    borderRadius: 12,
    padding: 16,
    marginVertical: 8,
    width: '100%',
    boxShadow: '0px 2px 8px rgba(0, 119, 190, 0.1)',
    elevation: 3,
  },
  icon: {
    width: 60,
    height: 60,
    tintColor: colors.primary,
  },
});
