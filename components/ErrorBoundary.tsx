
/**
 * Error Boundary Component
 *
 * Catches JavaScript errors anywhere in the child component tree,
 * logs those errors, and displays a fallback UI.
 *
 * Usage:
 * ```tsx
 * <ErrorBoundary>
 *   <App />
 * </ErrorBoundary>
 * ```
 *
 * Or wrap specific screens:
 * ```tsx
 * <ErrorBoundary fallback={<CustomErrorScreen />}>
 *   <ComplexFeature />
 * </ErrorBoundary>
 * ```
 */

import React, { Component, ReactNode } from "react";
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform, Appearance } from "react-native";
import { colors } from '@/styles/commonStyles';

import { log, error as logError } from '@/utils/log';

interface Props {
  children: ReactNode;
  fallback?: ReactNode;
  onError?: (error: Error, errorInfo: React.ErrorInfo) => void;
}

interface State {
  hasError: boolean;
  error: Error | null;
  errorInfo: React.ErrorInfo | null;
}

export class ErrorBoundary extends Component<Props, State> {
  constructor(props: Props) {
    super(props);
    this.state = {
      hasError: false,
      error: null,
      errorInfo: null,
    };
  }

  static getDerivedStateFromError(error: Error): State {
    logError('[ErrorBoundary] Error caught:', error);
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console with full details
    logError('[ErrorBoundary] ========================================');
    logError('[ErrorBoundary] Error caught by boundary:');
    logError('[ErrorBoundary] Error:', error);
    logError('[ErrorBoundary] Error message:', error.message);
    logError('[ErrorBoundary] Error stack:', error.stack);
    logError('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    logError('[ErrorBoundary] Platform:', Platform.OS);
    logError('[ErrorBoundary] ========================================');

    // Update state with error info
    this.setState({
      error,
      errorInfo,
    });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    log('[ErrorBoundary] Resetting error boundary');
    this.setState({
      hasError: false,
      error: null,
      errorInfo: null,
    });
  };

  render() {
    if (this.state.hasError) {
      // Custom fallback UI
      if (this.props.fallback) {
        return this.props.fallback;
      }

      const isDark = Appearance.getColorScheme() === 'dark';
      const themedStyles = getStyles(isDark);

      // Default fallback UI
      return (
        <View style={themedStyles.container}>
          <Text style={themedStyles.title}>⚠️ App Crashed</Text>
          <Text style={themedStyles.message}>
            The app encountered an unexpected error and needs to restart.
          </Text>

          {this.state.error && (
            <View style={themedStyles.errorSummary}>
              <Text style={themedStyles.errorSummaryTitle}>Error:</Text>
              <Text style={themedStyles.errorSummaryText}>
                {this.state.error.message || this.state.error.toString()}
              </Text>
            </View>
          )}

          {this.state.error && (
            <ScrollView style={themedStyles.errorDetails}>
              <Text style={themedStyles.errorTitle}>🔍 Debug Info (Dev Only):</Text>

              <Text style={themedStyles.errorLabel}>Platform:</Text>
              <Text style={themedStyles.errorText}>{Platform.OS}</Text>

              <Text style={themedStyles.errorLabel}>Error Type:</Text>
              <Text style={themedStyles.errorText}>{this.state.error.name}</Text>

              <Text style={themedStyles.errorLabel}>Error Message:</Text>
              <Text style={themedStyles.errorText}>
                {this.state.error.message || this.state.error.toString()}
              </Text>

              {this.state.error.stack && (
                <>
                  <Text style={themedStyles.errorLabel}>Stack Trace:</Text>
                  <Text style={themedStyles.errorStack}>
                    {this.state.error.stack}
                  </Text>
                </>
              )}

              {this.state.errorInfo && (
                <>
                  <Text style={themedStyles.errorLabel}>Component Stack:</Text>
                  <Text style={themedStyles.errorStack}>
                    {this.state.errorInfo.componentStack}
                  </Text>
                </>
              )}
            </ScrollView>
          )}

          <TouchableOpacity style={themedStyles.button} onPress={this.handleReset}>
            <Text style={themedStyles.buttonText}>Try Again</Text>
          </TouchableOpacity>

          <Text style={themedStyles.hint}>
            If the error persists, please restart the app completely.
          </Text>
        </View>
      );
    }

    return this.props.children;
  }
}

const getStyles = (isDark: boolean) =>
  StyleSheet.create({
    container: {
      flex: 1,
      justifyContent: "center",
      alignItems: "center",
      padding: 24,
      backgroundColor: isDark ? colors.background : colors.backgroundLight,
    },
    title: {
      fontSize: 24,
      fontWeight: "bold",
      marginBottom: 16,
      color: colors.error,
    },
    message: {
      fontSize: 16,
      textAlign: "center",
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginBottom: 24,
    },
    errorSummary: {
      width: "100%",
      padding: 16,
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 8,
      marginBottom: 16,
      borderLeftWidth: 4,
      borderLeftColor: colors.error,
    },
    errorSummaryTitle: {
      fontSize: 14,
      fontWeight: "600",
      marginBottom: 8,
      color: colors.error,
    },
    errorSummaryText: {
      fontSize: 14,
      color: isDark ? colors.text : colors.textLight,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    },
    errorDetails: {
      maxHeight: 300,
      width: "100%",
      padding: 16,
      backgroundColor: isDark ? colors.cardBackground : colors.card,
      borderRadius: 8,
      marginBottom: 24,
    },
    errorTitle: {
      fontSize: 14,
      fontWeight: "600",
      marginBottom: 12,
      color: colors.warning,
    },
    errorLabel: {
      fontSize: 12,
      fontWeight: "600",
      marginTop: 12,
      marginBottom: 4,
      color: colors.primary,
    },
    errorText: {
      fontSize: 12,
      color: isDark ? colors.text : colors.textLight,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      marginBottom: 8,
    },
    errorStack: {
      fontSize: 10,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
      marginBottom: 8,
    },
    button: {
      backgroundColor: colors.primary,
      paddingHorizontal: 32,
      paddingVertical: 12,
      borderRadius: 8,
      marginTop: 16,
    },
    buttonText: {
      color: "#FFFFFF",
      fontSize: 16,
      fontWeight: "600",
    },
    hint: {
      fontSize: 12,
      color: isDark ? colors.textSecondary : colors.textSecondaryLight,
      marginTop: 16,
      textAlign: "center",
    },
  });
