/**
 * Statistics tracking plugin for proxy usage
 */

import type { ProxyPlugin, PluginContext } from '../types.ts';

/**
 * Statistics tracking for proxy requests
 */
export interface ProxyStats {
  totalRequests: number;
  directRequests: number;
  proxiedRequests: number;
  totalBytesIn: number;
  totalBytesOut: number;
  hostnameStats: Map<
    string,
    {
      requests: number;
      directRequests: number;
      bytesIn: number;
      bytesOut: number;
      lastAccess: Date;
    }
  >;
}

/**
 * Plugin that collects statistics about proxy usage
 */
export class StatsPlugin implements ProxyPlugin {
  readonly name = 'stats';
  private stats: ProxyStats = {
    totalRequests: 0,
    directRequests: 0,
    proxiedRequests: 0,
    totalBytesIn: 0,
    totalBytesOut: 0,
    hostnameStats: new Map(),
  };

  onRegister(ctx: PluginContext): void {
    ctx.onProxyEvent('request', (info) => {
      this.stats.totalRequests++;
      if (info.isDirect) {
        this.stats.directRequests++;
      } else {
        this.stats.proxiedRequests++;
      }

      const existing = this.stats.hostnameStats.get(info.hostname);
      if (existing) {
        existing.requests++;
        if (info.isDirect) existing.directRequests++;
        existing.lastAccess = new Date();
      } else {
        this.stats.hostnameStats.set(info.hostname, {
          requests: 1,
          directRequests: info.isDirect ? 1 : 0,
          bytesIn: 0,
          bytesOut: 0,
          lastAccess: new Date(),
        });
      }
    });

    ctx.onProxyEvent('connectionClosed', (_connectionId, stats, hostname) => {
      // srcRxBytes = bytes received from client (client upload = our download)
      // trgRxBytes = bytes received from target (target download = our download)
      // srcTxBytes = bytes sent to client (client download)
      // trgTxBytes = bytes sent to target (target upload)

      // Total bytes in = what we received from target
      const bytesIn = stats.trgRxBytes ?? 0;
      // Total bytes out = what we sent to target
      const bytesOut = stats.trgTxBytes ?? 0;

      this.stats.totalBytesIn += bytesIn;
      this.stats.totalBytesOut += bytesOut;

      // Update per-hostname stats
      const hostnameStats = this.stats.hostnameStats.get(hostname);
      if (hostnameStats) {
        hostnameStats.bytesIn += bytesIn;
        hostnameStats.bytesOut += bytesOut;
      }
    });
  }

  /**
   * Get current statistics
   */
  getStats(): Readonly<ProxyStats> {
    return {
      ...this.stats,
      hostnameStats: new Map(this.stats.hostnameStats),
    };
  }

  /**
   * Get top hostnames by request count
   */
  getTopHostnames(limit: number = 10): Array<{
    hostname: string;
    requests: number;
    directRequests: number;
    bytesIn: number;
    bytesOut: number;
  }> {
    return Array.from(this.stats.hostnameStats.entries())
      .map(([hostname, stats]) => ({
        hostname,
        requests: stats.requests,
        directRequests: stats.directRequests,
        bytesIn: stats.bytesIn,
        bytesOut: stats.bytesOut,
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, limit);
  }

  /**
   * Get top hostnames by byte usage
   */
  getTopHostnamesByBytes(limit: number = 10): Array<{
    hostname: string;
    requests: number;
    bytesIn: number;
    bytesOut: number;
    totalBytes: number;
  }> {
    return Array.from(this.stats.hostnameStats.entries())
      .map(([hostname, stats]) => ({
        hostname,
        requests: stats.requests,
        bytesIn: stats.bytesIn,
        bytesOut: stats.bytesOut,
        totalBytes: stats.bytesIn + stats.bytesOut,
      }))
      .sort((a, b) => b.totalBytes - a.totalBytes)
      .slice(0, limit);
  }

  /**
   * Reset statistics
   */
  reset(): void {
    this.stats = {
      totalRequests: 0,
      directRequests: 0,
      proxiedRequests: 0,
      totalBytesIn: 0,
      totalBytesOut: 0,
      hostnameStats: new Map(),
    };
  }

  /**
   * Get statistics including active connections that haven't closed yet
   */
  getStatsIncludingActive(
    activeConnections: Array<{
      hostname: string;
      stats: { trgRxBytes: number | null; trgTxBytes: number | null };
    }>,
  ): Readonly<ProxyStats> {
    // Start with current stats
    let totalBytesIn = this.stats.totalBytesIn;
    let totalBytesOut = this.stats.totalBytesOut;
    const hostnameStats = new Map(this.stats.hostnameStats);

    // Add bytes from active connections
    for (const conn of activeConnections) {
      const bytesIn = conn.stats.trgRxBytes ?? 0;
      const bytesOut = conn.stats.trgTxBytes ?? 0;

      totalBytesIn += bytesIn;
      totalBytesOut += bytesOut;

      const existing = hostnameStats.get(conn.hostname);
      if (existing) {
        hostnameStats.set(conn.hostname, {
          ...existing,
          bytesIn: existing.bytesIn + bytesIn,
          bytesOut: existing.bytesOut + bytesOut,
        });
      }
    }

    return {
      totalRequests: this.stats.totalRequests,
      directRequests: this.stats.directRequests,
      proxiedRequests: this.stats.proxiedRequests,
      totalBytesIn,
      totalBytesOut,
      hostnameStats,
    };
  }

  /**
   * Get top hostnames including active connections
   */
  getTopHostnamesIncludingActive(
    activeConnections: Array<{
      hostname: string;
      stats: { trgRxBytes: number | null; trgTxBytes: number | null };
    }>,
    limit: number = 10,
  ): Array<{
    hostname: string;
    requests: number;
    directRequests: number;
    bytesIn: number;
    bytesOut: number;
  }> {
    const stats = this.getStatsIncludingActive(activeConnections);
    return Array.from(stats.hostnameStats.entries())
      .map(([hostname, s]) => ({
        hostname,
        requests: s.requests,
        directRequests: s.directRequests,
        bytesIn: s.bytesIn,
        bytesOut: s.bytesOut,
      }))
      .sort((a, b) => b.requests - a.requests)
      .slice(0, limit);
  }
}
