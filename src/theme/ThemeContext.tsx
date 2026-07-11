import { createContext, useContext, useMemo, type PropsWithChildren } from "react";
import { useColorScheme } from "react-native";
import { usePortfolioStore } from "../store/portfolioStore";
import type { ThemeMode } from "../types/portfolio";
import { darkColors, lightColors, type ThemeColors } from "./colors";

interface ThemeContextValue {
  colors: ThemeColors;
  isDark: boolean;
  mode: ThemeMode;
}

const ThemeContext = createContext<ThemeContextValue>({
  colors: darkColors,
  isDark: true,
  mode: "dark",
});

export function ThemeProvider({ children }: PropsWithChildren) {
  const themeMode = usePortfolioStore((s) => s.settings.themeMode) ?? "dark";
  const systemColorScheme = useColorScheme();

  const value = useMemo<ThemeContextValue>(() => {
    let isDark: boolean;
    if (themeMode === "system") {
      isDark = systemColorScheme !== "light";
    } else {
      isDark = themeMode === "dark";
    }
    return {
      colors: isDark ? darkColors : lightColors,
      isDark,
      mode: themeMode,
    };
  }, [themeMode, systemColorScheme]);

  return <ThemeContext.Provider value={value}>{children}</ThemeContext.Provider>;
}

export function useTheme(): ThemeContextValue {
  return useContext(ThemeContext);
}

export function useThemeColors(): ThemeColors {
  return useContext(ThemeContext).colors;
}

