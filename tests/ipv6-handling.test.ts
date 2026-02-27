import { describe, test, expect } from 'bun:test';
import { ProxyServer } from '../src/proxy-server.ts';
import type { Config } from '../src/config.ts';
import type { SSHManager } from '../src/ssh-manager.ts';

// Mock config and SSH manager for testing private methods
function createMockProxyServer(): ProxyServer {
  const mockConfig: Config = {
    httpProxyPort: 8080,
    httpProxyHost: '127.0.0.1',
    sshServer: { host: 'example.com' },
    portRange: { min: 10000, max: 10100 },
    inactivityTimeout: 60,
    healthCheckInterval: 30,
    retryAttempts: 3,
    directDomains: [],
    logLevel: 'info',
    showFooter: true,
    maxSpeed: 6 * 1024 * 1024,
  };

  const mockSSHManager = {
    getSocksUrl: () => 'socks5://127.0.0.1:10051',
    updateActivity: () => {},
    restart: async () => {},
  } as unknown as SSHManager;

  return new ProxyServer(mockConfig, mockSSHManager);
}

describe('IPv6 Address Handling', () => {
  test('extractHostname should handle IPv6 addresses in CONNECT format', () => {
    const server = createMockProxyServer();

    // Access private method for testing using type assertion
    const extractHostname = (server as any).extractHostname.bind(server);

    // IPv6 addresses
    expect(extractHostname('[2001:67c:4e8:f004::a]:80')).toBe(
      '2001:67c:4e8:f004::a',
    );
    expect(extractHostname('[2001:b28:f23d:f003::a]:443')).toBe(
      '2001:b28:f23d:f003::a',
    );
    expect(extractHostname('[::1]:8080')).toBe('::1');
    expect(extractHostname('[fe80::1]:3000')).toBe('fe80::1');

    // IPv4 addresses (should still work)
    expect(extractHostname('149.154.167.43:80')).toBe('149.154.167.43');
    expect(extractHostname('example.com:443')).toBe('example.com');
  });

  test('extractHostname should handle IPv6 addresses in full URL format', () => {
    const server = createMockProxyServer();
    const extractHostname = (server as any).extractHostname.bind(server);

    // Full URLs with IPv6 (URL parser should handle these)
    expect(extractHostname('http://[2001:67c:4e8:f004::a]:80/api')).toBe(
      '2001:67c:4e8:f004::a',
    );
    expect(extractHostname('https://[2001:b28:f23d:f003::a]:443/path')).toBe(
      '2001:b28:f23d:f003::a',
    );

    // Regular URLs should still work
    expect(extractHostname('http://example.com:8080/path')).toBe('example.com');
    expect(extractHostname('https://api.telegram.org/bot')).toBe(
      'api.telegram.org',
    );
  });

  test('extractPort should handle IPv6 addresses in CONNECT format', () => {
    const server = createMockProxyServer();
    const extractPort = (server as any).extractPort.bind(server);

    // IPv6 addresses with explicit ports
    expect(extractPort('[2001:67c:4e8:f004::a]:80', false)).toBe(80);
    expect(extractPort('[2001:b28:f23d:f003::a]:443', true)).toBe(443);
    expect(extractPort('[::1]:8080', false)).toBe(8080);
    expect(extractPort('[fe80::1]:3000', false)).toBe(3000);

    // IPv6 without port (should use defaults)
    expect(extractPort('[2001:67c:4e8:f004::a]', false)).toBe(80);
    expect(extractPort('[2001:67c:4e8:f004::a]', true)).toBe(443);

    // IPv4 addresses (should still work)
    expect(extractPort('149.154.167.43:80', false)).toBe(80);
    expect(extractPort('example.com:443', true)).toBe(443);
  });

  test('extractPort should handle IPv6 addresses in full URL format', () => {
    const server = createMockProxyServer();
    const extractPort = (server as any).extractPort.bind(server);

    // Full URLs with IPv6
    expect(extractPort('http://[2001:67c:4e8:f004::a]:80/api', false)).toBe(80);
    expect(extractPort('https://[2001:b28:f23d:f003::a]:8443/path', true)).toBe(
      8443,
    );

    // URLs without explicit port (should use defaults based on protocol)
    expect(extractPort('http://[2001:67c:4e8:f004::a]/api', false)).toBe(80);
    expect(extractPort('https://[2001:67c:4e8:f004::a]/api', true)).toBe(443);
  });

  test('should handle edge cases', () => {
    const server = createMockProxyServer();
    const extractHostname = (server as any).extractHostname.bind(server);
    const extractPort = (server as any).extractPort.bind(server);

    // Malformed IPv6 (missing closing bracket) - falls back to split behavior
    expect(extractHostname('[2001:67c:4e8:f004::a:80')).toBe('[2001');

    // Empty IPv6
    expect(extractHostname('[]:80')).toBe('');

    // IPv6 without brackets (in CONNECT format - won't be recognized as IPv6)
    expect(extractHostname('2001:67c:4e8:f004::a:80')).toBe('2001');
  });
});
