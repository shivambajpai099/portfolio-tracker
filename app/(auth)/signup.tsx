import { useState, useCallback } from "react";
import { Text, TextInput, View } from "react-native";
import { AuthCardLayout, authInputStyles } from "../../src/components/AuthCardLayout";
import { useAuthStore } from "../../src/store/authStore";
import { useTheme } from "../../src/theme";

export default function SignupScreen() {
  const { colors: themeColors } = useTheme();
  const signUp = useAuthStore((state) => state.signUp);
  const signInGoogle = useAuthStore((state) => state.signInGoogle);
  const clearError = useAuthStore((state) => state.clearError);
  const loading = useAuthStore((state) => state.loading);
  const googleLoading = useAuthStore((state) => state.googleLoading);
  const error = useAuthStore((state) => state.error);

  const [name, setName] = useState("");
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  // Name is optional for the signup flow (Supabase doesn't require it by default)
  const canSubmit = email.trim().length > 0 && password.length >= 6 && !loading;

  const handleSubmit = useCallback(async () => {
    if (!canSubmit) return;
    // Note: Name can be stored in user metadata if needed in the future
    await signUp(email.trim(), password);
  }, [canSubmit, email, password, signUp]);

  const handleGoogleSignIn = useCallback(async () => {
    await signInGoogle();
  }, [signInGoogle]);

  const handleNameChange = useCallback((value: string) => {
    setName(value);
    clearError();
  }, [clearError]);

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
      heading="Create your account"
      subtext="Start tracking your portfolio in seconds."
      submitLabel="Create account"
      submitDisabled={!canSubmit}
      submitLoading={loading}
      onSubmit={handleSubmit}
      onGoogleSignIn={handleGoogleSignIn}
      googleLoading={googleLoading}
      footerText="Already have an account?"
      footerLinkLabel="Sign in"
      footerLinkHref="/(auth)/login"
      error={error}
    >
      {/* Name Field */}
      <View style={authInputStyles.inputContainer}>
        <Text style={[authInputStyles.inputLabel, { color: themeColors.muted }]}>Name</Text>
        <TextInput
          value={name}
          onChangeText={handleNameChange}
          autoCapitalize="words"
          autoComplete="name"
          placeholder="Your name"
          placeholderTextColor={themeColors.muted}
          style={[
            authInputStyles.input,
            { backgroundColor: themeColors.bg, borderColor: themeColors.border, color: themeColors.text },
          ]}
        />
      </View>

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
        <Text style={[authInputStyles.inputLabel, { color: themeColors.muted }]}>Password</Text>
        <TextInput
          value={password}
          onChangeText={handlePasswordChange}
          secureTextEntry
          autoComplete="new-password"
          placeholder="Min. 6 characters"
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

