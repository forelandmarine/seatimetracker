
import { StyleSheet, ViewStyle, TextStyle } from 'react-native';

// Foreland Marine brand palette
// Source of truth: brand.yaml in /Users/jack/Library/Mobile Documents/com~apple~CloudDocs/Foreland Group/Marketing Materials/Brand Identity Pack
export const colors = {
  // Primary brand colors
  primary: '#5386B6',           // Steel Blue — primary accent (links, buttons, highlights)
  secondary: '#0C1E42',         // Midnight Blue — cards, panels, elevated surfaces
  accent: '#7BA8C8',            // Muted Blue — secondary accent

  // Backgrounds (dark-first)
  background: '#040D1A',        // Deep Navy — darkest background, hero sections
  backgroundLight: '#FFFFFF',   // White — used in light mode and print contexts
  cardBackground: '#0C1E42',    // Midnight Blue — cards in dark mode
  card: '#FFFFFF',              // White cards in light mode
  cardBackgroundLight: '#F7F9FC', // Light card alias — used by some screens

  // Text Colors
  text: '#FFFFFF',              // White headings/primary text on dark
  textLight: '#040D1A',         // Deep Navy text on light
  textSecondary: '#7BA8C8',     // Muted Blue body copy on dark
  textSecondaryLight: '#4A5568', // Warm gray body copy on light

  // Status Colors
  success: '#22C55E',           // Brand green for confirmed
  warning: '#FFB300',           // Amber for pending
  error: '#DC2626',             // Red for rejected/danger
  danger: '#DC2626',

  // Borders (subtle, low-opacity feel)
  border: 'rgba(255, 255, 255, 0.08)', // White at 8% on dark
  borderLight: '#E2E8F0',       // Light border on light bg

  // Special
  highlight: '#FFD54F',

  // Maritime Accents (legacy — kept for compatibility, not used in brand)
  wave: '#5386B6',
  foam: '#7BA8C8',
  lighthouse: '#FF6F00',

  // UI neutrals
  white: '#FFFFFF',
  black: '#000000',

  // Switch colors
  switchTrackOff: '#767577',
  switchTrackOn: '#5386B6',     // matches primary
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
