import { useState } from "react";
import { Image, StyleSheet, Text, View } from "react-native";
import { getTickerImageUrl } from "../services/tickerImageService";

interface HoldingAvatarProps {
  /** Ticker symbol (e.g., "AAPL", "RELIANCE.NS") */
  symbol: string;
  /** Per-stock brand/fallback color */
  fallbackColor: string;
  /** Avatar size in px (default: 40) */
  size?: number;
}

/**
 * Strips exchange suffixes so the fallback tile shows a clean ticker
 * (e.g. "RELIANCE.NS" -> "RELIANCE").
 */
const cleanTicker = (symbol: string): string =>
  symbol
    .toUpperCase()
    .replace(/\.(NS|BO|NASDAQ|NYSE|OQ|N)$/i, "")
    .trim();

/**
 * Font size steps down for longer symbols so the full ticker fits on one line
 * inside the fallback tile.
 */
const fallbackFontSize = (text: string): number => {
  if (text.length <= 3) return 12;
  if (text.length === 4) return 10.5;
  return 10;
};

/**
 * Mobile holdings avatar: 40px rounded-square tile.
 * - Tries the official company logo first (same source as before).
 * - Falls back to a colored rounded-xl tile showing the FULL ticker symbol
 *   (not initials, which collide — e.g. AMZN vs AMD).
 */
export function HoldingAvatar({ symbol, fallbackColor, size = 40 }: HoldingAvatarProps) {
  const [hasError, setHasError] = useState(false);
  const imageUrl = getTickerImageUrl(symbol);
  const radius = size * 0.28; // rounded-xl-ish for a 40px tile

  if (!imageUrl || hasError) {
    const label = cleanTicker(symbol) || symbol.toUpperCase();
    return (
      <View
        style={[
          styles.tile,
          { width: size, height: size, borderRadius: radius, backgroundColor: `${fallbackColor}33` },
        ]}
      >
        <Text
          style={[styles.tileText, { color: fallbackColor, fontSize: fallbackFontSize(label) }]}
          numberOfLines={1}
        >
          {label}
        </Text>
      </View>
    );
  }

  return (
    <Image
      source={{ uri: imageUrl }}
      style={[styles.image, { width: size, height: size, borderRadius: radius }]}
      onError={() => setHasError(true)}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  tile: {
    alignItems: "center",
    justifyContent: "center",
  },
  tileText: {
    fontWeight: "700",
    letterSpacing: 0.2,
  },
  image: {
    backgroundColor: "#1E2128",
  },
});

