import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, View } from "react-native";
import { PortfolioCloudSyncBootstrap } from "../src/features/portfolio/PortfolioCloudSyncBootstrap";
import { cleanupAuthStore, useAuthStore } from "../src/store/authStore";
import { ThemeProvider, useTheme } from "../src/theme";

function RootLayoutContent() {
  const { colors, isDark } = useTheme();

  return (
    <>
      <StatusBar style={isDark ? "light" : "dark"} backgroundColor={colors.bg} />
      <PortfolioCloudSyncBootstrap />
      {Platform.OS === "web" ? (
        <View style={{ flex: 1, backgroundColor: colors.bg }}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: colors.bg } }}>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
        </View>
      ) : (
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: colors.bg },
            headerTitleStyle: { color: colors.text },
            headerTintColor: colors.text,
            contentStyle: { backgroundColor: colors.bg },
          }}
        >
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      )}
    </>
  );
}

export default function RootLayout() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    void initialize();
    return () => {
      cleanupAuthStore();
    };
  }, [initialize]);

  return (
    <ThemeProvider>
      <RootLayoutContent />
    </ThemeProvider>
  );
}

