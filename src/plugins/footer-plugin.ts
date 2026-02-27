/**
 * Footer display plugin with live stats
 */

import type { ProxyPlugin, PluginContext } from '../types.ts';
import type { StatsPlugin } from './stats-plugin.ts';
import type {
  ByteUsageHistoryPlugin,
  ByteUsageSnapshot,
} from './byte-history-plugin.ts';
import { logger } from '../logger.ts';
import { valuesToGraph } from '../graph-utils.ts';
import { formatBytes, formatSpeed, formatUptime } from '../format-utils.ts';

/**
 * Plugin that displays a persistent footer with live stats
 */
export class FooterPlugin implements ProxyPlugin {
  readonly name = 'footer';
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private statsPlugin: StatsPlugin | null = null;
  private byteUsageHistoryPlugin: ByteUsageHistoryPlugin | null = null;
  private pluginManager: PluginContext | null = null;
  private sshHost: string = '';
  private httpPort: number = 0;
  private startTime: Date | null = null;
  private sshRestarts: number = 0;
  private graphMaxValue: number;

  constructor(graphMaxValue: number = 6 * 1024 * 1024) {
    this.graphMaxValue = graphMaxValue;
  }

  /**
   * Set required plugins for data access
   */
  setPlugins(stats: StatsPlugin, byteUsage: ByteUsageHistoryPlugin): void {
    this.statsPlugin = stats;
    this.byteUsageHistoryPlugin = byteUsage;
  }

  /**
   * Set connection info
   */
  setConnectionInfo(sshHost: string, httpPort: number): void {
    this.sshHost = sshHost;
    this.httpPort = httpPort;
  }

  /**
   * Set maximum value for graph scaling
   */
  setGraphMaxValue(value: number): void {
    this.graphMaxValue = value;
  }

  onRegister(ctx: PluginContext): void {
    this.pluginManager = ctx;
    this.startTime = new Date();

    // Track SSH restarts
    ctx.onSSHEvent('restart', (count) => {
      this.sshRestarts = count;
    });
  }

  /**
   * Start the footer update interval
   */
  start(): void {
    if (this.intervalId) return;

    // Initial render
    this.updateFooter();

    // Update every second
    this.intervalId = setInterval(() => this.updateFooter(), 1000);
  }

  /**
   * Stop the footer updates
   */
  stop(): void {
    if (this.intervalId) {
      clearInterval(this.intervalId);
      this.intervalId = null;
    }
    logger.clearFooter();
  }

  onUnregister(): void {
    this.stop();
  }

  /**
   * Format uptime from start time
   */
  private formatUptime(): string {
    if (!this.startTime) return '0s';
    return formatUptime(this.startTime);
  }

  /**
   * Update the footer display
   */
  private updateFooter(): void {
    const lines: string[] = [];
    const width = 60;
    const divider = '─'.repeat(width);

    // Line 1: Divider
    lines.push(divider);

    // Line 2: Connection info
    const connInfo = [
      `SSH: ${this.sshHost}`.padEnd(17),
      `HTTP Proxy: :${this.httpPort}`,
    ].join(' | ');
    lines.push(connInfo);

    // Line 3: SSH stats (active connections, ssh resets)
    const activeConns =
      this.pluginManager?.getActiveConnectionStats().length ?? 0;

    const sshLine = [
      `Active Con: ${activeConns}`.padEnd(17),
      `SSH Resets: ${this.sshRestarts}`.padEnd(17),
    ].join(' | ');
    lines.push(sshLine);

    // Line 4: Stats (uptime, total usage, speed)
    const totalUsage = this.byteUsageHistoryPlugin?.getTotalUsage() ?? {
      totalBytes: 0,
    };
    const history = this.byteUsageHistoryPlugin?.getHistory() ?? [];
    const lastSnapshot =
      history.length > 0 ? history[history.length - 1] : null;
    const lastSpeed = lastSnapshot ? lastSnapshot.totalBytes : 0;

    const statsLine = [
      `Uptime: ${this.formatUptime()}`.padEnd(17),
      `Total: ${formatBytes(totalUsage.totalBytes)}`.padEnd(17),
      `Speed: ${formatSpeed(lastSpeed)}`.padEnd(17),
    ].join(' | ');
    lines.push(statsLine);

    // Line 5: Byte usage graph (last 60 seconds)
    const graphLine = this.buildGraphLine(history, width);
    lines.push(graphLine);
    lines.push(divider);

    logger.setFooter(lines);
  }

  /**
   * Build the graph line showing byte usage over time
   */
  private buildGraphLine(
    history: ReadonlyArray<ByteUsageSnapshot>,
    width: number,
  ): string {
    // Get last 60 values (or pad with zeros if less)
    const values: number[] = [];
    const targetLength = width;

    // Pad with zeros at the beginning if we don't have enough data
    const padding = Math.max(0, targetLength - history.length);
    for (let i = 0; i < padding; i++) {
      values.push(0);
    }

    // Add actual values
    const startIdx = Math.max(0, history.length - targetLength);
    for (let i = startIdx; i < history.length; i++) {
      values.push(history[i]?.totalBytes ?? 0);
    }

    // Use configured max value for consistent scaling
    const maxValue = this.graphMaxValue;

    // Build the graph using graph-utils
    return valuesToGraph(values, maxValue);
  }
}
