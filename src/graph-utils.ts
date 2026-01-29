/**
 * Graph utilities for visualizing numeric data as ASCII/ANSI charts
 * Converts arrays of numbers to single-line colored bar graphs
 */

/**
 * Block characters for graph rendering
 * Index 0 = empty (space), Index 8 = full block
 */
export const BLOCK_CHARS = [
  ' ',
  '▁',
  '▂',
  '▃',
  '▄',
  '▅',
  '▆',
  '▇',
  '█',
] as const;

/**
 * Available colors for graph rendering
 */
export type Color =
  | 'transparent'
  | 'darkRed'
  | 'orange'
  | 'yellow'
  | 'green'
  | 'blue'
  | 'white';

/**
 * Default color gradient from low to high values
 */
export const DEFAULT_COLORS: Color[] = [
  'transparent',
  'darkRed',
  'orange',
  'yellow',
  'green',
  'blue',
  'white',
];

/**
 * ANSI color codes for foreground
 */
export const ANSI_FG: Record<Color, string> = {
  transparent: '\x1b[39m',
  darkRed: '\x1b[31m',
  orange: '\x1b[38;5;208m',
  yellow: '\x1b[33m',
  green: '\x1b[32m',
  blue: '\x1b[34m',
  white: '\x1b[37m',
};

/**
 * ANSI color codes for background
 */
export const ANSI_BG: Record<Color, string> = {
  transparent: '\x1b[49m',
  darkRed: '\x1b[41m',
  orange: '\x1b[48;5;208m',
  yellow: '\x1b[43m',
  green: '\x1b[42m',
  blue: '\x1b[44m',
  white: '\x1b[47m',
};

/**
 * ANSI reset code
 */
export const ANSI_RESET = '\x1b[0m';

/**
 * Intermediate representation of a single graph bar
 */
export interface GraphBar {
  color: Color;
  background: Color;
  /** Height from 0 (empty) to 8 (full) */
  height: number;
}

/**
 * Options for graph rendering
 */
export interface GraphOptions {
  /** Color gradient from low to high values */
  colors?: Color[];
}

/**
 * Convert a value to a GraphBar representation
 *
 * @param value - The value to convert
 * @param maxValue - Maximum value for the scale
 * @param options - Optional graph options
 * @returns GraphBar with color, background, and height
 */
export function valueToGraphBar(
  value: number,
  maxValue: number,
  options?: GraphOptions,
): GraphBar {
  const colors = options?.colors ?? DEFAULT_COLORS;
  const numColors = colors.length;
  const numBands = numColors - 1;

  // Handle edge cases
  if (value <= 0 || maxValue <= 0) {
    return {
      color: colors[0]!,
      background: colors[0]!,
      height: 0,
    };
  }

  if (value >= maxValue) {
    return {
      color: colors[numColors - 1]!,
      background: colors[numColors - 1]!,
      height: 8,
    };
  }

  // Calculate band width (value range per color transition)
  const bandWidth = maxValue / numBands;

  // Determine which band we're in
  const bandIndex = Math.min(Math.floor(value / bandWidth), numBands - 1);

  // Calculate progress within the band (0 to 1)
  const progressInBand = (value - bandIndex * bandWidth) / bandWidth;

  // Convert progress to height (0-8)
  const height = Math.round(progressInBand * 8);

  return {
    background: colors[bandIndex]!,
    color: colors[bandIndex + 1]!,
    height,
  };
}

/**
 * Convert a GraphBar to an ANSI-colored string
 *
 * @param bar - The GraphBar to render
 * @returns ANSI-colored string representation
 */
export function graphBarToAnsi(bar: GraphBar): string {
  const { color, background, height } = bar;

  // Full block of foreground color (height 8)
  if (height === 8) {
    return `${ANSI_FG[color]}${ANSI_BG[color]}█${ANSI_RESET}`;
  }

  // Use block char directly from array (height 0-7)
  const blockChar = BLOCK_CHARS[height];
  return `${ANSI_FG[color]}${ANSI_BG[background]}${blockChar}${ANSI_RESET}`;
}

/**
 * Convert an array of values to an array of GraphBar
 *
 * @param values - Array of numeric values
 * @param maxValue - Maximum value for the scale
 * @param options - Optional graph options
 * @returns Array of GraphBar representations
 */
export function valuesToGraphBars(
  values: number[],
  maxValue: number,
  options?: GraphOptions,
): GraphBar[] {
  return values.map((value) => valueToGraphBar(value, maxValue, options));
}

/**
 * Convert an array of values to an ANSI-colored graph string
 *
 * @param values - Array of numeric values
 * @param maxValue - Maximum value for the scale
 * @param options - Optional graph options
 * @returns Single line ANSI-colored string representing the graph
 */
export function valuesToGraph(
  values: number[],
  maxValue: number,
  options?: GraphOptions,
): string {
  const bars = valuesToGraphBars(values, maxValue, options);
  return bars.map(graphBarToAnsi).join('');
}
