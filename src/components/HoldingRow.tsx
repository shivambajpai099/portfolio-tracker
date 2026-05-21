import { Text, View } from "react-native";

interface HoldingRowProps {
  symbol: string;
  subtitle: string;
  value: string;
}

export function HoldingRow({ symbol, subtitle, value }: HoldingRowProps) {
  return (
    <View className="flex-row items-center justify-between rounded-xl bg-surface p-4">
      <View>
        <Text className="text-base font-semibold text-text">{symbol}</Text>
        <Text className="text-sm text-muted">{subtitle}</Text>
      </View>
      <Text className="text-base font-semibold text-text">{value}</Text>
    </View>
  );
}

