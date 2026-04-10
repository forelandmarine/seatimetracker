import React, { useState, useRef } from 'react';
import {
  View,
  Text,
  StyleSheet,
  Dimensions,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  Image,
  NativeSyntheticEvent,
  NativeScrollEvent,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useRouter, Stack } from 'expo-router';
import AsyncStorage from '@react-native-async-storage/async-storage';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';

const { width: SCREEN_WIDTH } = Dimensions.get('window');

const ONBOARDING_COMPLETE_KEY = 'seatime_onboarding_complete';

export async function isOnboardingComplete(): Promise<boolean> {
  try {
    const value = await AsyncStorage.getItem(ONBOARDING_COMPLETE_KEY);
    return value === 'true';
  } catch {
    return false;
  }
}

export async function markOnboardingComplete(): Promise<void> {
  try {
    await AsyncStorage.setItem(ONBOARDING_COMPLETE_KEY, 'true');
  } catch {
    // ignore
  }
}

interface OnboardingSlide {
  iconName: string;
  iconAndroid: string;
  label: string;
  title: string;
  body: string;
}

const slides: OnboardingSlide[] = [
  {
    iconName: 'sailboat.fill',
    iconAndroid: 'sailing',
    label: 'AUTOMATIC TRACKING',
    title: 'Ditch the paper logbook.',
    body:
      'Enter your MMSI and SeaTime Tracker picks up AIS positions automatically. Your sea service builds in the background while you focus on the job.',
  },
  {
    iconName: 'doc.text.fill',
    iconAndroid: 'description',
    label: 'MCA-COMPLIANT REPORTS',
    title: 'CoC-ready at the tap of a button.',
    body:
      'Export sea service testimonials in the format the MCA actually requires. PDF or CSV, signed and ready to submit with your next Notice of Eligibility.',
  },
  {
    iconName: 'building.2.fill',
    iconAndroid: 'business',
    label: 'BUILT BY MARINERS',
    title: 'By Foreland Marine.',
    body:
      'We build Lightship ISM for fleet managers. SeaTime Tracker puts the same standards into the hands of individual officers and engineers.',
  },
];

export default function OnboardingScreen() {
  const router = useRouter();
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);
  const [currentSlide, setCurrentSlide] = useState(0);
  const scrollRef = useRef<ScrollView>(null);

  const handleScroll = (event: NativeSyntheticEvent<NativeScrollEvent>) => {
    const slideIndex = Math.round(event.nativeEvent.contentOffset.x / SCREEN_WIDTH);
    if (slideIndex !== currentSlide) {
      setCurrentSlide(slideIndex);
    }
  };

  const goToSlide = (index: number) => {
    scrollRef.current?.scrollTo({ x: index * SCREEN_WIDTH, animated: true });
    setCurrentSlide(index);
  };

  const handleNext = () => {
    if (currentSlide < slides.length - 1) {
      goToSlide(currentSlide + 1);
    } else {
      handleFinish();
    }
  };

  const handleSkip = () => {
    handleFinish();
  };

  const handleFinish = async () => {
    await markOnboardingComplete();
    router.replace('/auth');
  };

  return (
    <>
      <Stack.Screen options={{ headerShown: false }} />
      <SafeAreaView style={styles.container} edges={['top', 'bottom']}>
        {/* Skip button */}
        <View style={styles.topBar}>
          <TouchableOpacity onPress={handleSkip} hitSlop={10}>
            <Text style={styles.skipText}>Skip</Text>
          </TouchableOpacity>
        </View>

        {/* Slides */}
        <ScrollView
          ref={scrollRef}
          horizontal
          pagingEnabled
          showsHorizontalScrollIndicator={false}
          onScroll={handleScroll}
          scrollEventThrottle={16}
          style={styles.slidesContainer}
        >
          {slides.map((slide, index) => (
            <View key={index} style={styles.slide}>
              <View style={styles.iconContainer}>
                <IconSymbol
                  ios_icon_name={slide.iconName}
                  android_material_icon_name={slide.iconAndroid as any}
                  size={80}
                  color={colors.primary}
                />
              </View>
              <Text style={styles.label}>{slide.label}</Text>
              <Text style={styles.title}>{slide.title}</Text>
              <Text style={styles.body}>{slide.body}</Text>
            </View>
          ))}
        </ScrollView>

        {/* Pagination dots */}
        <View style={styles.pagination}>
          {slides.map((_, index) => (
            <TouchableOpacity
              key={index}
              style={[
                styles.dot,
                currentSlide === index && styles.dotActive,
              ]}
              onPress={() => goToSlide(index)}
              hitSlop={8}
            />
          ))}
        </View>

        {/* Action button */}
        <View style={styles.actionContainer}>
          <TouchableOpacity style={styles.primaryButton} onPress={handleNext}>
            <Text style={styles.primaryButtonText}>
              {currentSlide < slides.length - 1 ? 'Next' : 'Get started'}
            </Text>
          </TouchableOpacity>
        </View>

        {/* Footer */}
        <View style={styles.footer}>
          <Text style={styles.footerText}>By Foreland Marine</Text>
        </View>
      </SafeAreaView>
    </>
  );
}

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    topBar: {
      flexDirection: 'row',
      justifyContent: 'flex-end',
      paddingHorizontal: 20,
      paddingVertical: 12,
    },
    skipText: {
      fontSize: 15,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      fontWeight: '600',
    },
    slidesContainer: {
      flex: 1,
    },
    slide: {
      width: SCREEN_WIDTH,
      paddingHorizontal: 32,
      alignItems: 'center',
      justifyContent: 'center',
      flex: 1,
    },
    iconContainer: {
      width: 140,
      height: 140,
      borderRadius: 70,
      backgroundColor: colors.primary + '15',
      alignItems: 'center',
      justifyContent: 'center',
      marginBottom: 40,
    },
    label: {
      fontSize: 11,
      fontWeight: '700',
      color: colors.primary,
      letterSpacing: 1.5,
      marginBottom: 12,
    },
    title: {
      fontSize: 28,
      fontWeight: '700',
      color: isDark ? colors.text : colors.textLight,
      textAlign: 'center',
      marginBottom: 16,
      lineHeight: 36,
    },
    body: {
      fontSize: 15,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      textAlign: 'center',
      lineHeight: 22,
      maxWidth: 320,
    },
    pagination: {
      flexDirection: 'row',
      justifyContent: 'center',
      alignItems: 'center',
      gap: 8,
      paddingVertical: 24,
    },
    dot: {
      width: 8,
      height: 8,
      borderRadius: 4,
      backgroundColor: isDark ? colors.textSecondary + '40' : colors.textSecondaryLight + '40',
    },
    dotActive: {
      backgroundColor: colors.primary,
      width: 24,
    },
    actionContainer: {
      paddingHorizontal: 32,
      paddingBottom: 16,
    },
    primaryButton: {
      backgroundColor: colors.primary,
      borderRadius: 12,
      paddingVertical: 16,
      alignItems: 'center',
    },
    primaryButtonText: {
      color: '#FFFFFF',
      fontSize: 16,
      fontWeight: '600',
    },
    footer: {
      alignItems: 'center',
      paddingBottom: 16,
    },
    footerText: {
      fontSize: 11,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
    },
  });
