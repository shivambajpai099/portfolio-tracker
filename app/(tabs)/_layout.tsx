import { Redirect, Tabs } from "expo-router";
import { Ionicons } from "@expo/vector-icons";
import { ActivityIndicator, Platform, View } from "react-native";
import { OnboardingTourProvider } from "../../src/components/OnboardingTourProvider";
import { useAuthStore } from "../../src/store/authStore";
import { usePortfolioStore } from "../../src/store/portfolioStore";
import { useTheme } from "../../src/theme";

export default function TabsLayout() {
  const initialized = useAuthStore((state) => state.initialized);
  const session = useAuthStore((state) => state.session);
  const { colors } = useTheme();

  // Tour state from portfolio settings
  const accounts = usePortfolioStore((state) => state.accounts);
  const settings = usePortfolioStore((state) => state.settings);
  const updateSettings = usePortfolioStore((state) => state.updateSettings);
  const hydrated = usePortfolioStore((state) => state.hydrated);

  const tourSeen = settings.spotlightTourSeen ?? false;
  const shouldAutoStart = hydrated && accounts.length === 0 && !tourSeen;

  const handleTourComplete = () => {
    updateSettings({ spotlightTourSeen: true });
  };

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
    <OnboardingTourProvider
      tourSeen={tourSeen}
      onTourComplete={handleTourComplete}
      shouldAutoStart={shouldAutoStart}
    >
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
        {/* Portfolio = Overview + Holdings merged */}
        <Tabs.Screen
          name="index"
          options={{
            title: "Portfolio",
            tabBarIcon: ({ color, size }) => <Ionicons name="pie-chart-outline" size={size} color={color} />,
          }}
        />
        {/* Insights = Insights + Analytics merged */}
        <Tabs.Screen
          name="insights"
          options={{
            title: "Insights",
            tabBarIcon: ({ color, size }) => <Ionicons name="bulb-outline" size={size} color={color} />,
          }}
        />
        {/* Settings = Settings + Accounts merged */}
        <Tabs.Screen
          name="settings"
          options={{
            title: "Settings",
            tabBarIcon: ({ color, size }) => <Ionicons name="settings-outline" size={size} color={color} />,
          }}
        />
        {/* Hidden screens — content merged into the three tabs above; routes kept for
            backward compatibility and internal deep-links. */}
        <Tabs.Screen name="holdings" options={{ href: null }} />
        <Tabs.Screen name="accounts" options={{ href: null }} />
        <Tabs.Screen name="transactionInsights" options={{ href: null }} />
        <Tabs.Screen name="xray" options={{ href: null }} />
        <Tabs.Screen name="drift" options={{ href: null }} />
        <Tabs.Screen name="timeline" options={{ href: null }} />
      </Tabs>
    </OnboardingTourProvider>
  );
}
