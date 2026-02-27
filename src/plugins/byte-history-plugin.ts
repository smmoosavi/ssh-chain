/**
 * Byte usage history tracking plugin
 */

import type { ProxyPlugin, PluginContext } from '../types.ts';
import type { StatsPlugin } from './stats-plugin.ts';

/**
 * Byte usage snapshot for a single second
 */
export interface ByteUsageSnapshot {
  timestamp: Date;
  bytesIn: number;
  bytesOut: number;
  totalBytes: number;
}

/**
 * Plugin that tracks byte usage history per second for the last 60 seconds
 * and provides total usage including active connections
 */
export class ByteUsageHistoryPlugin implements ProxyPlugin {
  readonly name = 'byte-usage-history';
  private statsPlugin: StatsPlugin | null = null;
  private pluginManager: PluginContext | null = null;
  private history: ByteUsageSnapshot[] = [];
  private lastTotalBytesIn: number = 0;
  private lastTotalBytesOut: number = 0;
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private readonly historyLength: number;

  constructor(historyLength: number = 60) {
    this.historyLength = historyLength;
  }

  onRegister(ctx: PluginContext): void {
    // Store context for later use
    this.pluginManager = ctx;

    // Start the interval to collect stats every second
    this.intervalId = setInterval(() => this.collectSnapshot(), 1000);
  }

  onUnregister(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
  }

  /**
   * Set the stats plugin to get data from
   */
  setStatsPlugin(statsPlugin: StatsPlugin): void {
    this.statsPlugin = statsPlugin;
  }

  /**
   * Collect a snapshot of current byte usage
   */
  private collectSnapshot(): void {
    const { totalBytesIn, totalBytesOut } = this.getTotalUsage();

    // Calculate bytes transferred in this second
    const bytesIn = totalBytesIn - this.lastTotalBytesIn;
    const bytesOut = totalBytesOut - this.lastTotalBytesOut;

    // Update last totals
    this.lastTotalBytesIn = totalBytesIn;
    this.lastTotalBytesOut = totalBytesOut;

    // Add snapshot to history
    this.history.push({
      timestamp: new Date(),
      bytesIn,
      bytesOut,
      totalBytes: bytesIn + bytesOut,
    });

    // Trim history to keep only last N seconds
    while (this.history.length > this.historyLength) {
      this.history.shift();
    }
  }

  /**
   * Get total byte usage including active connections
   */
  getTotalUsage(): {
    totalBytesIn: number;
    totalBytesOut: number;
    totalBytes: number;
  } {
    if (!this.statsPlugin || !this.pluginManager) {
      return { totalBytesIn: 0, totalBytesOut: 0, totalBytes: 0 };
    }

    // Get active connection stats from plugin manager
    const activeConnections = this.pluginManager.getActiveConnectionStats();

    // Get stats including active connections from StatsPlugin
    const stats = this.statsPlugin.getStatsIncludingActive(
      activeConnections.map(
        (c: {
          connectionId: number;
          hostname: string;
          stats: {
            srcTxBytes: number;
            srcRxBytes: number;
            trgTxBytes: number | null;
            trgRxBytes: number | null;
          };
        }) => ({
          hostname: c.hostname,
          stats: {
            trgRxBytes: c.stats.trgRxBytes,
            trgTxBytes: c.stats.trgTxBytes,
          },
        }),
      ),
    );

    return {
      totalBytesIn: stats.totalBytesIn,
      totalBytesOut: stats.totalBytesOut,
      totalBytes: stats.totalBytesIn + stats.totalBytesOut,
    };
  }

  /**
   * Get byte usage history for the last N seconds
   */
  getHistory(): ReadonlyArray<ByteUsageSnapshot> {
    return [...this.history];
  }

  /**
   * Get the most recent snapshot
   */
  getLatestSnapshot(): ByteUsageSnapshot | null {
    return this.history.length > 0
      ? (this.history[this.history.length - 1] ?? null)
      : null;
  }

  /**
   * Get average bytes per second over the history
   */
  getAverageBytesPerSecond(): {
    avgBytesIn: number;
    avgBytesOut: number;
    avgTotalBytes: number;
  } {
    if (this.history.length === 0) {
      return { avgBytesIn: 0, avgBytesOut: 0, avgTotalBytes: 0 };
    }

    const sum = this.history.reduce(
      (acc, snapshot) => ({
        bytesIn: acc.bytesIn + snapshot.bytesIn,
        bytesOut: acc.bytesOut + snapshot.bytesOut,
        totalBytes: acc.totalBytes + snapshot.totalBytes,
      }),
      { bytesIn: 0, bytesOut: 0, totalBytes: 0 },
    );

    return {
      avgBytesIn: sum.bytesIn / this.history.length,
      avgBytesOut: sum.bytesOut / this.history.length,
      avgTotalBytes: sum.totalBytes / this.history.length,
    };
  }

  /**
   * Get peak bytes per second from history
   */
  getPeakBytesPerSecond(): {
    peakBytesIn: number;
    peakBytesOut: number;
    peakTotalBytes: number;
  } {
    if (this.history.length === 0) {
      return { peakBytesIn: 0, peakBytesOut: 0, peakTotalBytes: 0 };
    }

    return this.history.reduce(
      (peak, snapshot) => ({
        peakBytesIn: Math.max(peak.peakBytesIn, snapshot.bytesIn),
        peakBytesOut: Math.max(peak.peakBytesOut, snapshot.bytesOut),
        peakTotalBytes: Math.max(peak.peakTotalBytes, snapshot.totalBytes),
      }),
      { peakBytesIn: 0, peakBytesOut: 0, peakTotalBytes: 0 },
    );
  }

  /**
   * Reset history and counters
   */
  reset(): void {
    this.history = [];
    this.lastTotalBytesIn = 0;
    this.lastTotalBytesOut = 0;
  }
}
