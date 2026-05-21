import { useEffect, useMemo, useState } from "react";
import { ActivityIndicator, Modal, Pressable, ScrollView, Text, TextInput, View } from "react-native";
import { searchTickerSuggestions } from "../services/yahooFinanceService";
import type { TickerSuggestion } from "../types/marketData";
import type { Account, Currency } from "../types/portfolio";

interface AddHoldingInput {
  accountId: string;
  symbol: string;
  companyName: string;
  currency: Currency;
  quantity: number;
  averagePrice: number;
}

interface AddHoldingModalProps {
  visible: boolean;
  accounts: Account[];
  onClose: () => void;
  onCreate: (input: AddHoldingInput) => void;
}

type SelectedTicker = TickerSuggestion;

const parseNumber = (value: string): number => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : NaN;
};

export function AddHoldingModal({ visible, accounts, onClose, onCreate }: AddHoldingModalProps) {
  const [query, setQuery] = useState("");
  const [selected, setSelected] = useState<SelectedTicker | null>(null);
  const [accountId, setAccountId] = useState("");
  const [quantity, setQuantity] = useState("");
  const [averagePrice, setAveragePrice] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [errorText, setErrorText] = useState("");
  const [suggestions, setSuggestions] = useState<SelectedTicker[]>([]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    setAccountId((prev) => prev || accounts[0]?.id || "");
  }, [visible, accounts]);

  useEffect(() => {
    if (!visible) {
      return;
    }

    const trimmed = query.trim();
    if (trimmed.length < 2 || selected?.symbol === trimmed.toUpperCase()) {
      setSuggestions([]);
      setIsLoading(false);
      setErrorText("");
      return;
    }

    const controller = new AbortController();
    const timeoutId = setTimeout(() => {
      setIsLoading(true);
      searchTickerSuggestions(trimmed, controller.signal)
        .then((result) => {
          setSuggestions(result.data ?? []);
          setErrorText(result.ok ? "" : result.error.message);
        })
        .catch((error: unknown) => {
          if (error instanceof Error && error.name === "AbortError") {
            return;
          }
          setSuggestions([]);
          setErrorText("Could not load ticker suggestions.");
        })
        .finally(() => {
          setIsLoading(false);
        });
    }, 350);

    return () => {
      clearTimeout(timeoutId);
      controller.abort();
    };
  }, [query, selected, visible]);

  const canSubmit = useMemo(() => {
    const qty = parseNumber(quantity);
    const avg = parseNumber(averagePrice);
    return Boolean(selected && accountId && qty > 0 && avg > 0);
  }, [selected, accountId, quantity, averagePrice]);

  const resetState = () => {
    setQuery("");
    setSelected(null);
    setQuantity("");
    setAveragePrice("");
    setSuggestions([]);
    setIsLoading(false);
    setErrorText("");
  };

  const handleClose = () => {
    resetState();
    onClose();
  };

  const handleSelectTicker = (item: SelectedTicker) => {
    setSelected(item);
    setQuery(item.symbol);
    setSuggestions([]);
  };

  const handleCreate = () => {
    if (!selected) {
      return;
    }

    const qty = parseNumber(quantity);
    const avg = parseNumber(averagePrice);
    if (!accountId || qty <= 0 || avg <= 0) {
      return;
    }

    onCreate({
      accountId,
      symbol: selected.symbol,
      companyName: selected.companyName,
      currency: selected.currency,
      quantity: qty,
      averagePrice: avg,
    });

    handleClose();
  };

  return (
    <Modal visible={visible} transparent animationType="fade" onRequestClose={handleClose}>
      <View className="flex-1 items-center justify-center bg-black/70 px-5">
        <View className="max-h-[90%] w-full rounded-2xl bg-surface p-5">
          <Text className="text-xl font-semibold text-text">Add Holding</Text>

          <Text className="mt-4 text-sm text-muted">Search Ticker</Text>
          <TextInput
            value={query}
            onChangeText={(value) => {
              setQuery(value);
              setSelected(null);
            }}
            placeholder="e.g. AAPL, RELIANCE.NS"
            placeholderTextColor="#8B909A"
            autoCapitalize="characters"
            className="mt-2 rounded-lg border border-[#252932] bg-bg px-3 py-3 text-text"
          />

          {isLoading ? (
            <View className="mt-3 flex-row items-center gap-2">
              <ActivityIndicator color="#67E8F9" />
              <Text className="text-sm text-muted">Searching...</Text>
            </View>
          ) : null}

          {errorText ? <Text className="mt-3 text-sm text-negative">{errorText}</Text> : null}

          {suggestions.length > 0 ? (
            <View className="mt-3 max-h-40 rounded-lg border border-[#252932] bg-bg">
              <ScrollView keyboardShouldPersistTaps="handled">
                {suggestions.map((item) => (
                  <Pressable
                    key={`${item.symbol}-${item.exchange}`}
                    className="border-b border-[#1E2128] px-3 py-2"
                    onPress={() => handleSelectTicker(item)}
                  >
                    <Text className="text-sm font-semibold text-text">{item.symbol}</Text>
                    <Text className="text-xs text-muted">{item.companyName}</Text>
                    <Text className="text-xs text-muted">
                      {item.exchange} - {item.currency}
                    </Text>
                  </Pressable>
                ))}
              </ScrollView>
            </View>
          ) : null}

          {selected ? (
            <View className="mt-4 rounded-lg bg-bg p-3">
              <Text className="text-sm text-text">{selected.symbol}</Text>
              <Text className="mt-1 text-xs text-muted">{selected.companyName}</Text>
              <Text className="mt-1 text-xs text-muted">
                {selected.exchange} - {selected.currency}
              </Text>
            </View>
          ) : null}

          <Text className="mt-4 text-sm text-muted">Account</Text>
          <View className="mt-2 flex-row flex-wrap gap-2">
            {accounts.map((account) => (
              <Pressable
                key={account.id}
                className={`rounded-lg px-3 py-2 ${accountId === account.id ? "bg-accent" : "bg-bg"}`}
                onPress={() => setAccountId(account.id)}
              >
                <Text className={`${accountId === account.id ? "text-bg" : "text-text"}`}>{account.name}</Text>
              </Pressable>
            ))}
          </View>

          <TextInput
            value={quantity}
            onChangeText={setQuantity}
            placeholder="Quantity"
            placeholderTextColor="#8B909A"
            keyboardType="decimal-pad"
            className="mt-3 rounded-lg border border-[#252932] bg-bg px-3 py-3 text-text"
          />
          <TextInput
            value={averagePrice}
            onChangeText={setAveragePrice}
            placeholder="Average buy price"
            placeholderTextColor="#8B909A"
            keyboardType="decimal-pad"
            className="mt-3 rounded-lg border border-[#252932] bg-bg px-3 py-3 text-text"
          />

          <View className="mt-6 flex-row justify-end gap-2">
            <Pressable className="rounded-lg border border-muted px-4 py-2" onPress={handleClose}>
              <Text className="text-muted">Cancel</Text>
            </Pressable>
            <Pressable
              className={`rounded-lg px-4 py-2 ${canSubmit ? "bg-accent" : "bg-[#39414F]"}`}
              onPress={handleCreate}
            >
              <Text className={`font-semibold ${canSubmit ? "text-bg" : "text-muted"}`}>Save</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

