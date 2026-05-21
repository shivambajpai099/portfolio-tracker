import { useMemo, useState } from "react";
import { Pressable, ScrollView, Text, View } from "react-native";
import { DonutChart } from "../../src/components/DonutChart";
import { ScreenContainer } from "../../src/components/ScreenContainer";
import {
  calcConcentrationRisk,
  calcGeographicSplit,
  calcPortfolioTotals,
  calcSymbolAllocations,
} from "../../src/features/portfolio/calculations";
import { usePortfolioStore } from "../../src/store/portfolioStore";
import { colors } from "../../src/theme/colors";
import type { Currency } from "../../src/types/portfolio";
import { formatMoney } from "../../src/utils/format";

type GeoFilter = "ALL" | "INDIA" | "US";

const DONUT_PALETTE = [
  "#67E8F9", "#6366F1", "#F59E0B", "#22C55E", "#EC4899",
  "#3B82F6", "#A78BFA", "#F97316", "#14B8A6", "#E879F9",
];

const GEO_INDIA_COLOR = "#F59E0B";
const GEO_US_COLOR = "#6366F1";

export default function DashboardScreen() {
  const holdings     = usePortfolioStore((s) => s.holdings);
  const cashHoldings = usePortfolioStore((s) => s.cashHoldings);
  const fxRates      = usePortfolioStore((s) => s.fxRates);
  const settings     = usePortfolioStore((s) => s.settings);

  const [geoFilter, setGeoFilter] = useState<GeoFilter>("ALL");

  const rc: Currency = settings.reportingCurrency;

  const filteredHoldings = useMemo(() => {
    if (geoFilter === "ALL") return holdings;
    return holdings.filter((h) => {
      const isIndia = h.currency === "INR" || h.symbol.endsWith(".NS") || h.symbol.endsWith(".BO");
      return geoFilter === "INDIA" ? isIndia : !isIndia;
    });
  }, [holdings, geoFilter]);

  const totals       = useMemo(() => calcPortfolioTotals(filteredHoldings, cashHoldings, fxRates, rc), [filteredHoldings, cashHoldings, fxRates, rc]);
  const allocations  = useMemo(() => calcSymbolAllocations(filteredHoldings, fxRates, rc), [filteredHoldings, fxRates, rc]);
  const geoSplit     = useMemo(() => calcGeographicSplit(holdings, fxRates, rc), [holdings, fxRates, rc]);
  const concentration = useMemo(() => calcConcentrationRisk(allocations), [allocations]);

  const donutSlices = useMemo(
    () => allocations.map((a, i) => ({ value: a.allocationPct, color: DONUT_PALETTE[i % DONUT_PALETTE.length] })),
    [allocations]
  );

  const gainPositive = totals.gainLoss >= 0;

  const concentrationColor =
    concentration.level === "HIGH"
      ? colors.negative
      : concentration.level === "MODERATE"
      ? GEO_INDIA_COLOR
      : colors.positive;

  return (
    <ScreenContainer>
      <ScrollView showsVerticalScrollIndicator={false} contentContainerStyle={{ paddingBottom: 48 }}>

        {/* ── Title + filters ─────────────────────────────────────── */}
        <View className="mb-8 flex-row items-center justify-between">
          <Text className="text-2xl font-semibold text-text">Portfolio</Text>
          <View className="flex-row gap-1.5">
            {(["ALL", "INDIA", "US"] as GeoFilter[]).map((f) => (
              <Pressable
                key={f}
                onPress={() => setGeoFilter(f)}
                className={`rounded-full px-3 py-1 ${geoFilter === f ? "bg-accent" : "bg-surface"}`}
              >
                <Text className={`text-xs font-medium ${geoFilter === f ? "text-bg" : "text-muted"}`}>{f}</Text>
              </Pressable>
            ))}
          </View>
        </View>

        {/* ── Hero: total + donut side-by-side ────────────────────── */}
        <View className="mb-10 flex-row items-center justify-between">
          <View className="flex-1 pr-6">
            <Text className="text-xs text-muted">Total value</Text>
            <Text className="mt-1 text-[32px] font-semibold leading-tight text-text">
              {formatMoney(totals.currentValue, rc)}
            </Text>
            <View className="mt-4 gap-1.5">
              <View className="flex-row items-baseline gap-3">
                <Text className="w-16 text-xs text-muted">Invested</Text>
                <Text className="text-sm text-text">{formatMoney(totals.investedValue, rc)}</Text>
              </View>
              <View className="flex-row items-baseline gap-3">
                <Text className="w-16 text-xs text-muted">Gain/Loss</Text>
                <Text className={`text-sm font-medium ${gainPositive ? "text-positive" : "text-negative"}`}>
                  {gainPositive ? "+" : ""}{formatMoney(totals.gainLoss, rc)}
                  {"  "}
                  <Text className="font-normal opacity-70">
                    {gainPositive ? "+" : ""}{totals.gainLossPct.toFixed(2)}%
                  </Text>
                </Text>
              </View>
            </View>
          </View>

          <View style={{ position: "relative" }}>
            <DonutChart slices={donutSlices} size={108} strokeWidth={14} />
            <View
              style={{ position: "absolute", top: 0, left: 0, right: 0, bottom: 0 }}
              className="items-center justify-center"
            >
              <Text className="text-[10px] text-muted">pos</Text>
              <Text className="text-lg font-semibold text-text">{concentration.symbolCount}</Text>
            </View>
          </View>
        </View>

        {/* ── Geographic split ────────────────────────────────────── */}
        <View className="mb-10">
          <Text className="mb-4 text-[10px] font-medium uppercase tracking-widest text-muted">Geographic Split</Text>
          <View className="mb-2.5 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: GEO_INDIA_COLOR }} />
              <Text className="text-sm text-text">India</Text>
            </View>
            <View className="flex-row items-baseline gap-2">
              <Text className="text-sm font-medium text-text">{geoSplit.indiaValuePct.toFixed(1)}%</Text>
              <Text className="text-xs text-muted">{formatMoney(geoSplit.indiaCurrentValue, rc)}</Text>
            </View>
          </View>
          <View className="mb-3 flex-row items-center justify-between">
            <View className="flex-row items-center gap-2">
              <View style={{ width: 6, height: 6, borderRadius: 3, backgroundColor: GEO_US_COLOR }} />
              <Text className="text-sm text-text">United States</Text>
            </View>
            <View className="flex-row items-baseline gap-2">
              <Text className="text-sm font-medium text-text">{geoSplit.usValuePct.toFixed(1)}%</Text>
              <Text className="text-xs text-muted">{formatMoney(geoSplit.usCurrentValue, rc)}</Text>
            </View>
          </View>
          <View className="h-1 w-full overflow-hidden rounded-full bg-surface">
            <View style={{ width: `${geoSplit.indiaValuePct}%`, backgroundColor: GEO_INDIA_COLOR, height: "100%" }} />
          </View>
        </View>

        {/* ── Concentration warning (conditional) ─────────────────── */}
        {concentration.level !== "LOW" ? (
          <View className="mb-10 flex-row items-start gap-3">
            <View style={{ width: 2, alignSelf: "stretch", borderRadius: 1, marginTop: 2, backgroundColor: concentrationColor }} />
            <View className="flex-1">
              <Text className="text-sm font-medium" style={{ color: concentrationColor }}>
                {concentration.level === "HIGH" ? "High" : "Moderate"} concentration
              </Text>
              <Text className="mt-0.5 text-xs text-muted">
                Largest position {concentration.topHoldingPct.toFixed(1)}% · Top 5 positions {concentration.top5Pct.toFixed(1)}%
              </Text>
            </View>
          </View>
        ) : null}

        {/* ── Allocation list ─────────────────────────────────────── */}
        <Text className="mb-5 text-[10px] font-medium uppercase tracking-widest text-muted">Allocations</Text>
        <View>
          {allocations.map((item, i) => {
            const barColor = DONUT_PALETTE[i % DONUT_PALETTE.length];
            const pctGain = item.gainLossPct;
            return (
              <View key={item.symbol} className="mb-6">
                <View className="mb-2 flex-row items-baseline justify-between">
                  <View className="flex-row items-baseline gap-2">
                    <Text className="text-base font-semibold text-text">{item.symbol}</Text>
                    <Text className="text-xs text-muted">{item.companyName}</Text>
                  </View>
                  <Text className="text-base font-semibold text-text">{item.allocationPct.toFixed(1)}%</Text>
                </View>

                <View className="mb-2 h-1.5 w-full overflow-hidden rounded-full bg-surface">
                  <View style={{ width: `${item.allocationPct}%`, backgroundColor: barColor, height: "100%" }} />
                </View>

                <View className="flex-row justify-between">
                  <Text className="text-xs text-muted">{formatMoney(item.currentValue, rc)}</Text>
                  <Text className={`text-xs font-medium ${pctGain >= 0 ? "text-positive" : "text-negative"}`}>
                    {pctGain >= 0 ? "+" : ""}{pctGain.toFixed(2)}%
                  </Text>
                </View>
              </View>
            );
          })}

          {allocations.length === 0 ? (
            <Text className="text-sm text-muted">Add holdings to see your allocation.</Text>
          ) : null}
        </View>

      </ScrollView>
    </ScreenContainer>
  );
}
