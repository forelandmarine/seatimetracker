
import React, { useState } from 'react';
import {
  View,
  Text,
  StyleSheet,
  ScrollView,
  TouchableOpacity,
  useColorScheme,
  Platform,
} from 'react-native';
import { Stack, useRouter, useLocalSearchParams } from 'expo-router';
import { colors } from '@/styles/commonStyles';
import { IconSymbol } from '@/components/IconSymbol';
import { MCA_REQUIREMENTS, MCARequirement } from '@/constants/mcaRequirements';

const createStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    scrollContent: {
      padding: 20,
      paddingTop: Platform.OS === 'android' ? 48 : 20,
      paddingBottom: 40,
    },
    header: {
      marginBottom: 24,
    },
    title: {
      fontSize: 28,
      fontWeight: 'bold',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 8,
    },
    subtitle: {
      fontSize: 16,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      lineHeight: 22,
    },
    requirementCard: {
      backgroundColor: isDark ? colors.cardBackground : colors.cardBackgroundLight,
      borderRadius: 16,
      padding: 20,
      marginBottom: 16,
      borderWidth: 1,
      borderColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    requirementHeader: {
      flexDirection: 'row',
      justifyContent: 'space-between',
      alignItems: 'flex-start',
      marginBottom: 12,
    },
    requirementTitleContainer: {
      flex: 1,
      marginRight: 12,
    },
    requirementTitle: {
      fontSize: 18,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 4,
    },
    regulationBadge: {
      backgroundColor: colors.primary + '20',
      paddingHorizontal: 10,
      paddingVertical: 4,
      borderRadius: 8,
    },
    regulationText: {
      fontSize: 12,
      fontWeight: '600',
      color: colors.primary,
    },
    requirementDescription: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 16,
      fontStyle: 'italic',
    },
    requirementSection: {
      marginBottom: 16,
    },
    requirementLabel: {
      fontSize: 15,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 4,
    },
    requirementValue: {
      fontSize: 16,
      fontWeight: 'bold',
      color: colors.primary,
      marginBottom: 8,
    },
    detailItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 6,
      paddingLeft: 8,
    },
    bullet: {
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginRight: 8,
      marginTop: 2,
    },
    detailText: {
      flex: 1,
      fontSize: 14,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      lineHeight: 20,
    },
    notesSection: {
      marginTop: 8,
      paddingTop: 16,
      borderTopWidth: 1,
      borderTopColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
    },
    notesTitle: {
      fontSize: 14,
      fontWeight: '600',
      color: isDark ? colors.text : colors.textLight,
      marginBottom: 8,
    },
    noteItem: {
      flexDirection: 'row',
      alignItems: 'flex-start',
      marginBottom: 6,
    },
    noteText: {
      flex: 1,
      fontSize: 13,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      lineHeight: 18,
      fontStyle: 'italic',
    },
    divider: {
      height: 1,
      backgroundColor: isDark ? 'rgba(255, 255, 255, 0.1)' : 'rgba(0, 0, 0, 0.1)',
      marginVertical: 24,
    },
  });

export default function MCARequirementsScreen() {
  const colorScheme = useColorScheme();
  const isDark = colorScheme === 'dark';
  const styles = createStyles(isDark);
  const router = useRouter();
  const { department } = useLocalSearchParams<{ department?: string }>();

  const userDepartment = department?.toLowerCase() || 'deck';
  console.log('[MCARequirementsScreen] User viewing MCA requirements reference for department:', userDepartment);

  const textColor = isDark ? colors.text : colors.textLight;
  const backgroundColor = isDark ? colors.background : colors.backgroundLight;

  const pageTitle = userDepartment === 'engineering' 
    ? 'MCA Engineering Pathway' 
    : 'MCA Large Yacht Pathway';
  
  const pageSubtitle = userDepartment === 'engineering'
    ? 'Engineering Officers sea service requirements for MCA certification'
    : 'Deck Officers sea service requirements for MCA certification';

  return (
    <>
      <Stack.Screen
        options={{
          title: 'MCA Requirements',
          headerShown: true,
          headerBackTitle: 'Back',
          headerBackTitleVisible: true,
          headerStyle: {
            backgroundColor: backgroundColor,
          },
          headerTintColor: textColor,
          headerShadowVisible: false,
        }}
      />
      <View style={styles.container}>
        <ScrollView style={styles.container} contentContainerStyle={styles.scrollContent}>
          <View style={styles.header}>
            <Text style={styles.title}>{pageTitle}</Text>
            <Text style={styles.subtitle}>
              {pageSubtitle}
            </Text>
          </View>

          {MCA_REQUIREMENTS.map((requirement, index) => (
            <React.Fragment key={requirement.id}>
              <View style={styles.requirementCard}>
                <View style={styles.requirementHeader}>
                  <View style={styles.requirementTitleContainer}>
                    <Text style={styles.requirementTitle}>{requirement.title}</Text>
                  </View>
                  <View style={styles.regulationBadge}>
                    <Text style={styles.regulationText}>{requirement.regulation}</Text>
                  </View>
                </View>

                <Text style={styles.requirementDescription}>{requirement.description}</Text>

                {requirement.requirements.map((req, reqIndex) => (
                  <View key={reqIndex} style={styles.requirementSection}>
                    <Text style={styles.requirementLabel}>{req.label}</Text>
                    <Text style={styles.requirementValue}>{req.value}</Text>
                    {req.details && req.details.length > 0 && (
                      <View>
                        {req.details.map((detail, detailIndex) => (
                          <View key={detailIndex} style={styles.detailItem}>
                            <Text style={styles.bullet}>•</Text>
                            <Text style={styles.detailText}>{detail}</Text>
                          </View>
                        ))}
                      </View>
                    )}
                  </View>
                ))}

                {requirement.notes && requirement.notes.length > 0 && (
                  <View style={styles.notesSection}>
                    <Text style={styles.notesTitle}>Additional Notes:</Text>
                    {requirement.notes.map((note, noteIndex) => (
                      <View key={noteIndex} style={styles.noteItem}>
                        <Text style={styles.bullet}>ℹ️</Text>
                        <Text style={styles.noteText}>{note}</Text>
                      </View>
                    ))}
                  </View>
                )}
              </View>

              {index < MCA_REQUIREMENTS.length - 1 && <View style={styles.divider} />}
            </React.Fragment>
          ))}
        </ScrollView>
      </View>
    </>
  );
}
