export interface ThemeColors {
  bg: string;
  surface: string;
  text: string;
  muted: string;
  accent: string;
  positive: string;
  negative: string;
  warning: string;
  border: string;
}

export const darkColors: ThemeColors = {
  bg: "#0B0C10",
  surface: "#14161A",
  text: "#F2F4F8",
  muted: "#8B909A",
  accent: "#67E8F9",
  positive: "#22C55E",
  negative: "#EF4444",
  warning: "#F59E0B",
  border: "#2D3139",
};

export const lightColors: ThemeColors = {
  bg: "#F8F9FB",
  surface: "#FFFFFF",
  text: "#1A1D24",
  muted: "#6B7280",
  accent: "#0891B2",
  positive: "#16A34A",
  negative: "#DC2626",
  warning: "#D97706",
  border: "#E5E7EB",
};

// Default export for backward compatibility (dark theme)
export const colors = darkColors;

