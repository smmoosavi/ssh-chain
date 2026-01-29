/**
 * Tests for config schemas and createConfig function
 */

import { describe, expect, test } from 'bun:test';
import {
  ConfigSchema,
  SSHServerSchema,
  PortRangeSchema,
  LogLevelSchema,
  createConfig,
  type Config,
} from '../src/config.ts';

describe('SSHServerSchema', () => {
  test('parses string to object format', () => {
    const result = SSHServerSchema.parse('my-server');
    expect(result).toEqual({ host: 'my-server' });
  });

  test('parses object format with host only', () => {
    const result = SSHServerSchema.parse({ host: 'my-server' });
    expect(result).toEqual({ host: 'my-server' });
  });

  test('parses full object format', () => {
    const result = SSHServerSchema.parse({
      host: 'my-server',
      port: 2222,
      username: 'admin',
      identityFile: '~/.ssh/id_rsa',
      options: ['-o StrictHostKeyChecking=no'],
    });
    expect(result).toEqual({
      host: 'my-server',
      port: 2222,
      username: 'admin',
      identityFile: '~/.ssh/id_rsa',
      options: ['-o StrictHostKeyChecking=no'],
    });
  });

  test('rejects empty string', () => {
    expect(() => SSHServerSchema.parse('')).toThrow();
  });

  test('rejects object with empty host', () => {
    expect(() => SSHServerSchema.parse({ host: '' })).toThrow();
  });
});

describe('PortRangeSchema', () => {
  test('parses valid port range', () => {
    const result = PortRangeSchema.parse({ min: 10000, max: 10100 });
    expect(result).toEqual({ min: 10000, max: 10100 });
  });

  test('applies defaults', () => {
    const result = PortRangeSchema.parse({});
    expect(result).toEqual({ min: 10000, max: 10100 });
  });

  test('rejects min > max', () => {
    expect(() => PortRangeSchema.parse({ min: 10100, max: 10000 })).toThrow();
  });

  test('rejects port below 1024', () => {
    expect(() => PortRangeSchema.parse({ min: 80, max: 100 })).toThrow();
  });

  test('rejects port above 65535', () => {
    expect(() => PortRangeSchema.parse({ min: 70000, max: 80000 })).toThrow();
  });
});

describe('LogLevelSchema', () => {
  test('accepts valid log levels', () => {
    expect(LogLevelSchema.parse('debug')).toBe('debug');
    expect(LogLevelSchema.parse('info')).toBe('info');
    expect(LogLevelSchema.parse('warn')).toBe('warn');
    expect(LogLevelSchema.parse('error')).toBe('error');
  });

  test('rejects invalid log level', () => {
    expect(() => LogLevelSchema.parse('verbose')).toThrow();
    expect(() => LogLevelSchema.parse('')).toThrow();
  });
});

describe('ConfigSchema', () => {
  test('parses minimal config with sshServer string', () => {
    const result = ConfigSchema.parse({ sshServer: 'my-server' });
    expect(result.sshServer).toEqual({ host: 'my-server' });
    expect(result.httpProxyPort).toBe(4080);
    expect(result.httpProxyHost).toBe('127.0.0.1');
  });

  test('parses full config', () => {
    const result = ConfigSchema.parse({
      sshServer: { host: 'my-server', port: 2222 },
      portRange: { min: 20000, max: 20100 },
      httpProxyHost: '0.0.0.0',
      httpProxyPort: 8080,
      inactivityTimeout: 120,
      healthCheckInterval: 60,
      retryAttempts: 5,
      logLevel: 'debug',
      directDomains: ['*.local', 'localhost'],
    });

    expect(result.sshServer).toEqual({ host: 'my-server', port: 2222 });
    expect(result.portRange).toEqual({ min: 20000, max: 20100 });
    expect(result.httpProxyHost).toBe('0.0.0.0');
    expect(result.httpProxyPort).toBe(8080);
    expect(result.inactivityTimeout).toBe(120);
    expect(result.healthCheckInterval).toBe(60);
    expect(result.retryAttempts).toBe(5);
    expect(result.logLevel).toBe('debug');
    expect(result.directDomains).toEqual(['*.local', 'localhost']);
  });

  test('applies default values', () => {
    const result = ConfigSchema.parse({ sshServer: 'my-server' });
    expect(result.portRange).toEqual({ min: 10000, max: 10100 });
    expect(result.httpProxyHost).toBe('127.0.0.1');
    expect(result.httpProxyPort).toBe(4080);
    expect(result.inactivityTimeout).toBe(60);
    expect(result.healthCheckInterval).toBe(30);
    expect(result.retryAttempts).toBe(3);
    expect(result.logLevel).toBe('info');
  });

  test('rejects missing sshServer', () => {
    expect(() => ConfigSchema.parse({})).toThrow();
  });

  test('rejects invalid httpProxyPort', () => {
    expect(() =>
      ConfigSchema.parse({ sshServer: 'my-server', httpProxyPort: 0 }),
    ).toThrow();
    expect(() =>
      ConfigSchema.parse({ sshServer: 'my-server', httpProxyPort: 70000 }),
    ).toThrow();
  });
});

describe('createConfig', () => {
  test('creates config with minimal input', () => {
    const config = createConfig({ sshServer: 'my-server' });
    expect(config.sshServer).toEqual({ host: 'my-server' });
    expect(config.httpProxyPort).toBe(4080);
  });

  test('creates config with full input', () => {
    const config = createConfig({
      sshServer: { host: 'my-server', username: 'admin' },
      httpProxyPort: 9090,
      logLevel: 'debug',
    });
    expect(config.sshServer).toEqual({ host: 'my-server', username: 'admin' });
    expect(config.httpProxyPort).toBe(9090);
    expect(config.logLevel).toBe('debug');
  });

  test('throws on invalid input', () => {
    expect(() => createConfig({} as any)).toThrow();
  });
});
