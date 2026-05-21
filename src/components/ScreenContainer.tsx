import { SafeAreaView } from "react-native-safe-area-context";
import { Platform, View } from "react-native";
import type { PropsWithChildren } from "react";

export function ScreenContainer({ children }: PropsWithChildren) {
  const inner = (
    <SafeAreaView className="flex-1 bg-bg">
      <View className="flex-1 px-5 pt-6">{children}</View>
    </SafeAreaView>
  );

  if (Platform.OS === "web") {
    return (
      <View className="flex-1 items-center bg-bg">
        <View style={{ width: "100%", maxWidth: 680 }} className="flex-1">
          {inner}
        </View>
      </View>
    );
  }

  return inner;
}

