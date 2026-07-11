import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Platform, View } from "react-native";
import { useAuthStore } from "../../src/store/authStore";
import { useTheme } from "../../src/theme";

export default function TabsLayout() {
  const initialized = useAuthStore((state) => state.initialized);
  const session = useAuthStore((state) => state.session);
  const { colors } = useTheme();

  if (!initialized) {
    return (
      <View style={{ flex: 1, alignItems: "center", justifyContent: "center", backgroundColor: colors.bg }}>
        <ActivityIndicator color={colors.accent} />
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
        headerStyle: { backgroundColor: colors.bg },
        headerTitleStyle: { color: colors.text },
        headerTintColor: colors.text,
        tabBarStyle: {
          backgroundColor: colors.bg,
          borderTopColor: colors.border,
        },
        tabBarActiveTintColor: colors.accent,
        tabBarInactiveTintColor: colors.muted,
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
        name="insights"
        options={{
          title: "Insights",
          tabBarIcon: ({ color, size }) => <Ionicons name="bulb-outline" size={size} color={color} />,
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
      {/* Hide old screens from tab bar but keep for backward compatibility */}
      <Tabs.Screen
        name="xray"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="drift"
        options={{ href: null }}
      />
      <Tabs.Screen
        name="timeline"
        options={{ href: null }}
      />
    </Tabs>
  );
}
