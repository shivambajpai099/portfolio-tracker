import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Platform, View } from "react-native";
import { useAuthStore } from "../../src/store/authStore";

export default function TabsLayout() {
  const initialized = useAuthStore((state) => state.initialized);
  const session = useAuthStore((state) => state.session);

  if (!initialized) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: "#0B0C10" }}>
        <ActivityIndicator color="#67E8F9" />
      </View>
    );
  }

  if (!session) {
    return <Redirect href={"/(auth)/login" as never} />;
  }

  return (
    <Tabs
      screenOptions={{
        headerShown: Platform.OS !== "web",
        headerStyle: { backgroundColor: "#0B0C10" },
        headerTitleStyle: { color: "#F2F4F8" },
        headerTintColor: "#F2F4F8",
        tabBarStyle: {
          backgroundColor: "#0B0C10",
          borderTopColor: "#1E2128",
        },
        tabBarActiveTintColor: "#67E8F9",
        tabBarInactiveTintColor: "#8B909A",
        tabBarLabelStyle: { fontSize: 11 },
      }}
    >
      <Tabs.Screen
        name="index"
        options={{
          title: "Overview",
          tabBarIcon: ({ color, size }) => <Ionicons name="home-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="holdings"
        options={{
          title: "Holdings",
          tabBarIcon: ({ color, size }) => <Ionicons name="pie-chart-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="accounts"
        options={{
          title: "Accounts",
          tabBarIcon: ({ color, size }) => <Ionicons name="wallet-outline" size={size} color={color} />,
        }}
      />
      <Tabs.Screen
        name="settings"
        options={{
          title: "Settings",
          tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
        }}
      />
    </Tabs>
  );
}
