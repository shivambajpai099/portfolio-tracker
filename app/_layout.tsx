import { useEffect } from "react";
import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, View } from "react-native";
import { PortfolioCloudSyncBootstrap } from "../src/features/portfolio/PortfolioCloudSyncBootstrap";
import { cleanupAuthStore, useAuthStore } from "../src/store/authStore";

export default function RootLayout() {
  const initialize = useAuthStore((state) => state.initialize);

  useEffect(() => {
    void initialize();
    return () => {
      cleanupAuthStore();
    };
  }, [initialize]);

  return (
    <>
      <StatusBar style="light" backgroundColor="#0B0C10" />
      <PortfolioCloudSyncBootstrap />
      {Platform.OS === "web" ? (
        <View style={{ flex: 1, backgroundColor: "#0B0C10" }}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0B0C10" } }}>
            <Stack.Screen name="(auth)" options={{ headerShown: false }} />
            <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
          </Stack>
        </View>
      ) : (
        <Stack
          screenOptions={{
            headerStyle: { backgroundColor: "#0B0C10" },
            headerTitleStyle: { color: "#F2F4F8" },
            headerTintColor: "#F2F4F8",
            contentStyle: { backgroundColor: "#0B0C10" },
          }}
        >
          <Stack.Screen name="(auth)" options={{ headerShown: false }} />
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      )}
    </>
  );
}
