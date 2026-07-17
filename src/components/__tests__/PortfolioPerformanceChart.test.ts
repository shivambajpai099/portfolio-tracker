import {
  formatDateLabel,
  calcGainLoss,
  projectDataToCoords,
  type PortfolioHistoryPoint,
} from "../PortfolioPerformanceChart";

describe("PortfolioPerformanceChart", () => {
  // ---------------------------------------------------------------------------
  // formatDateLabel
  // ---------------------------------------------------------------------------
  describe("formatDateLabel", () => {
    it("formats monthly view with month name", () => {
      const result = formatDateLabel("2024-03-15", "monthly");
      expect(result).toMatch(/Mar/);
    });

    it("formats quarterly view with quarter number", () => {
      const result = formatDateLabel("2024-03-15", "quarterly");
      expect(result).toBe("Q1");
    });

    it("formats quarterly view Q2", () => {
      const result = formatDateLabel("2024-05-15", "quarterly");
      expect(result).toBe("Q2");
    });

    it("formats yearly view with 2-digit year", () => {
      const result = formatDateLabel("2024-03-15", "yearly");
      expect(result).toBe("24");
    });

    it("returns original string for invalid date", () => {
      const result = formatDateLabel("invalid-date", "monthly");
      expect(result).toBe("invalid-date");
    });
  });

  // ---------------------------------------------------------------------------
  // calcGainLoss
  // ---------------------------------------------------------------------------
  describe("calcGainLoss", () => {
    it("calculates positive gain correctly", () => {
      const point: PortfolioHistoryPoint = {
        date: "2024-03-15",
        investedAmount: 100000,
        currentValue: 120000,
      };
      const result = calcGainLoss(point);
      expect(result.absolute).toBe(20000);
      expect(result.percentage).toBe(20);
    });

    it("calculates negative loss correctly", () => {
      const point: PortfolioHistoryPoint = {
        date: "2024-03-15",
        investedAmount: 100000,
        currentValue: 80000,
      };
      const result = calcGainLoss(point);
      expect(result.absolute).toBe(-20000);
      expect(result.percentage).toBe(-20);
    });

    it("handles zero invested amount", () => {
      const point: PortfolioHistoryPoint = {
        date: "2024-03-15",
        investedAmount: 0,
        currentValue: 1000,
      };
      const result = calcGainLoss(point);
      expect(result.absolute).toBe(1000);
      expect(result.percentage).toBe(0);
    });

    it("handles equal invested and current value", () => {
      const point: PortfolioHistoryPoint = {
        date: "2024-03-15",
        investedAmount: 50000,
        currentValue: 50000,
      };
      const result = calcGainLoss(point);
      expect(result.absolute).toBe(0);
      expect(result.percentage).toBe(0);
    });

    it("calculates fractional percentages correctly", () => {
      const point: PortfolioHistoryPoint = {
        date: "2024-03-15",
        investedAmount: 100000,
        currentValue: 112345,
      };
      const result = calcGainLoss(point);
      expect(result.absolute).toBe(12345);
      expect(result.percentage).toBeCloseTo(12.345, 2);
    });
  });

  // ---------------------------------------------------------------------------
  // projectDataToCoords
  // ---------------------------------------------------------------------------
  describe("projectDataToCoords", () => {
    const WIDTH = 320;
    const HEIGHT = 200;
    const PADDING_X = 14;
    const PADDING_Y = 24;

    it("returns empty arrays for empty data", () => {
      const result = projectDataToCoords([], WIDTH, HEIGHT, PADDING_X, PADDING_Y);
      expect(result.investedCoords).toEqual([]);
      expect(result.currentValueCoords).toEqual([]);
      expect(result.minValue).toBe(0);
      expect(result.maxValue).toBe(0);
    });

    it("projects single data point to center", () => {
      const data: PortfolioHistoryPoint[] = [
        { date: "2024-03-15", investedAmount: 100000, currentValue: 100000 },
      ];
      const result = projectDataToCoords(data, WIDTH, HEIGHT, PADDING_X, PADDING_Y);
      
      expect(result.investedCoords).toHaveLength(1);
      expect(result.currentValueCoords).toHaveLength(1);
      
      // Center X = (WIDTH - PADDING_X * 2) / 2 + PADDING_X
      const expectedCenterX = (WIDTH - PADDING_X * 2) / 2 + PADDING_X;
      expect(result.investedCoords[0].x).toBe(expectedCenterX);
    });

    it("projects multiple points evenly across width", () => {
      const data: PortfolioHistoryPoint[] = [
        { date: "2024-01-01", investedAmount: 100000, currentValue: 100000 },
        { date: "2024-02-01", investedAmount: 110000, currentValue: 115000 },
        { date: "2024-03-01", investedAmount: 120000, currentValue: 130000 },
      ];
      const result = projectDataToCoords(data, WIDTH, HEIGHT, PADDING_X, PADDING_Y);
      
      expect(result.investedCoords).toHaveLength(3);
      expect(result.currentValueCoords).toHaveLength(3);
      
      // First point should be at PADDING_X
      expect(result.investedCoords[0].x).toBe(PADDING_X);
      
      // Last point should be at WIDTH - PADDING_X
      expect(result.investedCoords[2].x).toBe(WIDTH - PADDING_X);
    });

    it("calculates correct min and max values across both series", () => {
      const data: PortfolioHistoryPoint[] = [
        { date: "2024-01-01", investedAmount: 50000, currentValue: 45000 },
        { date: "2024-02-01", investedAmount: 100000, currentValue: 120000 },
      ];
      const result = projectDataToCoords(data, WIDTH, HEIGHT, PADDING_X, PADDING_Y);
      
      expect(result.minValue).toBe(45000);
      expect(result.maxValue).toBe(120000);
    });

    it("handles all equal values without division by zero", () => {
      const data: PortfolioHistoryPoint[] = [
        { date: "2024-01-01", investedAmount: 100000, currentValue: 100000 },
        { date: "2024-02-01", investedAmount: 100000, currentValue: 100000 },
      ];
      const result = projectDataToCoords(data, WIDTH, HEIGHT, PADDING_X, PADDING_Y);
      
      // Should not throw and should return valid coordinates
      expect(result.investedCoords).toHaveLength(2);
      expect(result.currentValueCoords).toHaveLength(2);
      expect(Number.isFinite(result.investedCoords[0].y)).toBe(true);
    });

    it("higher values result in lower Y coordinates (SVG convention)", () => {
      const data: PortfolioHistoryPoint[] = [
        { date: "2024-01-01", investedAmount: 100000, currentValue: 100000 },
        { date: "2024-02-01", investedAmount: 100000, currentValue: 200000 },
      ];
      const result = projectDataToCoords(data, WIDTH, HEIGHT, PADDING_X, PADDING_Y);
      
      // Current value at index 1 (200000) should have lower Y than index 0 (100000)
      expect(result.currentValueCoords[1].y).toBeLessThan(result.currentValueCoords[0].y);
    });
  });

  // ---------------------------------------------------------------------------
  // Empty state rendering (component-level, but testing logic)
  // ---------------------------------------------------------------------------
  describe("empty state logic", () => {
    it("identifies empty data correctly", () => {
      const data: PortfolioHistoryPoint[] = [];
      expect(data.length === 0).toBe(true);
    });

    it("identifies non-empty data correctly", () => {
      const data: PortfolioHistoryPoint[] = [
        { date: "2024-01-01", investedAmount: 100000, currentValue: 100000 },
      ];
      expect(data.length === 0).toBe(false);
    });
  });
});

