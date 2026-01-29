/**
 * Tests for format-utils
 */

import { describe, it, expect } from "bun:test";
import {
  formatBytes,
  formatSpeed,
  formatDuration,
  formatDurationCompact,
  formatUptime,
  formatTimeOnly,
  formatDateISO,
  formatDateLocale,
  formatNumber,
  formatPercentage,
} from "../src/format-utils.ts";

describe("formatBytes", () => {
  it("should format zero bytes", () => {
    expect(formatBytes(0)).toBe("0 B");
  });

  it("should format bytes without decimal", () => {
    expect(formatBytes(500)).toBe("500 B");
    expect(formatBytes(1023)).toBe("1023 B");
  });

  it("should format kilobytes with 1 decimal", () => {
    expect(formatBytes(1024)).toBe("1.0 KB");
    expect(formatBytes(1536)).toBe("1.5 KB");
    expect(formatBytes(2048)).toBe("2.0 KB");
  });

  it("should format megabytes with 1 decimal", () => {
    expect(formatBytes(1024 * 1024)).toBe("1.0 MB");
    expect(formatBytes(1.5 * 1024 * 1024)).toBe("1.5 MB");
    expect(formatBytes(10.7 * 1024 * 1024)).toBe("10.7 MB");
  });

  it("should format gigabytes with 1 decimal", () => {
    expect(formatBytes(1024 * 1024 * 1024)).toBe("1.0 GB");
    expect(formatBytes(2.5 * 1024 * 1024 * 1024)).toBe("2.5 GB");
  });

  it("should format terabytes with 1 decimal", () => {
    expect(formatBytes(1024 * 1024 * 1024 * 1024)).toBe("1.0 TB");
    expect(formatBytes(1.25 * 1024 * 1024 * 1024 * 1024)).toBe("1.3 TB");
  });

  it("should handle large numbers", () => {
    expect(formatBytes(999 * 1024 * 1024 * 1024)).toBe("999.0 GB");
  });
});

describe("formatSpeed", () => {
  it("should format zero speed", () => {
    expect(formatSpeed(0)).toBe("0 B/s");
  });

  it("should format bytes per second", () => {
    expect(formatSpeed(512)).toBe("512 B/s");
  });

  it("should format kilobytes per second", () => {
    expect(formatSpeed(1024)).toBe("1.0 KB/s");
    expect(formatSpeed(1536)).toBe("1.5 KB/s");
  });

  it("should format megabytes per second", () => {
    expect(formatSpeed(1024 * 1024)).toBe("1.0 MB/s");
    expect(formatSpeed(5.5 * 1024 * 1024)).toBe("5.5 MB/s");
  });
});

describe("formatDuration", () => {
  it("should format seconds only", () => {
    expect(formatDuration(0)).toBe("0s");
    expect(formatDuration(45)).toBe("45s");
    expect(formatDuration(59)).toBe("59s");
  });

  it("should format minutes and seconds", () => {
    expect(formatDuration(60)).toBe("1m 0s");
    expect(formatDuration(65)).toBe("1m 5s");
    expect(formatDuration(125)).toBe("2m 5s");
    expect(formatDuration(3599)).toBe("59m 59s");
  });

  it("should format hours, minutes and seconds", () => {
    expect(formatDuration(3600)).toBe("1h 0m 0s");
    expect(formatDuration(3665)).toBe("1h 1m 5s");
    expect(formatDuration(7384)).toBe("2h 3m 4s");
    expect(formatDuration(86400)).toBe("24h 0m 0s");
  });
});

describe("formatDurationCompact", () => {
  it("should format seconds only as 0m Xs", () => {
    expect(formatDurationCompact(0)).toBe("0m 0s");
    expect(formatDurationCompact(45)).toBe("0m 45s");
  });

  it("should format minutes and seconds", () => {
    expect(formatDurationCompact(60)).toBe("1m 0s");
    expect(formatDurationCompact(65)).toBe("1m 5s");
    expect(formatDurationCompact(125)).toBe("2m 5s");
  });

  it("should format hours as total minutes", () => {
    expect(formatDurationCompact(3600)).toBe("60m 0s");
    expect(formatDurationCompact(3665)).toBe("61m 5s");
    expect(formatDurationCompact(7384)).toBe("123m 4s");
  });
});

describe("formatUptime", () => {
  it("should format uptime from start time", () => {
    const now = Date.now();
    const startTime = new Date(now - 65000); // 65 seconds ago
    const result = formatUptime(startTime);
    expect(result).toBe("1m 5s");
  });

  it("should format uptime for hours", () => {
    const now = Date.now();
    const startTime = new Date(now - 3665000); // 3665 seconds ago
    const result = formatUptime(startTime);
    expect(result).toBe("1h 1m 5s");
  });

  it("should format zero uptime", () => {
    const now = Date.now();
    const startTime = new Date(now);
    const result = formatUptime(startTime);
    expect(result).toBe("0s");
  });
});

describe("formatTimeOnly", () => {
  it("should format time only from date", () => {
    const date = new Date("2024-01-15T14:30:45.123Z");
    expect(formatTimeOnly(date)).toBe("14:30:45");
  });

  it("should format midnight", () => {
    const date = new Date("2024-01-15T00:00:00.000Z");
    expect(formatTimeOnly(date)).toBe("00:00:00");
  });

  it("should format before noon", () => {
    const date = new Date("2024-01-15T09:05:03.000Z");
    expect(formatTimeOnly(date)).toBe("09:05:03");
  });
});

describe("formatDateISO", () => {
  it("should format date to ISO string", () => {
    const date = new Date("2024-01-15T14:30:45.123Z");
    expect(formatDateISO(date)).toBe("2024-01-15T14:30:45.123Z");
  });

  it("should handle different dates", () => {
    const date = new Date("2023-12-31T23:59:59.999Z");
    expect(formatDateISO(date)).toBe("2023-12-31T23:59:59.999Z");
  });
});

describe("formatDateLocale", () => {
  it("should format date with default locale", () => {
    const date = new Date("2024-01-15T14:30:45.000Z");
    const result = formatDateLocale(date);
    // Result varies by environment, just check it's a string
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });

  it("should format date with custom locale", () => {
    const date = new Date("2024-01-15T14:30:45.000Z");
    const result = formatDateLocale(date, "en-GB");
    expect(typeof result).toBe("string");
    expect(result.length).toBeGreaterThan(0);
  });
});

describe("formatNumber", () => {
  it("should format integers with thousand separators", () => {
    expect(formatNumber(1000)).toBe("1,000");
    expect(formatNumber(1234567)).toBe("1,234,567");
    expect(formatNumber(999)).toBe("999");
  });

  it("should format decimals with thousand separators", () => {
    expect(formatNumber(1234.56)).toBe("1,234.56");
    expect(formatNumber(1234567.89)).toBe("1,234,567.89");
  });

  it("should format zero", () => {
    expect(formatNumber(0)).toBe("0");
  });

  it("should format negative numbers", () => {
    expect(formatNumber(-1234)).toBe("-1,234");
    expect(formatNumber(-1234567.89)).toBe("-1,234,567.89");
  });
});

describe("formatPercentage", () => {
  it("should format decimal percentages (0-1)", () => {
    expect(formatPercentage(0.755)).toBe("75.5%");
    expect(formatPercentage(0.5)).toBe("50.0%");
    expect(formatPercentage(1.0)).toBe("100.0%");
    expect(formatPercentage(0.0)).toBe("0.0%");
  });

  it("should format non-decimal percentages (0-100)", () => {
    expect(formatPercentage(75.5, 1, false)).toBe("75.5%");
    expect(formatPercentage(50, 1, false)).toBe("50.0%");
    expect(formatPercentage(100, 1, false)).toBe("100.0%");
  });

  it("should respect decimal places", () => {
    expect(formatPercentage(0.12345, 0)).toBe("12%");
    expect(formatPercentage(0.12345, 1)).toBe("12.3%");
    expect(formatPercentage(0.12345, 2)).toBe("12.35%");
    expect(formatPercentage(0.12345, 3)).toBe("12.345%");
  });

  it("should handle edge cases", () => {
    expect(formatPercentage(0.999, 1)).toBe("99.9%");
    expect(formatPercentage(0.001, 1)).toBe("0.1%");
  });
});
