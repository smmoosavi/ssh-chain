import { describe, it, expect } from 'bun:test';
import {
  valueToGraphBar,
  graphBarToAnsi,
  valuesToGraphBars,
  valuesToGraph,
  BLOCK_CHARS,
  ANSI_FG,
  ANSI_BG,
  ANSI_RESET,
  DEFAULT_COLORS,
  type GraphBar,
  type Color,
} from '../src/graph-utils.ts';

describe('graph-utils', () => {
  describe('BLOCK_CHARS', () => {
    it('should have 9 characters (space + 8 block heights)', () => {
      expect(BLOCK_CHARS.length).toBe(9);
    });

    it('should start with space for height 0', () => {
      expect(BLOCK_CHARS[0]).toBe(' ');
    });

    it('should end with full block for height 8', () => {
      expect(BLOCK_CHARS[8]).toBe('█');
    });
  });

  describe('valueToGraphBar', () => {
    const maxValue = 6; // 6 bands for 7 colors

    it('should return height 0 with first color for value 0', () => {
      const bar = valueToGraphBar(0, maxValue);
      expect(bar.height).toBe(0);
      expect(bar.color).toBe('transparent');
      expect(bar.background).toBe('transparent');
    });

    it('should return height 0 for negative values', () => {
      const bar = valueToGraphBar(-5, maxValue);
      expect(bar.height).toBe(0);
      expect(bar.color).toBe('transparent');
      expect(bar.background).toBe('transparent');
    });

    it('should return height 8 with last color for value >= maxValue', () => {
      const bar = valueToGraphBar(6, maxValue);
      expect(bar.height).toBe(8);
      expect(bar.color).toBe('white');
      expect(bar.background).toBe('white');
    });

    it('should return height 8 for values exceeding maxValue', () => {
      const bar = valueToGraphBar(100, maxValue);
      expect(bar.height).toBe(8);
      expect(bar.color).toBe('white');
      expect(bar.background).toBe('white');
    });

    it('should handle value at band boundary (1 = start of second band)', () => {
      const bar = valueToGraphBar(1, maxValue);
      // At exactly 1, we're at the start of band 1 (darkRed -> orange)
      // progress = (1 - 1) / 1 = 0, height = 0
      expect(bar.height).toBe(0);
      expect(bar.background).toBe('darkRed');
      expect(bar.color).toBe('orange');
    });

    it('should handle value just below band boundary (nearly full first band)', () => {
      const bar = valueToGraphBar(0.99, maxValue);
      // Band 0: 0-1, progress = 0.99, height = round(0.99 * 8) = 8
      expect(bar.height).toBe(8);
      expect(bar.background).toBe('transparent');
      expect(bar.color).toBe('darkRed');
    });

    it('should handle value in middle of first band', () => {
      const bar = valueToGraphBar(0.5, maxValue);
      // Band 0: 0-1, progress = 0.5, height = round(0.5 * 8) = 4
      expect(bar.height).toBe(4);
      expect(bar.background).toBe('transparent');
      expect(bar.color).toBe('darkRed');
    });

    it('should handle value at 0.25 (height 2)', () => {
      const bar = valueToGraphBar(0.25, maxValue);
      // Band 0: 0-1, progress = 0.25, height = round(0.25 * 8) = 2
      expect(bar.height).toBe(2);
      expect(bar.background).toBe('transparent');
      expect(bar.color).toBe('darkRed');
    });

    it('should handle value in second band', () => {
      const bar = valueToGraphBar(1.5, maxValue);
      // Band 1: 1-2, progress = 0.5, height = 4
      expect(bar.height).toBe(4);
      expect(bar.background).toBe('darkRed');
      expect(bar.color).toBe('orange');
    });

    it('should handle value at 2 (start of third band)', () => {
      const bar = valueToGraphBar(2, maxValue);
      // At exactly 2, we're at the start of band 2 (orange -> yellow)
      expect(bar.height).toBe(0);
      expect(bar.background).toBe('orange');
      expect(bar.color).toBe('yellow');
    });

    it('should handle value at 3 (start of fourth band)', () => {
      const bar = valueToGraphBar(3, maxValue);
      // At exactly 3, we're at the start of band 3 (yellow -> green)
      expect(bar.height).toBe(0);
      expect(bar.background).toBe('yellow');
      expect(bar.color).toBe('green');
    });

    it('should handle value at 4 (start of fifth band)', () => {
      const bar = valueToGraphBar(4, maxValue);
      expect(bar.height).toBe(0);
      expect(bar.background).toBe('green');
      expect(bar.color).toBe('blue');
    });

    it('should handle value at 5 (start of sixth band)', () => {
      const bar = valueToGraphBar(5, maxValue);
      expect(bar.height).toBe(0);
      expect(bar.background).toBe('blue');
      expect(bar.color).toBe('white');
    });

    it('should work with custom colors', () => {
      const customColors: Color[] = ['transparent', 'green', 'white'];
      const bar = valueToGraphBar(0.5, 2, { colors: customColors });
      // Band 0: 0-1, progress = 0.5
      expect(bar.background).toBe('transparent');
      expect(bar.color).toBe('green');
      expect(bar.height).toBe(4);
    });

    it('should handle maxValue of 0', () => {
      const bar = valueToGraphBar(5, 0);
      expect(bar.height).toBe(0);
      expect(bar.color).toBe('transparent');
    });
  });

  describe('graphBarToAnsi', () => {
    it('should render height 0 as space with background', () => {
      const bar: GraphBar = {
        color: 'darkRed',
        background: 'transparent',
        height: 0,
      };
      const result = graphBarToAnsi(bar);
      expect(result).toBe(
        `${ANSI_FG.darkRed}${ANSI_BG.transparent} ${ANSI_RESET}`,
      );
    });

    it('should render height 8 as full block with foreground color', () => {
      const bar: GraphBar = { color: 'green', background: 'yellow', height: 8 };
      const result = graphBarToAnsi(bar);
      expect(result).toBe(`${ANSI_FG.green}${ANSI_BG.green}█${ANSI_RESET}`);
    });

    it('should render intermediate heights with correct block char', () => {
      const bar: GraphBar = {
        color: 'orange',
        background: 'darkRed',
        height: 4,
      };
      const result = graphBarToAnsi(bar);
      // height 4 -> BLOCK_CHARS[4] = "▄"
      expect(result).toBe(`${ANSI_FG.orange}${ANSI_BG.darkRed}▄${ANSI_RESET}`);
    });

    it('should render height 1 with first partial block', () => {
      const bar: GraphBar = {
        color: 'darkRed',
        background: 'transparent',
        height: 1,
      };
      const result = graphBarToAnsi(bar);
      expect(result).toBe(
        `${ANSI_FG.darkRed}${ANSI_BG.transparent}▁${ANSI_RESET}`,
      );
    });

    it('should render height 7 with near-full block', () => {
      const bar: GraphBar = { color: 'white', background: 'blue', height: 7 };
      const result = graphBarToAnsi(bar);
      expect(result).toBe(`${ANSI_FG.white}${ANSI_BG.blue}▇${ANSI_RESET}`);
    });
  });

  describe('valuesToGraphBars', () => {
    it('should convert empty array to empty array', () => {
      const result = valuesToGraphBars([], 6);
      expect(result).toEqual([]);
    });

    it('should convert single value', () => {
      const result = valuesToGraphBars([3], 6);
      expect(result.length).toBe(1);
      // 3 is exactly at band boundary (yellow -> green)
      expect(result[0]?.height).toBe(0);
      expect(result[0]?.background).toBe('yellow');
      expect(result[0]?.color).toBe('green');
    });

    it('should convert multiple values', () => {
      const result = valuesToGraphBars([0, 0.5, 1.5, 2.5], 6);
      expect(result.length).toBe(4);
      expect(result[0]?.height).toBe(0); // 0 = start of first band
      expect(result[1]?.height).toBe(4); // 0.5 = middle of first band
      expect(result[2]?.height).toBe(4); // 1.5 = middle of second band
      expect(result[3]?.height).toBe(4); // 2.5 = middle of third band
    });

    it('should accept custom colors', () => {
      const customColors: Color[] = ['transparent', 'white'];
      const result = valuesToGraphBars([0.5], 1, { colors: customColors });
      expect(result[0]?.background).toBe('transparent');
      expect(result[0]?.color).toBe('white');
    });
  });

  describe('valuesToGraph', () => {
    it('should return empty string for empty array', () => {
      const result = valuesToGraph([], 6);
      expect(result).toBe('');
    });

    it('should return single character for single value', () => {
      const result = valuesToGraph([0], 6);
      // Contains ANSI codes + space character
      expect(result).toContain(' ');
      expect(result).toContain(ANSI_RESET);
    });

    it('should concatenate multiple bars', () => {
      const result = valuesToGraph([0, 3, 6], 6);
      // Should have 3 sets of ANSI codes
      const resetCount = (result.match(/\x1b\[0m/g) || []).length;
      expect(resetCount).toBe(3);
    });

    it('should produce consistent output for same input', () => {
      const values = [0, 1, 2, 3, 4, 5, 6];
      const result1 = valuesToGraph(values, 6);
      const result2 = valuesToGraph(values, 6);
      expect(result1).toBe(result2);
    });

    it('should handle large maxValue (bytes per second scenario)', () => {
      const maxSpeed = 6 * 1024 * 1024; // 6 MB/s
      const speeds = [0, 1024 * 1024, 3 * 1024 * 1024, 6 * 1024 * 1024];
      const result = valuesToGraph(speeds, maxSpeed);
      expect(result.length).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('should handle very small positive values', () => {
      const bar = valueToGraphBar(0.001, 6);
      expect(bar.height).toBe(0);
      expect(bar.background).toBe('transparent');
      expect(bar.color).toBe('darkRed');
    });

    it('should handle floating point precision issues', () => {
      // Test value very close to boundary
      const bar = valueToGraphBar(0.9999999, 6);
      expect(bar.background).toBe('transparent');
      expect(bar.color).toBe('darkRed');
    });

    it('should handle single color gradient', () => {
      const customColors: Color[] = ['green'];
      const bar = valueToGraphBar(5, 10, { colors: customColors });
      // With single color, numBands = 0, should handle gracefully
      expect(bar.color).toBe('green');
    });

    it('should handle two color gradient', () => {
      const customColors: Color[] = ['transparent', 'white'];

      const bar0 = valueToGraphBar(0, 10, { colors: customColors });
      expect(bar0.height).toBe(0);
      expect(bar0.background).toBe('transparent');

      const bar5 = valueToGraphBar(5, 10, { colors: customColors });
      expect(bar5.height).toBe(4);
      expect(bar5.background).toBe('transparent');
      expect(bar5.color).toBe('white');

      const bar10 = valueToGraphBar(10, 10, { colors: customColors });
      expect(bar10.height).toBe(8);
      expect(bar10.color).toBe('white');
    });
  });

  describe('different max values', () => {
    it('should work with maxValue of 12', () => {
      // With 7 colors and maxValue 12, each band is 2 units wide
      const bar0 = valueToGraphBar(0, 12);
      expect(bar0.height).toBe(0);
      expect(bar0.background).toBe('transparent');
      expect(bar0.color).toBe('transparent');

      const bar1 = valueToGraphBar(1, 12);
      // Band 0: 0-2, progress = 1/2 = 0.5, height = 4
      expect(bar1.height).toBe(4);
      expect(bar1.background).toBe('transparent');
      expect(bar1.color).toBe('darkRed');

      const bar2 = valueToGraphBar(2, 12);
      // Exactly at band boundary (darkRed -> orange)
      expect(bar2.height).toBe(0);
      expect(bar2.background).toBe('darkRed');
      expect(bar2.color).toBe('orange');

      const bar3 = valueToGraphBar(3, 12);
      // Band 1: 2-4, progress = 1/2 = 0.5, height = 4
      expect(bar3.height).toBe(4);
      expect(bar3.background).toBe('darkRed');
      expect(bar3.color).toBe('orange');

      const bar6 = valueToGraphBar(6, 12);
      // Exactly at band boundary (yellow -> green)
      expect(bar6.height).toBe(0);
      expect(bar6.background).toBe('yellow');
      expect(bar6.color).toBe('green');

      const bar12 = valueToGraphBar(12, 12);
      expect(bar12.height).toBe(8);
      expect(bar12.color).toBe('white');
      expect(bar12.background).toBe('white');
    });

    it('should work with maxValue of 3', () => {
      // With 7 colors and maxValue 3, each band is 0.5 units wide
      const bar0 = valueToGraphBar(0, 3);
      expect(bar0.height).toBe(0);
      expect(bar0.background).toBe('transparent');
      expect(bar0.color).toBe('transparent');

      const bar025 = valueToGraphBar(0.25, 3);
      // Band 0: 0-0.5, progress = 0.25/0.5 = 0.5, height = 4
      expect(bar025.height).toBe(4);
      expect(bar025.background).toBe('transparent');
      expect(bar025.color).toBe('darkRed');

      const bar05 = valueToGraphBar(0.5, 3);
      // Exactly at band boundary (darkRed -> orange)
      expect(bar05.height).toBe(0);
      expect(bar05.background).toBe('darkRed');
      expect(bar05.color).toBe('orange');

      const bar1 = valueToGraphBar(1, 3);
      // Exactly at band boundary (orange -> yellow)
      expect(bar1.height).toBe(0);
      expect(bar1.background).toBe('orange');
      expect(bar1.color).toBe('yellow');

      const bar15 = valueToGraphBar(1.5, 3);
      // Exactly at band boundary (yellow -> green)
      expect(bar15.height).toBe(0);
      expect(bar15.background).toBe('yellow');
      expect(bar15.color).toBe('green');

      const bar2 = valueToGraphBar(2, 3);
      // Exactly at band boundary (green -> blue)
      expect(bar2.height).toBe(0);
      expect(bar2.background).toBe('green');
      expect(bar2.color).toBe('blue');

      const bar25 = valueToGraphBar(2.5, 3);
      // Exactly at band boundary (blue -> white)
      expect(bar25.height).toBe(0);
      expect(bar25.background).toBe('blue');
      expect(bar25.color).toBe('white');

      const bar3 = valueToGraphBar(3, 3);
      expect(bar3.height).toBe(8);
      expect(bar3.color).toBe('white');
      expect(bar3.background).toBe('white');
    });

    it('should render graph with maxValue of 12', () => {
      const values = [0, 3, 6, 9, 12];
      const graph = valuesToGraph(values, 12);
      expect(graph.length).toBeGreaterThan(0);
      // Should have 5 characters with ANSI codes
      const resetCount = (graph.match(/\x1b\[0m/g) || []).length;
      expect(resetCount).toBe(5);
    });

    it('should render graph with maxValue of 3', () => {
      const values = [0, 0.75, 1.5, 2.25, 3];
      const graph = valuesToGraph(values, 3);
      expect(graph.length).toBeGreaterThan(0);
      // Should have 5 characters with ANSI codes
      const resetCount = (graph.match(/\x1b\[0m/g) || []).length;
      expect(resetCount).toBe(5);
    });
  });
});
