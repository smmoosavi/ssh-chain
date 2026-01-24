/**
 * HTTP Proxy Server
 * Provides an HTTP/HTTPS proxy interface that forwards to the SSH SOCKS5 tunnel
 */

import ProxyChain from "proxy-chain";
import type { Config } from "./config.ts";
import type { SSHManager } from "./ssh-manager.ts";

/**
 * Check if a domain matches any pattern in the direct domains list
 * Supports wildcards:
 * - *.example.com matches any subdomain of example.com
 * - foo-bar matches exact hostname (no TLD required)
 * - *.us matches all domains ending in .us TLD
 * - foo.example.com matches exact domain
 */
function shouldUseDirect(hostname: string, directDomains: string[]): boolean {
  if (directDomains.length === 0) {
    return false;
  }

  for (const pattern of directDomains) {
    // Exact match
    if (pattern === hostname) {
      return true;
    }

    // Wildcard pattern
    if (pattern.startsWith("*.")) {
      const suffix = pattern.slice(1); // Remove * but keep the dot
      // Match if hostname ends with the suffix (e.g., .example.com)
      if (hostname.endsWith(suffix)) {
        return true;
      }
      // Also match the domain itself without subdomain (e.g., example.com for *.example.com)
      if (hostname === suffix.slice(1)) {
        return true;
      }
    } else if (pattern.startsWith("*")) {
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

export interface ProxyStats {
  totalRequests: number;
  totalBytesIn: number;
  totalBytesOut: number;
  activeConnections: number;
  hostnameStats: Map<
    string,
    {
      requests: number;
      bytesIn: number;
      bytesOut: number;
      lastAccess: Date;
    }
  >;
}

export interface ProxyServerEvents {
  onRequest?: (hostname: string, method: string, url: string) => void;
  onConnect?: (hostname: string) => void;
  onError?: (error: Error) => void;
  onData?: (hostname: string, bytesIn: number, bytesOut: number) => void;
}

export class ProxyServer {
  private config: Config;
  private sshManager: SSHManager;
  private server: ProxyChain.Server | null = null;
  private events: ProxyServerEvents;
  private stats: ProxyStats = {
    totalRequests: 0,
    totalBytesIn: 0,
    totalBytesOut: 0,
    activeConnections: 0,
    hostnameStats: new Map(),
  };

  constructor(
    config: Config,
    sshManager: SSHManager,
    events: ProxyServerEvents = {}
  ) {
    this.config = config;
    this.sshManager = sshManager;
    this.events = events;
  }

  /**
   * Get current proxy statistics
   */
  getStats(): Readonly<ProxyStats> {
    return {
      ...this.stats,
      hostnameStats: new Map(this.stats.hostnameStats),
    };
  }

  /**
   * Update stats for a hostname
   */
  private updateHostnameStats(
    hostname: string,
    bytesIn: number = 0,
    bytesOut: number = 0
  ): void {
    const existing = this.stats.hostnameStats.get(hostname);

    if (existing) {
      existing.requests++;
      existing.bytesIn += bytesIn;
      existing.bytesOut += bytesOut;
      existing.lastAccess = new Date();
    } else {
      this.stats.hostnameStats.set(hostname, {
        requests: 1,
        bytesIn,
        bytesOut,
        lastAccess: new Date(),
      });
    }

    this.stats.totalRequests++;
    this.stats.totalBytesIn += bytesIn;
    this.stats.totalBytesOut += bytesOut;
  }

  /**
   * Extract hostname from URL or request
   */
  private extractHostname(url: string): string {
    try {
      // Handle CONNECT requests (hostname:port format)
      if (url.includes(":") && !url.includes("://")) {
        return url.split(":")[0] ?? url;
      }

      // Handle full URLs
      const urlObj = new URL(url);
      return urlObj.hostname;
    } catch {
      return url;
    }
  }

  /**
   * Start the HTTP proxy server
   */
  async start(): Promise<void> {
    const initialSocksUrl = this.sshManager.getSocksUrl();

    if (!initialSocksUrl) {
      throw new Error("SSH SOCKS5 proxy is not running");
    }

    console.log(`[Proxy] Starting HTTP proxy on port ${this.config.httpProxyPort}...`);
    console.log(`[Proxy] Upstream SOCKS5: ${initialSocksUrl}`);

    this.server = new ProxyChain.Server({
      port: this.config.httpProxyPort,
      host: "127.0.0.1",
      verbose: this.config.logLevel === "debug",

      prepareRequestFunction: ({ request, hostname, port, isHttp }) => {
        const targetHost = hostname || this.extractHostname(request.url || "");

        // Check if domain should bypass proxy
        const isDirect = shouldUseDirect(targetHost, this.config.directDomains);

        // Log the request
        const timestamp = new Date().toISOString().slice(11, 19);
        const method = request.method || "CONNECT";
        const displayUrl = isHttp
          ? request.url
          : `${targetHost}:${port}`;

        const directLabel = isDirect ? " [DIRECT]" : "";
        console.log(`[${timestamp}] ${method} ${displayUrl}${directLabel}`);

        // Update stats
        this.updateHostnameStats(targetHost);

        // Notify activity to SSH manager (only for proxied requests)
        if (!isDirect) {
          this.sshManager.updateActivity();
        }

        // Fire events
        if (isHttp) {
          this.events.onRequest?.(targetHost, method, request.url || "");
        } else {
          this.events.onConnect?.(targetHost);
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
          console.error(`[Proxy] SSH SOCKS5 proxy not available`);
          return { failMsg: "SSH SOCKS5 proxy not available" };
        }

        // Return upstream proxy configuration
        return {
          upstreamProxyUrl: currentSocksUrl,
          requestAuthentication: false,
        };
      },
    });

    // Note: connectionClosed event doesn't fire reliably for SOCKS5 tunneled HTTPS
    // connections, so byte tracking is not available with this architecture.
    // We only track request counts per hostname.

    this.server.on("requestFailed", ({ error }) => {
      console.error(`[Proxy] Request failed: ${error.message}`);
      this.events.onError?.(error);
    });

    await this.server.listen();

    console.log(`[Proxy] HTTP proxy listening on http://127.0.0.1:${this.config.httpProxyPort}`);
  }

  /**
   * Stop the HTTP proxy server
   */
  async stop(): Promise<void> {
    console.log("[Proxy] Stopping HTTP proxy server...");

    if (this.server) {
      await this.server.close(true);
      this.server = null;
    }

    console.log("[Proxy] Stopped");
  }

  /**
   * Get the proxy URL for clients to use
   */
  getProxyUrl(): string {
    return `http://127.0.0.1:${this.config.httpProxyPort}`;
  }

  /**
   * Get top hostnames by request count
   */
  getTopHostnames(limit: number = 10): Array<{
    hostname: string;
    requests: number;
    bytesIn: number;
    bytesOut: number;
  }> {
    return Array.from(this.stats.hostnameStats.entries())
      .map(([hostname, stats]) => ({
        hostname,
        ...stats,
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, limit);
  }
}
