import { Text, View } from "react-native";

interface StatCardProps {
  label: string;
  value: string;
}

export function StatCard({ label, value }: StatCardProps) {
  return (
    <View className="rounded-2xl bg-surface p-4">
      <Text className="text-sm text-muted">{label}</Text>
      <Text className="mt-2 text-2xl font-semibold text-text">{value}</Text>
    </View>
  );
}

