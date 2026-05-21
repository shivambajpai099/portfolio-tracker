import { useRouter } from "expo-router";
import { useState } from "react";
import { Pressable, StyleSheet, Text, TextInput, View } from "react-native";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import { useAuthStore } from "../../src/store/authStore";
import { colors, radii, spacing, typography } from "../../src/theme";

export default function SignupScreen() {
  const router = useRouter();
  const signUp = useAuthStore((state) => state.signUp);
  const clearError = useAuthStore((state) => state.clearError);
  const loading = useAuthStore((state) => state.loading);
  const error = useAuthStore((state) => state.error);

  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");

  const canSubmit = email.trim().length > 0 && password.length >= 6 && !loading;

  const submit = async () => {
    if (!canSubmit) return;
    await signUp(email.trim(), password);
  };

  return (
    <ScreenContainer>
      <View style={styles.wrap}>
        <Text style={styles.title}>Create Account</Text>
        <Text style={styles.subtitle}>Use email and password to create your account.</Text>

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
          placeholder="Password (min 6 characters)"
          placeholderTextColor={colors.muted}
          style={styles.inputCompact}
        />

        {error ? <Text style={styles.errorText}>{error}</Text> : null}

        <Pressable style={[styles.primaryBtn, !canSubmit && styles.disabledBtn]} onPress={submit}>
          <Text style={styles.primaryText}>{loading ? "Creating..." : "Sign up"}</Text>
        </Pressable>

        <Pressable style={styles.linkWrap} onPress={() => router.push("/(auth)/login" as never)}>
          <Text style={styles.linkText}>Already have an account? Login</Text>
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
    color: colors.text,
    fontSize: typography.heading,
    fontWeight: typography.weightSemibold,
  },
  subtitle: {
    marginTop: spacing.xs,
    marginBottom: spacing.xl,
    color: colors.muted,
    fontSize: typography.body,
  },
  input: {
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  inputCompact: {
    marginTop: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.surface,
    color: colors.text,
    paddingHorizontal: spacing.lg,
    paddingVertical: spacing.md,
  },
  errorText: {
    marginTop: spacing.sm,
    color: colors.negative,
    fontSize: typography.caption,
  },
  primaryBtn: {
    marginTop: spacing.lg,
    borderRadius: radii.lg,
    backgroundColor: colors.accent,
    alignItems: "center",
    paddingVertical: spacing.md,
  },
  disabledBtn: {
    opacity: 0.6,
  },
  primaryText: {
    color: colors.bg,
    fontWeight: typography.weightSemibold,
  },
  linkWrap: {
    marginTop: spacing.lg,
    alignItems: "center",
  },
  linkText: {
    color: colors.accent,
    fontSize: typography.caption,
  },
});

