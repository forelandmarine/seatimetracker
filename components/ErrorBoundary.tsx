
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
import { View, Text, TouchableOpacity, StyleSheet, ScrollView, Platform } from "react-native";

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
    console.error('[ErrorBoundary] Error caught:', error);
    return {
      hasError: true,
      error,
      errorInfo: null,
    };
  }

  componentDidCatch(error: Error, errorInfo: React.ErrorInfo) {
    // Log error to console with full details
    console.error('[ErrorBoundary] ========================================');
    console.error('[ErrorBoundary] Error caught by boundary:');
    console.error('[ErrorBoundary] Error:', error);
    console.error('[ErrorBoundary] Error message:', error.message);
    console.error('[ErrorBoundary] Error stack:', error.stack);
    console.error('[ErrorBoundary] Component stack:', errorInfo.componentStack);
    console.error('[ErrorBoundary] Platform:', Platform.OS);
    console.error('[ErrorBoundary] ========================================');

    // Update state with error info
    this.setState({
      error,
      errorInfo,
    });

    // Call custom error handler if provided
    this.props.onError?.(error, errorInfo);
  }

  handleReset = () => {
    console.log('[ErrorBoundary] Resetting error boundary');
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

      // Default fallback UI
      return (
        <View style={styles.container}>
          <Text style={styles.title}>⚠️ App Crashed</Text>
          <Text style={styles.message}>
            The app encountered an unexpected error and needs to restart.
          </Text>

          {this.state.error && (
            <View style={styles.errorSummary}>
              <Text style={styles.errorSummaryTitle}>Error:</Text>
              <Text style={styles.errorSummaryText}>
                {this.state.error.message || this.state.error.toString()}
              </Text>
            </View>
          )}

          {__DEV__ && this.state.error && (
            <ScrollView style={styles.errorDetails}>
              <Text style={styles.errorTitle}>🔍 Debug Info (Dev Only):</Text>
              
              <Text style={styles.errorLabel}>Platform:</Text>
              <Text style={styles.errorText}>{Platform.OS}</Text>
              
              <Text style={styles.errorLabel}>Error Type:</Text>
              <Text style={styles.errorText}>{this.state.error.name}</Text>
              
              <Text style={styles.errorLabel}>Error Message:</Text>
              <Text style={styles.errorText}>
                {this.state.error.message || this.state.error.toString()}
              </Text>
              
              {this.state.error.stack && (
                <>
                  <Text style={styles.errorLabel}>Stack Trace:</Text>
                  <Text style={styles.errorStack}>
                    {this.state.error.stack}
                  </Text>
                </>
              )}
              
              {this.state.errorInfo && (
                <>
                  <Text style={styles.errorLabel}>Component Stack:</Text>
                  <Text style={styles.errorStack}>
                    {this.state.errorInfo.componentStack}
                  </Text>
                </>
              )}
            </ScrollView>
          )}

          <TouchableOpacity style={styles.button} onPress={this.handleReset}>
            <Text style={styles.buttonText}>Try Again</Text>
          </TouchableOpacity>

          <Text style={styles.hint}>
            If the error persists, please restart the app completely.
          </Text>
        </View>
      );
    }

    return this.props.children;
  }
}

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: "center",
    alignItems: "center",
    padding: 24,
    backgroundColor: "#000",
  },
  title: {
    fontSize: 24,
    fontWeight: "bold",
    marginBottom: 16,
    color: "#FF3B30",
  },
  message: {
    fontSize: 16,
    textAlign: "center",
    color: "#999",
    marginBottom: 24,
  },
  errorSummary: {
    width: "100%",
    padding: 16,
    backgroundColor: "#1C1C1E",
    borderRadius: 8,
    marginBottom: 16,
    borderLeftWidth: 4,
    borderLeftColor: "#FF3B30",
  },
  errorSummaryTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 8,
    color: "#FF3B30",
  },
  errorSummaryText: {
    fontSize: 14,
    color: "#FFF",
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
  },
  errorDetails: {
    maxHeight: 300,
    width: "100%",
    padding: 16,
    backgroundColor: "#1C1C1E",
    borderRadius: 8,
    marginBottom: 24,
  },
  errorTitle: {
    fontSize: 14,
    fontWeight: "600",
    marginBottom: 12,
    color: "#FF9500",
  },
  errorLabel: {
    fontSize: 12,
    fontWeight: "600",
    marginTop: 12,
    marginBottom: 4,
    color: "#0A84FF",
  },
  errorText: {
    fontSize: 12,
    color: "#FFF",
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 8,
  },
  errorStack: {
    fontSize: 10,
    color: "#999",
    fontFamily: Platform.OS === 'ios' ? 'Menlo' : 'monospace',
    marginBottom: 8,
  },
  button: {
    backgroundColor: "#0A84FF",
    paddingHorizontal: 32,
    paddingVertical: 12,
    borderRadius: 8,
    marginTop: 16,
  },
  buttonText: {
    color: "#fff",
    fontSize: 16,
    fontWeight: "600",
  },
  hint: {
    fontSize: 12,
    color: "#666",
    marginTop: 16,
    textAlign: "center",
  },
});
