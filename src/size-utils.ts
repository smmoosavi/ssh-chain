/**
 * Utilities for parsing size strings with unit suffixes
 */

/**
 * Parses a size string with optional unit suffix (K, M, G)
 * Supports both uppercase and lowercase suffixes
 *
 * @param value - Size value as string or number
 * @returns Size in bytes
 *
 * @example
 * parseSize('100K')  // 102400
 * parseSize('10M')   // 10485760
 * parseSize('1G')    // 1073741824
 * parseSize(1024)    // 1024
 * parseSize('1024')  // 1024
 */
export function parseSize(value: string | number): number {
  // If already a number, return as-is
  if (typeof value === 'number') {
    if (!Number.isFinite(value) || value < 0) {
      throw new Error('Size must be a positive finite number');
    }
    return Math.floor(value);
  }

  // Parse string value
  const trimmed = value.trim();
  if (trimmed === '') {
    throw new Error('Size value cannot be empty');
  }

  // Match number with optional unit suffix
  const match = trimmed.match(/^(\d+(?:\.\d+)?)\s*([KMGT])?$/i);
  if (!match) {
    throw new Error(`Invalid size format: ${value}`);
  }

  const [, numStr, unit] = match;
  if (!numStr) {
    throw new Error(`Invalid size format: ${value}`);
  }

  const num = parseFloat(numStr);

  if (!Number.isFinite(num) || num < 0) {
    throw new Error(`Invalid size value: ${value}`);
  }

  // Calculate multiplier based on unit
  const multipliers: Record<string, number> = {
    K: 1024,
    M: 1024 * 1024,
    G: 1024 * 1024 * 1024,
    T: 1024 * 1024 * 1024 * 1024,
  };

  const multiplier = unit ? (multipliers[unit.toUpperCase()] ?? 1) : 1;
  const result = num * multiplier;

  // Ensure result is finite and positive
  if (!Number.isFinite(result)) {
    throw new Error(`Size value too large: ${value}`);
  }

  return Math.floor(result);
}
