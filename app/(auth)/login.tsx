import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { useAuthStore } from "../../src/store/authStore";
import { colors as defaultColors, radii, spacing, typography, useTheme } from "../../src/theme";

export default function LoginScreen() {
  const { colors } = useTheme();
  const router = useRouter();
  const signIn = useAuthStore((state) => state.signIn);
  const clearError = useAuthStore((state) => state.clearError);
  const loading = useAuthStore((state) => state.loading);
  const error = useAuthStore((state) => state.error);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const canSubmit = email.trim().length > 0 && password.length >= 6 && !loading;

  const submit = async () => {
    if (!canSubmit) return;
    await signIn(email.trim(), password);
  };

  return (
    <ScreenContainer>
      <View style={styles.wrap}>
        <Text style={styles.title}>Login</Text>
        <Text style={styles.subtitle}>Sign in to access your portfolio workspace.</Text>

        <TextInput
          value={email}
          onChangeText={(value) => {
            setEmail(value);
            clearError();
          }}
          keyboardType="email-address"
          autoCapitalize="none"
          placeholder="Email"
          placeholderTextColor={colors.muted}
          style={styles.input}
        />
        <TextInput
          value={password}
          onChangeText={(value) => {
            setPassword(value);
            clearError();
          }}
          secureTextEntry
          placeholder="Password"
          placeholderTextColor={colors.muted}
          style={styles.inputCompact}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable style={[styles.primaryBtn, !canSubmit && styles.disabledBtn]} onPress={submit}>
          <Text style={styles.primaryText}>{loading ? "Signing in..." : "Login"}</Text>
        </Pressable>

        <Pressable style={styles.linkWrap} onPress={() => router.push("/(auth)/signup" as never)}>
          <Text style={styles.linkText}>No account? Create one</Text>
        </Pressable>
      </View>
    </ScreenContainer>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingTop: spacing.xxxl,
  },
  title: {
    color: defaultColors.text,
    fontSize: typography.heading,
    fontWeight: typography.weightSemibold,
  },
  subtitle: {
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
    color: defaultColors.muted,
    fontSize: typography.body,
  },
  input: {
    borderRadius: radii.lg,
    backgroundColor: defaultColors.surface,
    color: defaultColors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  inputCompact: {
    marginTop: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: defaultColors.surface,
    color: defaultColors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  errorText: {
    marginTop: spacing.sm,
    color: defaultColors.negative,
    fontSize: typography.caption,
  },
  primaryBtn: {
    marginTop: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: defaultColors.accent,
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  primaryText: {
    color: defaultColors.bg,
    fontWeight: typography.weightSemibold,
  },
  linkWrap: {
    marginTop: spacing.lg,
    alignItems: "center",
  },
  linkText: {
    color: defaultColors.accent,
    fontSize: typography.caption,
  },
});

