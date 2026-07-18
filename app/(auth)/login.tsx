import { useState, useCallback } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { AuthCardLayout, authInputStyles } from "../../src/components/AuthCardLayout";
import { useAuthStore } from "../../src/store/authStore";
import { typography, useTheme } from "../../src/theme";

export default function LoginScreen() {
  const { colors: themeColors } = useTheme();
  const signIn = useAuthStore((state) => state.signIn);
  const signInGoogle = useAuthStore((state) => state.signInGoogle);
  const clearError = useAuthStore((state) => state.clearError);
  const loading = useAuthStore((state) => state.loading);
  const googleLoading = useAuthStore((state) => state.googleLoading);
  const error = useAuthStore((state) => state.error);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const canSubmit = email.trim().length > 0 && password.length >= 6 && !loading;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    await signIn(email.trim(), password);
  }, [canSubmit, email, password, signIn]);

  const handleGoogleSignIn = useCallback(async () => {
    await signInGoogle();
  }, [signInGoogle]);

  const handleEmailChange = useCallback((value: string) => {
    setEmail(value);
    clearError();
  }, [clearError]);

  const handlePasswordChange = useCallback((value: string) => {
    setPassword(value);
    clearError();
  }, [clearError]);

  return (
    <AuthCardLayout
      heading="Welcome back"
      subtext="Sign in to access your portfolio workspace."
      submitLabel="Sign in"
      submitDisabled={!canSubmit}
      submitLoading={loading}
      onSubmit={handleSubmit}
      onGoogleSignIn={handleGoogleSignIn}
      googleLoading={googleLoading}
      footerText="Don't have an account?"
      footerLinkLabel="Sign up"
      footerLinkHref="/(auth)/signup"
      error={error}
    >
      {/* Email Field */}
      <View style={authInputStyles.inputContainer}>
        <Text style={[authInputStyles.inputLabel, { color: themeColors.muted }]}>Email</Text>
        <TextInput
          value={email}
          onChangeText={handleEmailChange}
          keyboardType="email-address"
          autoCapitalize="none"
          autoComplete="email"
          placeholder="you@example.com"
          placeholderTextColor={themeColors.muted}
          style={[
            authInputStyles.input,
            { backgroundColor: themeColors.bg, borderColor: themeColors.border, color: themeColors.text },
          ]}
        />
      </View>

      {/* Password Field */}
      <View style={authInputStyles.inputContainer}>
        <View style={authInputStyles.labelRow}>
          <Text style={[authInputStyles.inputLabel, { color: themeColors.muted }]}>Password</Text>
          <Pressable>
            <Text style={[styles.forgotLink, { color: themeColors.accent }]}>Forgot?</Text>
          </Pressable>
        </View>
        <TextInput
          value={password}
          onChangeText={handlePasswordChange}
          secureTextEntry
          autoComplete="password"
          placeholder="••••••••"
          placeholderTextColor={themeColors.muted}
          style={[
            authInputStyles.input,
            { backgroundColor: themeColors.bg, borderColor: themeColors.border, color: themeColors.text },
          ]}
        />
      </View>
    </AuthCardLayout>
  );
}

const styles = StyleSheet.create({
  forgotLink: {
    fontSize: typography.caption,
    fontWeight: "500",
  },
});

