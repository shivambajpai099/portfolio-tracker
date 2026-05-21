import type { Currency } from "../types/portfolio";

export const formatMoney = (value: number, currency: Currency): string => {
  const locale = currency === "INR" ? "en-IN" : "en-US";

  return new Intl.NumberFormat(locale, {
    style: "currency",
    currency,
    maximumFractionDigits: 2,
  }).format(value);
};

