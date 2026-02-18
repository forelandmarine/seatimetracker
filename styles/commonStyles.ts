
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
  
  // Text Colors
  text: '#E8F1F5',              // Light text (dark mode)
  textLight: '#1A1A1A',         // Dark text (light mode)
  textSecondary: '#8B9DAF',     // Muted text (dark mode)
  textSecondaryLight: '#5A6C7D', // Muted text (light mode)
  
  // Status Colors
  success: '#00C853',           // Green for confirmed
  warning: '#FFB300',           // Amber for pending
  error: '#D32F2F',             // Red for rejected/danger
  danger: '#D32F2F',            // Red for rejected
  
  // Borders
  border: '#2A3F54',            // Dark border (dark mode)
  borderLight: '#D1E3F0',       // Light border (light mode)
  
  // Special
  highlight: '#FFD54F',         // Gold highlight
  
  // Maritime Accents
  wave: '#4FC3F7',              // Light wave blue
  foam: '#B3E5FC',              // Sea foam
  lighthouse: '#FF6F00',        // Lighthouse beacon orange
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
