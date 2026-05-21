import { Stack } from "expo-router";
import { StatusBar } from "expo-status-bar";
import { Platform, View } from "react-native";

export default function RootLayout() {
  return (
    <>
      <StatusBar style="light" backgroundColor="#0B0C10" />
      {Platform.OS === "web" ? (
        <View style={{ flex: 1, backgroundColor: "#0B0C10" }}>
          <Stack screenOptions={{ headerShown: false, contentStyle: { backgroundColor: "#0B0C10" } }}>
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
          <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
        </Stack>
      )}
    </>
  );
}
