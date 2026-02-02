/**
 * HTTP Proxy Server
 * Provides an HTTP/HTTPS proxy interface that forwards to the SSH SOCKS5 tunnel
 * Emits events for extensibility via plugins
 */

import { networkInterfaces } from 'os';
import ProxyChain from 'proxy-chain';
import type { Config } from './config.ts';
import type { SSHManager } from './ssh-manager.ts';
import {
  TypedEventEmitter,
  type ProxyServerEvents,
  type ProxyRequestInfo,
  type ConnectionStats,
} from './types.ts';

/**
 * Check if a domain matches any pattern in the direct domains list
 * Supports wildcards:
 * - *.example.com matches any subdomain of example.com
 * - foo-bar matches exact hostname (no TLD required)
 * - *.us matches all domains ending in .us TLD
 * - foo.example.com matches exact domain
 */
export function shouldUseDirect(
  hostname: string,
  directDomains: string[],
): boolean {
  if (directDomains.length === 0) {
    return false;
  }

  for (const pattern of directDomains) {
    // Exact match
    if (pattern === hostname) {
      return true;
    }

    // Wildcard pattern
    if (pattern.startsWith('*.')) {
      const suffix = pattern.slice(1); // Remove * but keep the dot
      // Match if hostname ends with the suffix (e.g., .example.com)
      if (hostname.endsWith(suffix)) {
        return true;
      }
      // Also match the domain itself without subdomain (e.g., example.com for *.example.com)
      if (hostname === suffix.slice(1)) {
        return true;
      }
    } else if (pattern.startsWith('*')) {
      // Handle patterns like *.us (without dot after *)
      const suffix = pattern.slice(1);
      if (hostname.endsWith(suffix)) {
        return true;
      }
    } else {
      // For patterns without wildcards, also match if it's a simple hostname (no dots)
      // This handles cases like "foo-bar" which should only match "foo-bar"
      if (pattern === hostname) {
        return true;
      }
    }
  }

  return false;
}

export class ProxyServer extends TypedEventEmitter<ProxyServerEvents> {
  private config: Config;
  private sshManager: SSHManager;
  private server: ProxyChain.Server | null = null;
  /** Map connectionId to hostname for tracking */
  private connectionHostnames: Map<number, string> = new Map();

  constructor(config: Config, sshManager: SSHManager) {
    super();
    this.config = config;
    this.sshManager = sshManager;
  }

  /**
   * Extract hostname from URL or request
   */
  private extractHostname(url: string): string {
    try {
      // Handle CONNECT requests (hostname:port format)
      if (url.includes(':') && !url.includes('://')) {
        return url.split(':')[0] ?? url;
      }

      // Handle full URLs
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return url;
    }
  }

  /**
   * Extract port from URL or request
   */
  private extractPort(url: string, isHttps: boolean): number {
    try {
      // Handle CONNECT requests (hostname:port format)
      if (url.includes(':') && !url.includes('://')) {
        const parts = url.split(':');
        return parseInt(parts[1] ?? (isHttps ? '443' : '80'), 10);
      }

      // Handle full URLs
      const urlObj = new URL(url);
      return urlObj.port ? parseInt(urlObj.port, 10) : isHttps ? 443 : 80;
    } catch {
      return isHttps ? 443 : 80;
    }
  }

  /**
   * Start the HTTP proxy server
   */
  async start(): Promise<void> {
    const initialSocksUrl = this.sshManager.getSocksUrl();

    if (!initialSocksUrl) {
      throw new Error('SSH SOCKS5 proxy is not running');
    }

    this.server = new ProxyChain.Server({
      port: this.config.httpProxyPort,
      host: this.config.httpProxyHost,
      verbose: this.config.logLevel === 'debug',

      prepareRequestFunction: ({
        request,
        hostname,
        port,
        isHttp,
        connectionId,
      }) => {
        const targetHost = hostname || this.extractHostname(request.url || '');
        const targetPort = port || this.extractPort(request.url || '', !isHttp);

        // Track connection hostname for stats
        this.connectionHostnames.set(connectionId, targetHost);

        // Check if domain should bypass proxy
        const isDirect = shouldUseDirect(targetHost, this.config.directDomains);

        const method = request.method || 'CONNECT';

        // Emit request event for plugins
        const requestInfo: ProxyRequestInfo = {
          connectionId,
          hostname: targetHost,
          port: targetPort,
          method,
          url: request.url || `${targetHost}:${targetPort}`,
          isHttps: !isHttp,
          isDirect,
          timestamp: new Date(),
        };
        this.emit('request', requestInfo);

        // Notify activity to SSH manager (only for proxied requests)
        if (!isDirect) {
          this.sshManager.updateActivity();
        }

        // If domain should go direct, return null to bypass proxy
        if (isDirect) {
          return {
            upstreamProxyUrl: undefined,
            requestAuthentication: false,
          };
        }

        // Get current SOCKS URL (may change if SSH restarts)
        const currentSocksUrl = this.sshManager.getSocksUrl();
        if (!currentSocksUrl) {
          this.emit(
            'error',
            new Error('SSH SOCKS5 proxy not available'),
            'prepareRequest',
          );
          // Trigger SSH restart in background to recover from the error
          this.sshManager.restart().catch((error) => {
            this.emit(
              'error',
              new Error(`Failed to restart SSH: ${error.message}`),
              'sshRestart',
            );
          });
          return { failMsg: 'SSH SOCKS5 proxy not available' };
        }

        // Return upstream proxy configuration
        return {
          upstreamProxyUrl: currentSocksUrl,
          requestAuthentication: false,
        };
      },
    });

    // Listen for connection closed events to emit byte statistics
    this.server.on(
      'connectionClosed',
      ({
        connectionId,
        stats,
      }: {
        connectionId: number;
        stats: ConnectionStats;
      }) => {
        const hostname =
          this.connectionHostnames.get(connectionId) || 'unknown';
        this.connectionHostnames.delete(connectionId);
        this.emit('connectionClosed', connectionId, stats, hostname);
      },
    );

    this.server.on('requestFailed', ({ error }) => {
      // Filter out "Only HTTP protocol is supported" errors - these occur when
      // misbehaving clients (like Microsoft telemetry) send direct HTTPS requests
      // instead of using the CONNECT method. This is expected and not actionable.
      if (error.message.includes('Only HTTP protocol is supported')) {
        return;
      }
      this.emit('error', error, 'requestFailed');
    });

    await this.server.listen();

    // Emit started event
    this.emit('started', this.config.httpProxyPort, this.getProxyUrl());
  }

  /**
   * Stop the HTTP proxy server
   */
  async stop(): Promise<void> {
    if (this.server) {
      await this.server.close(true);
      this.server = null;
    }
    this.connectionHostnames.clear();

    this.emit('stopped');
  }

  /**
   * Get the proxy URL for clients to use
   */
  getProxyUrl(): string {
    return `http://${this.config.httpProxyHost}:${this.config.httpProxyPort}`;
  }

  /**
   * Get all proxy URLs for clients to use
   * When listening on 0.0.0.0, returns URLs for all network interfaces
   */
  getProxyUrls(): string[] {
    const port = this.config.httpProxyPort;
    const host = this.config.httpProxyHost;

    // If not listening on all interfaces, return single URL
    if (host !== '0.0.0.0') {
      return [`http://${host}:${port}`];
    }

    // Get all network interfaces
    const nets = networkInterfaces();
    const urls: string[] = [];

    for (const name of Object.keys(nets)) {
      for (const net of nets[name] ?? []) {
        // Skip non-IPv4 addresses
        if (net.family === 'IPv4') {
          urls.push(`http://${net.address}:${port}`);
        }
      }
    }

    // Fallback to localhost if no interfaces found
    if (urls.length === 0) {
      urls.push(`http://127.0.0.1:${port}`);
    }

    return urls;
  }

  /**
   * Get the HTTP proxy port
   */
  getPort(): number {
    return this.config.httpProxyPort;
  }

  /**
   * Get traffic statistics for a specific connection
   */
  getConnectionStats(connectionId: number): ConnectionStats | undefined {
    return this.server?.getConnectionStats(connectionId);
  }

  /**
   * Get all active connection IDs
   */
  getActiveConnectionIds(): number[] {
    return this.server?.getConnectionIds() ?? [];
  }

  /**
   * Get hostname associated with a connection
   */
  getConnectionHostname(connectionId: number): string | undefined {
    return this.connectionHostnames.get(connectionId);
  }
}
