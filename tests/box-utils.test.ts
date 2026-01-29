import { describe, expect, test } from 'bun:test';
import {
  BoxBuilder,
  alignText,
  box,
  centeredBox,
  statsBox,
  DOUBLE_BOX,
  SINGLE_BOX,
} from '../src/box-utils.ts';

describe('alignText', () => {
  test('left aligns text with padding on right', () => {
    expect(alignText('hello', 10, 'left')).toBe('hello     ');
  });

  test('right aligns text with padding on left', () => {
    expect(alignText('hello', 10, 'right')).toBe('     hello');
  });

  test('center aligns text with equal padding', () => {
    expect(alignText('hello', 11, 'center')).toBe('   hello   ');
  });

  test('center aligns text with uneven padding (left gets less)', () => {
    expect(alignText('hello', 10, 'center')).toBe('  hello   ');
  });

  test('truncates text if longer than width', () => {
    expect(alignText('hello world', 5, 'left')).toBe('hello');
    expect(alignText('hello world', 5, 'right')).toBe('hello');
    expect(alignText('hello world', 5, 'center')).toBe('hello');
  });

  test('returns exact text if equal to width', () => {
    expect(alignText('hello', 5, 'left')).toBe('hello');
    expect(alignText('hello', 5, 'right')).toBe('hello');
    expect(alignText('hello', 5, 'center')).toBe('hello');
  });
});

describe('BoxBuilder', () => {
  describe('top and bottom borders', () => {
    test('creates top border with double box style', () => {
      const result = box(10).top().build();
      expect(result).toEqual(['╔══════════╗']);
    });

    test('creates bottom border with double box style', () => {
      const result = box(10).bottom().build();
      expect(result).toEqual(['╚══════════╝']);
    });

    test('creates top border with single box style', () => {
      const result = box(10, SINGLE_BOX).top().build();
      expect(result).toEqual(['┌──────────┐']);
    });

    test('creates bottom border with single box style', () => {
      const result = box(10, SINGLE_BOX).bottom().build();
      expect(result).toEqual(['└──────────┘']);
    });
  });

  describe('topWithTitle', () => {
    test('creates top border with centered title', () => {
      const result = box(20).topWithTitle('Test').build();
      expect(result).toEqual(['╔═══════ Test ═══════╗']);
    });

    test('handles long title', () => {
      const result = box(20).topWithTitle('A Very Long Title').build();
      expect(result).toEqual(['╔ A Very Long Title ═╗']);
    });
  });

  describe('text alignment methods', () => {
    test('left aligns text', () => {
      const result = box(20).left('hello').build();
      expect(result).toEqual(['║ hello              ║']);
    });

    test('right aligns text', () => {
      const result = box(20).right('hello').build();
      expect(result).toEqual(['║              hello ║']);
    });

    test('center aligns text', () => {
      const result = box(20).center('hello').build();
      expect(result).toEqual(['║       hello        ║']);
    });

    test('creates empty line', () => {
      const result = box(10).empty().build();
      expect(result).toEqual(['║          ║']);
    });
  });

  describe('keyValue', () => {
    test('creates key-value pair with string value', () => {
      const result = box(30).keyValue('Name:', 'John').build();
      expect(result).toEqual(['║ Name:                   John ║']);
    });

    test('creates key-value pair with number value', () => {
      const result = box(30).keyValue('Count:', 42).build();
      expect(result).toEqual(['║ Count:                    42 ║']);
    });

    test('handles long values', () => {
      const result = box(20).keyValue('Key:', 'value').build();
      expect(result).toEqual(['║ Key:         value ║']);
    });

    test('truncates key when content too long', () => {
      const result = box(15).keyValue('Very Long Key:', 'val').build();
      // Content width is 13, value is 3, so key gets truncated
      expect(result[0]).toContain('val');
      expect(result[0]?.length).toBe(17); // 15 inner + 2 borders
    });
  });

  describe('chaining', () => {
    test('supports method chaining', () => {
      const result = box(20)
        .top()
        .center('Title')
        .empty()
        .left('Content')
        .bottom()
        .build();

      expect(result).toHaveLength(5);
      expect(result[0]).toBe('╔════════════════════╗');
      expect(result[1]).toContain('Title');
      expect(result[3]).toContain('Content');
      expect(result[4]).toBe('╚════════════════════╝');
    });
  });

  describe('toString', () => {
    test('returns lines joined by newline', () => {
      const result = box(10).top().bottom().toString();
      expect(result).toBe('╔══════════╗\n╚══════════╝');
    });
  });
});

describe('centeredBox', () => {
  test('creates a box with centered content', () => {
    const result = centeredBox(['Hello', 'World'], 20);
    const lines = result.split('\n');

    expect(lines).toHaveLength(4);
    expect(lines[0]).toBe('╔════════════════════╗');
    expect(lines[1]).toContain('Hello');
    expect(lines[2]).toContain('World');
    expect(lines[3]).toBe('╚════════════════════╝');
  });

  test('uses custom style', () => {
    const result = centeredBox(['Test'], 10, SINGLE_BOX);
    const lines = result.split('\n');

    expect(lines[0]).toBe('┌──────────┐');
    expect(lines[2]).toBe('└──────────┘');
  });
});

describe('statsBox', () => {
  test('creates a titled box with key-value pairs', () => {
    const result = statsBox(
      'Stats',
      [
        { key: 'Requests:', value: 100 },
        { key: 'Hosts:', value: 5 },
      ],
      30,
    );
    const lines = result.split('\n');

    expect(lines).toHaveLength(4);
    expect(lines[0]).toContain('Stats');
    expect(lines[1]).toContain('Requests:');
    expect(lines[1]).toContain('100');
    expect(lines[2]).toContain('Hosts:');
    expect(lines[2]).toContain('5');
  });

  test('uses custom style', () => {
    const result = statsBox(
      'Test',
      [{ key: 'Key:', value: 'Value' }],
      20,
      SINGLE_BOX,
    );
    const lines = result.split('\n');

    expect(lines[0]).toContain('┌');
    expect(lines[0]).toContain('┐');
    expect(lines[2]).toContain('└');
    expect(lines[2]).toContain('┘');
  });
});

describe('box styles', () => {
  test('DOUBLE_BOX has correct characters', () => {
    expect(DOUBLE_BOX.topLeft).toBe('╔');
    expect(DOUBLE_BOX.topRight).toBe('╗');
    expect(DOUBLE_BOX.bottomLeft).toBe('╚');
    expect(DOUBLE_BOX.bottomRight).toBe('╝');
    expect(DOUBLE_BOX.horizontal).toBe('═');
    expect(DOUBLE_BOX.vertical).toBe('║');
  });

  test('SINGLE_BOX has correct characters', () => {
    expect(SINGLE_BOX.topLeft).toBe('┌');
    expect(SINGLE_BOX.topRight).toBe('┐');
    expect(SINGLE_BOX.bottomLeft).toBe('└');
    expect(SINGLE_BOX.bottomRight).toBe('┘');
    expect(SINGLE_BOX.horizontal).toBe('─');
    expect(SINGLE_BOX.vertical).toBe('│');
  });
});
