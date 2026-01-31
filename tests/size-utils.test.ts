/**
 * Tests for size-utils
 */

import { expect, test, describe } from 'bun:test';
import { parseSize } from '../src/size-utils.ts';

describe('parseSize', () => {
  describe('basic number parsing', () => {
    test('parses plain number', () => {
      expect(parseSize(1024)).toBe(1024);
    });

    test('parses plain number string', () => {
      expect(parseSize('1024')).toBe(1024);
    });

    test('parses decimal number string without unit', () => {
      expect(parseSize('1024.5')).toBe(1024);
    });

    test('parses zero', () => {
      expect(parseSize(0)).toBe(0);
      expect(parseSize('0')).toBe(0);
    });

    test('floors decimal results', () => {
      expect(parseSize('1.9')).toBe(1);
    });
  });

  describe('kilobyte parsing', () => {
    test('parses K suffix (uppercase)', () => {
      expect(parseSize('100K')).toBe(102400);
    });

    test('parses k suffix (lowercase)', () => {
      expect(parseSize('100k')).toBe(102400);
    });

    test('parses K with decimal', () => {
      expect(parseSize('1.5K')).toBe(1536);
    });

    test('parses K with whitespace', () => {
      expect(parseSize('100 K')).toBe(102400);
      expect(parseSize('100  K')).toBe(102400);
    });
  });

  describe('megabyte parsing', () => {
    test('parses M suffix (uppercase)', () => {
      expect(parseSize('10M')).toBe(10485760);
    });

    test('parses m suffix (lowercase)', () => {
      expect(parseSize('10m')).toBe(10485760);
    });

    test('parses M with decimal', () => {
      expect(parseSize('1.5M')).toBe(1572864);
    });

    test('parses 6M (common default)', () => {
      expect(parseSize('6M')).toBe(6291456);
    });
  });

  describe('gigabyte parsing', () => {
    test('parses G suffix (uppercase)', () => {
      expect(parseSize('1G')).toBe(1073741824);
    });

    test('parses g suffix (lowercase)', () => {
      expect(parseSize('1g')).toBe(1073741824);
    });

    test('parses G with decimal', () => {
      expect(parseSize('0.5G')).toBe(536870912);
    });
  });

  describe('terabyte parsing', () => {
    test('parses T suffix (uppercase)', () => {
      expect(parseSize('1T')).toBe(1099511627776);
    });

    test('parses t suffix (lowercase)', () => {
      expect(parseSize('1t')).toBe(1099511627776);
    });
  });

  describe('whitespace handling', () => {
    test('trims leading whitespace', () => {
      expect(parseSize('  100K')).toBe(102400);
    });

    test('trims trailing whitespace', () => {
      expect(parseSize('100K  ')).toBe(102400);
    });

    test('trims both leading and trailing whitespace', () => {
      expect(parseSize('  100K  ')).toBe(102400);
    });
  });

  describe('error cases', () => {
    test('throws on empty string', () => {
      expect(() => parseSize('')).toThrow('Size value cannot be empty');
    });

    test('throws on whitespace-only string', () => {
      expect(() => parseSize('   ')).toThrow('Size value cannot be empty');
    });

    test('throws on invalid format', () => {
      expect(() => parseSize('abc')).toThrow('Invalid size format');
    });

    test('throws on negative number', () => {
      expect(() => parseSize(-100)).toThrow(
        'Size must be a positive finite number',
      );
      expect(() => parseSize('-100')).toThrow('Invalid size format');
    });

    test('throws on NaN', () => {
      expect(() => parseSize(NaN)).toThrow(
        'Size must be a positive finite number',
      );
    });

    test('throws on Infinity', () => {
      expect(() => parseSize(Infinity)).toThrow(
        'Size must be a positive finite number',
      );
    });

    test('throws on invalid unit', () => {
      expect(() => parseSize('100X')).toThrow('Invalid size format');
    });

    test('throws on multiple units', () => {
      expect(() => parseSize('100KM')).toThrow('Invalid size format');
    });

    test('throws on unit without number', () => {
      expect(() => parseSize('K')).toThrow('Invalid size format');
    });

    test('throws on invalid characters', () => {
      expect(() => parseSize('10@M')).toThrow('Invalid size format');
    });
  });

  describe('edge cases', () => {
    test('handles very large values within range', () => {
      expect(parseSize('999T')).toBe(1098412116148224);
    });

    test('handles very small decimal values', () => {
      expect(parseSize('0.001K')).toBe(1);
    });

    test('handles 1 byte', () => {
      expect(parseSize('1')).toBe(1);
    });
  });
});
