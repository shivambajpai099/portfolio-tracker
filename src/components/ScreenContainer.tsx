import type { PropsWithChildren } from "react";
import { Platform, StyleSheet, View } from "react-native";
import { SafeAreaView } from "react-native-safe-area-context";
import { colors, spacing } from "../theme";

export function ScreenContainer({ children }: PropsWithChildren) {
  const inner = (
    <SafeAreaView style={styles.safeArea}>
      <View style={styles.content}>{children}</View>
    </SafeAreaView>
  );

  if (Platform.OS === "web") {
    return (
      <View style={styles.webOuter}>
        <View style={styles.webInner}>{inner}</View>
      </View>
    );
  }

  return inner;
}

const styles = StyleSheet.create({
  safeArea: {
    flex: 1,
    backgroundColor: colors.bg,
  },
  content: {
    flex: 1,
    paddingHorizontal: spacing.xl,
    paddingTop: spacing.xxl,
  },
  webOuter: {
    flex: 1,
    alignItems: "center",
    backgroundColor: colors.bg,
  },
  webInner: {
    flex: 1,
    width: "100%",
    maxWidth: 680,
  },
});
