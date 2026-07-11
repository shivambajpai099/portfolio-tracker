import { useState } from "react";
import { Image, View, StyleSheet } from "react-native";
import { getTickerImageUrl } from "../services/tickerImageService";

interface TickerImageProps {
  /** Ticker symbol (e.g., "AAPL", "RELIANCE.NS") */
  symbol: string;
  /** Size of the image in pixels (default: 24) */
  size?: number;
  /** Fallback color for the dot when image is unavailable */
  fallbackColor: string;
}

/**
 * Displays a company logo for the given ticker symbol.
 * Falls back to a colored dot if:
 * - No image URL is available (e.g., Indian stocks)
 * - The image fails to load
 */
export function TickerImage({ symbol, size = 24, fallbackColor }: TickerImageProps) {
  const [hasError, setHasError] = useState(false);
  const imageUrl = getTickerImageUrl(symbol);

  // Show colored dot if no URL or image failed to load
  if (!imageUrl || hasError) {
    const dotSize = Math.max(8, size / 3);
    return (
      <View
        style={[
          styles.dotContainer,
          { width: size, height: size },
        ]}
      >
        <View
          style={[
            styles.dot,
            {
              width: dotSize,
              height: dotSize,
              borderRadius: dotSize / 2,
              backgroundColor: fallbackColor,
            },
          ]}
        />
      </View>
    );
  }

  return (
    <Image
      source={{ uri: imageUrl }}
      style={[
        styles.image,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
        },
      ]}
      onError={() => setHasError(true)}
      resizeMode="contain"
    />
  );
}

const styles = StyleSheet.create({
  dotContainer: {
    alignItems: "center",
    justifyContent: "center",
  },
  dot: {},
  image: {
    backgroundColor: "#1E2128", // Placeholder while loading
  },
});

