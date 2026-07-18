import { useRouter, type Href } from "expo-router";
import { type ReactNode } from "react";
import {
  ActivityIndicator,
  Pressable,
  ScrollView,
  StyleSheet,
  Text,
  View,
} from "react-native";
import Svg, { Path, Rect } from "react-native-svg";
import { radii, spacing, typography, useTheme } from "../theme";

// ---------------------------------------------------------------------------
// Types
// ---------------------------------------------------------------------------

interface AuthCardLayoutProps {
  /** Main heading text */
  heading: string;
  /** Muted subtext below heading */
  subtext: string;
  /** Form content (inputs, forgot link, etc.) */
  children: ReactNode;
  /** Primary submit button label */
  submitLabel: string;
  /** Whether submit is disabled */
  submitDisabled?: boolean;
  /** Whether submit is loading */
  submitLoading?: boolean;
  /** Submit button handler */
  onSubmit: () => void;
  /** Footer link text (e.g., "Don't have an account?") */
  footerText: string;
  /** Footer link label (e.g., "Sign up") */
  footerLinkLabel: string;
  /** Footer link route */
  footerLinkHref: Href;
  /** Error message to display */
  error?: string | null;
  /** Google sign-in handler */
  onGoogleSignIn?: () => void;
  /** Whether Google sign-in is loading */
  googleLoading?: boolean;
}

// ---------------------------------------------------------------------------
// Google Logo Component (official multicolor)
// ---------------------------------------------------------------------------

function GoogleLogo({ size = 20 }: { size?: number }) {
  return (
    <Svg width={size} height={size} viewBox="0 0 24 24">
      <Path
        d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z"
        fill="#4285F4"
      />
      <Path
        d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z"
        fill="#34A853"
      />
      <Path
        d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l2.85-2.22.81-.62z"
        fill="#FBBC05"
      />
      <Path
        d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z"
        fill="#EA4335"
      />
    </Svg>
  );
}

// ---------------------------------------------------------------------------
// App Wordmark Component
// ---------------------------------------------------------------------------

function AppWordmark() {
  const { colors: themeColors } = useTheme();
  
  return (
    <View style={styles.wordmark}>
      {/* Simple chart icon */}
      <Svg width={24} height={24} viewBox="0 0 24 24">
        <Rect x="3" y="12" width="4" height="9" rx="1" fill={themeColors.accent} />
        <Rect x="10" y="8" width="4" height="13" rx="1" fill={themeColors.accent} opacity={0.7} />
        <Rect x="17" y="3" width="4" height="18" rx="1" fill={themeColors.accent} opacity={0.5} />
      </Svg>
      <Text style={[styles.wordmarkText, { color: themeColors.text }]}>
        Portfolio Tracker
      </Text>
    </View>
  );
}

// ---------------------------------------------------------------------------
// Or Divider Component
// ---------------------------------------------------------------------------

function OrDivider() {
  const { colors: themeColors } = useTheme();
  
  return (
    <View style={styles.dividerContainer}>
      <View style={[styles.dividerLine, { backgroundColor: themeColors.border }]} />
      <Text style={[styles.dividerText, { color: themeColors.muted }]}>or</Text>
      <View style={[styles.dividerLine, { backgroundColor: themeColors.border }]} />
    </View>
  );
}

// ---------------------------------------------------------------------------
// Main Component
// ---------------------------------------------------------------------------

export function AuthCardLayout({
  heading,
  subtext,
  children,
  submitLabel,
  submitDisabled = false,
  submitLoading = false,
  onSubmit,
  footerText,
  footerLinkLabel,
  footerLinkHref,
  error,
  onGoogleSignIn,
  googleLoading = false,
}: AuthCardLayoutProps) {
  const { colors: themeColors } = useTheme();
  const router = useRouter();

  return (
    <ScrollView
      style={[styles.scrollView, { backgroundColor: themeColors.bg }]}
      contentContainerStyle={styles.scrollContent}
      keyboardShouldPersistTaps="handled"
    >
      <View style={styles.centerContainer}>
        <View style={[styles.card, { backgroundColor: themeColors.surface, borderColor: themeColors.border }]}>
          {/* Wordmark */}
          <AppWordmark />

          {/* Heading */}
          <Text style={[styles.heading, { color: themeColors.text }]}>{heading}</Text>
          <Text style={[styles.subtext, { color: themeColors.muted }]}>{subtext}</Text>

          {/* Google Sign-In Button */}
          <Pressable
            style={[styles.googleButton, googleLoading && styles.googleButtonDisabled]}
            onPress={onGoogleSignIn}
            disabled={googleLoading}
          >
            {googleLoading ? (
              <ActivityIndicator size="small" color="#1f1f1f" />
            ) : (
              <>
                <GoogleLogo size={20} />
                <Text style={styles.googleButtonText}>Continue with Google</Text>
              </>
            )}
          </Pressable>

          {/* Or Divider */}
          <OrDivider />

          {/* Form Fields */}
          {children}

          {/* Error Message */}
          {error ? (
            <Text style={[styles.errorText, { color: themeColors.negative }]}>{error}</Text>
          ) : null}

          {/* Submit Button */}
          <Pressable
            style={[
              styles.submitButton,
              { backgroundColor: themeColors.accent },
              (submitDisabled || submitLoading) && styles.submitButtonDisabled,
            ]}
            onPress={onSubmit}
            disabled={submitDisabled || submitLoading}
          >
            {submitLoading ? (
              <ActivityIndicator size="small" color={themeColors.bg} />
            ) : (
              <Text style={[styles.submitButtonText, { color: themeColors.bg }]}>
                {submitLabel}
              </Text>
            )}
          </Pressable>

          {/* Footer Link */}
          <View style={styles.footer}>
            <Text style={[styles.footerText, { color: themeColors.muted }]}>
              {footerText}{" "}
            </Text>
            <Pressable onPress={() => router.push(footerLinkHref)}>
              <Text style={[styles.footerLink, { color: themeColors.accent }]}>
                {footerLinkLabel}
              </Text>
            </Pressable>
          </View>
        </View>
      </View>
    </ScrollView>
  );
}

// For simplicity, we'll export the input styles and let screens use TextInput directly
export const authInputStyles = StyleSheet.create({
  inputContainer: {
    marginBottom: spacing.md,
  },
  labelRow: {
    flexDirection: "row",
    justifyContent: "space-between",
    alignItems: "center",
    marginBottom: spacing.xs,
  },
  inputLabel: {
    fontSize: typography.caption,
    fontWeight: "500",
  },
  input: {
    borderRadius: radii.sm,
    borderWidth: 1,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.md,
    fontSize: typography.body,
  },
});

// ---------------------------------------------------------------------------
// Styles
// ---------------------------------------------------------------------------

const styles = StyleSheet.create({
  scrollView: {
    flex: 1,
  },
  scrollContent: {
    flexGrow: 1,
    justifyContent: "center",
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.xxl,
  },
  centerContainer: {
    alignItems: "center",
  },
  card: {
    width: "100%",
    maxWidth: 420,
    borderRadius: radii.lg,
    borderWidth: 1,
    paddingVertical: 40,
    paddingHorizontal: 32,
  },
  wordmark: {
    flexDirection: "row",
    alignItems: "center",
    marginBottom: spacing.xxl,
  },
  wordmarkText: {
    marginLeft: spacing.sm,
    fontSize: typography.body,
    fontWeight: "600",
  },
  heading: {
    fontSize: 22,
    fontWeight: "700",
    marginBottom: spacing.xs,
  },
  subtext: {
    fontSize: typography.body,
    marginBottom: spacing.xl,
  },
  googleButton: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "#ffffff",
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  googleButtonDisabled: {
    opacity: 0.7,
  },
  googleButtonText: {
    color: "#1f1f1f",
    fontSize: typography.body,
    fontWeight: "500",
  },
  dividerContainer: {
    flexDirection: "row",
    alignItems: "center",
    marginVertical: spacing.xl,
  },
  dividerLine: {
    flex: 1,
    height: 1,
  },
  dividerText: {
    marginHorizontal: spacing.md,
    fontSize: typography.caption,
  },
  errorText: {
    fontSize: typography.caption,
    marginBottom: spacing.sm,
  },
  submitButton: {
    borderRadius: radii.sm,
    paddingVertical: spacing.md,
    alignItems: "center",
    marginTop: spacing.sm,
  },
  submitButtonDisabled: {
    opacity: 0.6,
  },
  submitButtonText: {
    fontSize: typography.body,
    fontWeight: "600",
  },
  footer: {
    flexDirection: "row",
    justifyContent: "center",
    marginTop: spacing.xl,
  },
  footerText: {
    fontSize: typography.caption,
  },
  footerLink: {
    fontSize: typography.caption,
    fontWeight: "500",
  },
});




