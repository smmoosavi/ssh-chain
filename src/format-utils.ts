/**
 * Utility functions for formatting various data types (dates, durations, byte sizes, speeds, etc.)
 */

/**
 * Format bytes to human-readable string with appropriate units
 * @param bytes - Number of bytes to format
 * @returns Formatted string like "1.5 MB", "512 KB", etc.
 * @example
 * formatBytes(1024) // "1 KB"
 * formatBytes(1536) // "1.5 KB"
 * formatBytes(0) // "0 B"
 */
export function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Format bytes per second to human-readable speed string
 * @param bytesPerSecond - Number of bytes per second
 * @returns Formatted string like "1.5 MB/s", "512 KB/s", etc.
 * @example
 * formatSpeed(1024) // "1 KB/s"
 * formatSpeed(1536000) // "1.5 MB/s"
 */
export function formatSpeed(bytesPerSecond: number): string {
  return `${formatBytes(bytesPerSecond)}/s`;
}

/**
 * Format duration in seconds to human-readable string
 * @param seconds - Number of seconds
 * @returns Formatted string like "1h 30m 45s", "5m 20s", etc.
 * @example
 * formatDuration(65) // "1m 5s"
 * formatDuration(3665) // "1h 1m 5s"
 * formatDuration(45) // "45s"
 */
export function formatDuration(seconds: number): string {
  const hours = Math.floor(seconds / 3600);
  const minutes = Math.floor((seconds % 3600) / 60);
  const secs = seconds % 60;
  
  if (hours > 0) {
    return `${hours}h ${minutes}m ${secs}s`;
  }
  if (minutes > 0) {
    return `${minutes}m ${secs}s`;
  }
  return `${secs}s`;
}

/**
 * Format duration in seconds to compact format (minutes and seconds only)
 * @param seconds - Number of seconds
 * @returns Formatted string like "90m 5s", "5m 20s", etc.
 * @example
 * formatDurationCompact(65) // "1m 5s"
 * formatDurationCompact(3665) // "61m 5s"
 * formatDurationCompact(45) // "0m 45s"
 */
export function formatDurationCompact(seconds: number): string {
  const minutes = Math.floor(seconds / 60);
  const secs = seconds % 60;
  return `${minutes}m ${secs}s`;
}

/**
 * Format uptime from start time to now
 * @param startTime - Start date
 * @returns Formatted uptime string
 * @example
 * const start = new Date(Date.now() - 3665000);
 * formatUptime(start) // "1h 1m 5s"
 */
export function formatUptime(startTime: Date): string {
  const seconds = Math.floor((Date.now() - startTime.getTime()) / 1000);
  return formatDuration(seconds);
}

/**
 * Format timestamp to time-only string (HH:MM:SS)
 * @param date - Date to format
 * @returns Formatted time string like "14:30:45"
 * @example
 * formatTimeOnly(new Date("2024-01-15T14:30:45")) // "14:30:45"
 */
export function formatTimeOnly(date: Date): string {
  return date.toISOString().slice(11, 19);
}

/**
 * Format date to ISO string
 * @param date - Date to format
 * @returns ISO formatted date string
 * @example
 * formatDateISO(new Date("2024-01-15T14:30:45")) // "2024-01-15T14:30:45.000Z"
 */
export function formatDateISO(date: Date): string {
  return date.toISOString();
}

/**
 * Format date to localized date and time string
 * @param date - Date to format
 * @param locale - Locale string (default: "en-US")
 * @returns Localized date and time string
 * @example
 * formatDateLocale(new Date("2024-01-15T14:30:45")) // "1/15/2024, 2:30:45 PM"
 */
export function formatDateLocale(date: Date, locale: string = "en-US"): string {
  return date.toLocaleString(locale);
}

/**
 * Format number to localized string with thousands separators
 * @param value - Number to format
 * @param locale - Locale string (default: "en-US")
 * @returns Formatted number string
 * @example
 * formatNumber(1234567) // "1,234,567"
 * formatNumber(1234567.89) // "1,234,567.89"
 */
export function formatNumber(value: number, locale: string = "en-US"): string {
  return value.toLocaleString(locale);
}

/**
 * Format percentage with specified decimal places
 * @param value - Value to format (0-1 or 0-100 depending on input)
 * @param decimals - Number of decimal places (default: 1)
 * @param isDecimal - Whether value is 0-1 (true) or 0-100 (false) (default: true)
 * @returns Formatted percentage string
 * @example
 * formatPercentage(0.755) // "75.5%"
 * formatPercentage(75.5, 1, false) // "75.5%"
 * formatPercentage(0.12345, 2) // "12.35%"
 */
export function formatPercentage(value: number, decimals: number = 1, isDecimal: boolean = true): string {
  const percentage = isDecimal ? value * 100 : value;
  return `${percentage.toFixed(decimals)}%`;
}
