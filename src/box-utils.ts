/**
 * Box drawing utilities for formatted console output
 * Provides helpers for creating bordered boxes with various text alignments
 */

import { logger } from './logger.ts';

/**
 * Box style characters
 */
export interface BoxStyle {
  topLeft: string;
  topRight: string;
  bottomLeft: string;
  bottomRight: string;
  horizontal: string;
  vertical: string;
}

/**
 * Default double-line box style
 */
export const DOUBLE_BOX: BoxStyle = {
  topLeft: '╔',
  topRight: '╗',
  bottomLeft: '╚',
  bottomRight: '╝',
  horizontal: '═',
  vertical: '║',
};

/**
 * Single-line box style
 */
export const SINGLE_BOX: BoxStyle = {
  topLeft: '┌',
  topRight: '┐',
  bottomLeft: '└',
  bottomRight: '┘',
  horizontal: '─',
  vertical: '│',
};

/**
 * Options for creating a box
 */
export interface BoxOptions {
  /** Inner width of the box (excluding borders) */
  width: number;
  /** Box style to use */
  style?: BoxStyle;
  /** Padding on each side of content */
  padding?: number;
}

/**
 * Text alignment options
 */
export type TextAlign = 'left' | 'center' | 'right';

/**
 * Box builder for creating formatted console boxes
 */
export class BoxBuilder {
  private readonly width: number;
  private readonly style: BoxStyle;
  private readonly padding: number;
  private readonly lines: string[] = [];

  constructor(options: BoxOptions) {
    this.width = options.width;
    this.style = options.style ?? DOUBLE_BOX;
    this.padding = options.padding ?? 1;
  }

  /**
   * Get the content width (inner width minus padding on both sides)
   */
  private get contentWidth(): number {
    return this.width - this.padding * 2;
  }

  /**
   * Pad content to fill the inner width
   */
  private padContent(content: string): string {
    const paddingStr = ' '.repeat(this.padding);
    return `${paddingStr}${content}${paddingStr}`;
  }

  /**
   * Add the top border of the box
   */
  top(): this {
    const line = this.style.horizontal.repeat(this.width);
    this.lines.push(`${this.style.topLeft}${line}${this.style.topRight}`);
    return this;
  }

  /**
   * Add a top border with a centered title
   */
  topWithTitle(title: string): this {
    const titleWithPadding = ` ${title} `;
    const remainingWidth = this.width - titleWithPadding.length;
    const leftWidth = Math.floor(remainingWidth / 2);
    const rightWidth = remainingWidth - leftWidth;

    const left = this.style.horizontal.repeat(leftWidth);
    const right = this.style.horizontal.repeat(rightWidth);

    this.lines.push(
      `${this.style.topLeft}${left}${titleWithPadding}${right}${this.style.topRight}`,
    );
    return this;
  }

  /**
   * Add the bottom border of the box
   */
  bottom(): this {
    const line = this.style.horizontal.repeat(this.width);
    this.lines.push(`${this.style.bottomLeft}${line}${this.style.bottomRight}`);
    return this;
  }

  /**
   * Add an empty line inside the box
   */
  empty(): this {
    const content = ' '.repeat(this.width);
    this.lines.push(`${this.style.vertical}${content}${this.style.vertical}`);
    return this;
  }

  /**
   * Add text with specified alignment
   */
  text(content: string, align: TextAlign = 'left'): this {
    const aligned = alignText(content, this.contentWidth, align);
    const padded = this.padContent(aligned);
    this.lines.push(`${this.style.vertical}${padded}${this.style.vertical}`);
    return this;
  }

  /**
   * Add left-aligned text
   */
  left(content: string): this {
    return this.text(content, 'left');
  }

  /**
   * Add centered text
   */
  center(content: string): this {
    return this.text(content, 'center');
  }

  /**
   * Add right-aligned text
   */
  right(content: string): this {
    return this.text(content, 'right');
  }

  /**
   * Add a key-value pair with the key left-aligned and value right-aligned
   */
  keyValue(key: string, value: string | number): this {
    const valueStr = String(value);
    const gap = this.contentWidth - key.length - valueStr.length;

    if (gap < 1) {
      // If content is too long, truncate key
      const maxKeyLen = this.contentWidth - valueStr.length - 1;
      const truncatedKey = key.slice(0, maxKeyLen);
      const newGap = this.contentWidth - truncatedKey.length - valueStr.length;
      const content = `${truncatedKey}${' '.repeat(newGap)}${valueStr}`;
      const padded = this.padContent(content);
      this.lines.push(`${this.style.vertical}${padded}${this.style.vertical}`);
    } else {
      const content = `${key}${' '.repeat(gap)}${valueStr}`;
      const padded = this.padContent(content);
      this.lines.push(`${this.style.vertical}${padded}${this.style.vertical}`);
    }

    return this;
  }

  /**
   * Build and return all lines as an array
   */
  build(): string[] {
    return [...this.lines];
  }

  /**
   * Build and return as a single string
   */
  toString(): string {
    return this.lines.join('\n');
  }

  /**
   * Build and print to console
   */
  print(): void {
    logger.raw(this.toString());
  }
}

/**
 * Align text within a given width
 */
export function alignText(
  text: string,
  width: number,
  align: TextAlign,
): string {
  const textLen = text.length;

  if (textLen >= width) {
    return text.slice(0, width);
  }

  const remaining = width - textLen;

  switch (align) {
    case 'left':
      return text + ' '.repeat(remaining);
    case 'right':
      return ' '.repeat(remaining) + text;
    case 'center': {
      const leftPad = Math.floor(remaining / 2);
      const rightPad = remaining - leftPad;
      return ' '.repeat(leftPad) + text + ' '.repeat(rightPad);
    }
  }
}

/**
 * Create a new box builder with the given width
 */
export function box(width: number, style?: BoxStyle): BoxBuilder {
  return new BoxBuilder({ width, style });
}

/**
 * Create a simple box with centered content
 */
export function centeredBox(
  content: string[],
  width: number,
  style?: BoxStyle,
): string {
  const builder = new BoxBuilder({ width, style });
  builder.top();
  for (const line of content) {
    builder.center(line);
  }
  builder.bottom();
  return builder.toString();
}

/**
 * Create a titled box with key-value pairs
 */
export function statsBox(
  title: string,
  stats: Array<{ key: string; value: string | number }>,
  width: number,
  style?: BoxStyle,
): string {
  const builder = new BoxBuilder({ width, style });
  builder.topWithTitle(title);
  for (const { key, value } of stats) {
    builder.keyValue(key, value);
  }
  builder.bottom();
  return builder.toString();
}
