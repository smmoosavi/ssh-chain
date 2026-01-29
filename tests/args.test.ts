/**
 * Tests for argument parsing
 */

import { describe, expect, test } from 'bun:test';
import { parseArgv, type ParsedArgs } from '../src/args.ts';

describe('parseArgv', () => {
  // Helper to create argv array (simulating node/bun <script> <args>)
  const argv = (...args: string[]) => ['node', 'script.ts', ...args];

  describe('positional arguments', () => {
    test('parses SSH server as positional argument', () => {
      const result = parseArgv(argv('my-server'));
      expect(result.sshServer).toBe('my-server');
    });

    test('parses user@host format', () => {
      const result = parseArgv(argv('admin@192.168.1.100'));
      expect(result.sshServer).toBe('admin@192.168.1.100');
    });

    test('handles no positional arguments', () => {
      const result = parseArgv(argv());
      expect(result.sshServer).toBeUndefined();
    });
  });

  describe('--config / -c option', () => {
    test('parses --config option', () => {
      const result = parseArgv(argv('--config', './custom-config.json'));
      expect(result.configPath).toBe('./custom-config.json');
    });

    test('parses -c shorthand', () => {
      const result = parseArgv(argv('-c', '/path/to/config.json'));
      expect(result.configPath).toBe('/path/to/config.json');
    });

    test('combines with positional argument', () => {
      const result = parseArgv(argv('my-server', '-c', './config.json'));
      expect(result.sshServer).toBe('my-server');
      expect(result.configPath).toBe('./config.json');
    });
  });

  describe('--host / -H option', () => {
    test('parses --host option', () => {
      const result = parseArgv(argv('--host', '0.0.0.0'));
      expect(result.httpProxyHost).toBe('0.0.0.0');
    });

    test('parses -H shorthand', () => {
      const result = parseArgv(argv('-H', '192.168.1.1'));
      expect(result.httpProxyHost).toBe('192.168.1.1');
    });
  });

  describe('--port / -p option', () => {
    test('parses --port option', () => {
      const result = parseArgv(argv('--port', '8080'));
      expect(result.httpProxyPort).toBe(8080);
    });

    test('parses -p shorthand', () => {
      const result = parseArgv(argv('-p', '9090'));
      expect(result.httpProxyPort).toBe(9090);
    });

    test('throws on invalid port (not a number)', () => {
      expect(() => parseArgv(argv('-p', 'abc'))).toThrow('Invalid port number');
    });

    test('throws on port out of range (too low)', () => {
      expect(() => parseArgv(argv('-p', '0'))).toThrow('Invalid port number');
    });

    test('throws on port out of range (too high)', () => {
      expect(() => parseArgv(argv('-p', '70000'))).toThrow(
        'Invalid port number',
      );
    });
  });

  describe('--log-level / -l option', () => {
    test('parses --log-level debug', () => {
      const result = parseArgv(argv('--log-level', 'debug'));
      expect(result.logLevel).toBe('debug');
    });

    test('parses --log-level info', () => {
      const result = parseArgv(argv('--log-level', 'info'));
      expect(result.logLevel).toBe('info');
    });

    test('parses --log-level warn', () => {
      const result = parseArgv(argv('--log-level', 'warn'));
      expect(result.logLevel).toBe('warn');
    });

    test('parses --log-level error', () => {
      const result = parseArgv(argv('--log-level', 'error'));
      expect(result.logLevel).toBe('error');
    });

    test('parses -l shorthand', () => {
      const result = parseArgv(argv('-l', 'debug'));
      expect(result.logLevel).toBe('debug');
    });

    test('throws on invalid log level', () => {
      expect(() => parseArgv(argv('--log-level', 'verbose'))).toThrow(
        'Invalid log level',
      );
    });
  });

  describe('--help / -h option', () => {
    test('parses --help option', () => {
      const result = parseArgv(argv('--help'));
      expect(result.help).toBe(true);
    });

    test('parses -h shorthand', () => {
      const result = parseArgv(argv('-h'));
      expect(result.help).toBe(true);
    });

    test('defaults to false', () => {
      const result = parseArgv(argv());
      expect(result.help).toBe(false);
    });
  });

  describe('--version / -v option', () => {
    test('parses --version option', () => {
      const result = parseArgv(argv('--version'));
      expect(result.version).toBe(true);
    });

    test('parses -v shorthand', () => {
      const result = parseArgv(argv('-v'));
      expect(result.version).toBe(true);
    });

    test('defaults to false', () => {
      const result = parseArgv(argv());
      expect(result.version).toBe(false);
    });
  });

  describe('combined options', () => {
    test('parses multiple options together', () => {
      const result = parseArgv(
        argv(
          'my-server',
          '-c',
          './config.json',
          '-H',
          '0.0.0.0',
          '-p',
          '8080',
          '-l',
          'debug',
        ),
      );

      expect(result.sshServer).toBe('my-server');
      expect(result.configPath).toBe('./config.json');
      expect(result.httpProxyHost).toBe('0.0.0.0');
      expect(result.httpProxyPort).toBe(8080);
      expect(result.logLevel).toBe('debug');
      expect(result.help).toBe(false);
      expect(result.version).toBe(false);
    });

    test('parses options in any order', () => {
      const result = parseArgv(
        argv('-p', '8080', 'my-server', '--log-level', 'warn'),
      );

      expect(result.sshServer).toBe('my-server');
      expect(result.httpProxyPort).toBe(8080);
      expect(result.logLevel).toBe('warn');
    });
  });

  describe('error handling', () => {
    test('throws on unknown option', () => {
      expect(() => parseArgv(argv('--unknown-option'))).toThrow();
    });
  });
});
