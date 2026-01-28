/**
 * Plugin System for SSH Chain Proxy
 * Provides extensible plugins for logging, statistics, and reporting
 */

import type { Config } from "./config.ts";
import type { ProxyPlugin, PluginContext, ProxyRequestInfo, ProxyServerEvents, SSHManagerEvents } from "./types.ts";
import type { ProxyServer } from "./proxy-server.ts";
import type { SSHManager, SSHManagerState } from "./ssh-manager.ts";
import { box, statsBox, centeredBox } from "./box-utils.ts";
import { logger } from "./logger.ts";
import { valuesToGraph } from "./graph-utils.ts";

/**
 * Statistics tracking for proxy requests
 */
export interface ProxyStats {
  totalRequests: number;
  directRequests: number;
  proxiedRequests: number;
  totalBytesIn: number;
  totalBytesOut: number;
  hostnameStats: Map<string, {
    requests: number;
    directRequests: number;
    bytesIn: number;
    bytesOut: number;
    lastAccess: Date;
  }>;
}

/**
 * Plugin that collects statistics about proxy usage
 */
export class StatsPlugin implements ProxyPlugin {
  readonly name = "stats";
  private stats: ProxyStats = {
    totalRequests: 0,
    directRequests: 0,
    proxiedRequests: 0,
    totalBytesIn: 0,
    totalBytesOut: 0,
    hostnameStats: new Map(),
  };

  onRegister(ctx: PluginContext): void {
    ctx.onProxyEvent("request", (info) => {
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

    ctx.onProxyEvent("connectionClosed", (_connectionId, stats, hostname) => {
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
    activeConnections: Array<{ hostname: string; stats: { trgRxBytes: number | null; trgTxBytes: number | null } }>
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
    activeConnections: Array<{ hostname: string; stats: { trgRxBytes: number | null; trgTxBytes: number | null } }>,
    limit: number = 10
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

/**
 * Plugin that logs proxy events to console
 */
export class ConsoleLoggerPlugin implements ProxyPlugin {
  readonly name = "console-logger";
  private logLevel: "debug" | "info" | "warn" | "error";

  constructor(logLevel: "debug" | "info" | "warn" | "error" = "info") {
    this.logLevel = logLevel;
  }

  private shouldLog(level: "debug" | "info" | "warn" | "error"): boolean {
    const levels = ["debug", "info", "warn", "error"];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  onRegister(ctx: PluginContext): void {
    // Log proxy requests
    ctx.onProxyEvent("request", (info) => {
      if (!this.shouldLog("info")) return;

      const timestamp = info.timestamp.toISOString().slice(11, 19);
      const directLabel = info.isDirect ? " [DIRECT]" : "";
      const displayUrl = info.isHttps
        ? `${info.hostname}:${info.port}`
        : info.url;
      
      logger.info(`[${timestamp}] ${info.method} ${displayUrl}${directLabel}`);
    });

    // Log proxy errors
    ctx.onProxyEvent("error", (error, context) => {
      if (!this.shouldLog("error")) return;
      logger.error(`[Proxy] Error${context ? ` (${context})` : ""}: ${error.message}`);
    });

    // Log proxy started
    ctx.onProxyEvent("started", (port, proxyUrl) => {
      if (!this.shouldLog("info")) return;
      logger.info(`[Proxy] HTTP proxy listening on ${proxyUrl}`);
    });

    // Log proxy stopped
    ctx.onProxyEvent("stopped", () => {
      if (!this.shouldLog("info")) return;
      logger.info("[Proxy] Stopped");
    });

    // Log SSH events
    ctx.onSSHEvent("ready", (port) => {
      if (!this.shouldLog("info")) return;
      logger.info(`[SSH] SOCKS5 proxy ready on port ${port}`);
    });

    ctx.onSSHEvent("error", (error) => {
      if (!this.shouldLog("error")) return;
      logger.error(`[SSH] Error: ${error.message}`);
    });

    ctx.onSSHEvent("exit", (code) => {
      if (!this.shouldLog("info")) return;
      logger.info(`[SSH] Process exited with code ${code}`);
    });

    ctx.onSSHEvent("restart", (count) => {
      if (!this.shouldLog("info")) return;
      logger.info(`[SSH] Restarted (total restarts: ${count})`);
    });

    ctx.onSSHEvent("stderr", (data) => {
      if (!this.shouldLog("debug")) return;
      logger.writeError(`[SSH] ${data}`);
    });
  }
}

/**
 * Format bytes to human-readable string
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const units = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(1024));
  const value = bytes / Math.pow(1024, i);
  return `${value.toFixed(i > 0 ? 1 : 0)} ${units[i]}`;
}

/**
 * Plugin that provides a banner display
 */
export class BannerPlugin implements ProxyPlugin {
  readonly name = "banner";
  private title: string;

  constructor(title: string = "SSH Chain Proxy Manager") {
    this.title = title;
  }

  onRegister(ctx: PluginContext): void {
    // No events to subscribe to - banner is shown via public methods
  }

  /**
   * Print startup banner
   */
  printStartupBanner(): void {
    box(40)
      .top()
      .center(this.title)
      .bottom()
      .print();
    logger.emptyLine();
  }

  /**
   * Print running banner
   */
  printRunningBanner(proxyUrls: string[]): void {
    logger.emptyLine();
    const builder = box(48)
      .top()
      .left("Proxy is running! Configure your apps to use:");
    
    for (const url of proxyUrls) {
      builder.left(url);
    }
    
    builder
      .empty()
      .left("Press Ctrl+C to stop")
      .bottom()
      .print();
    logger.emptyLine();
  }

  /**
   * Print session stats on shutdown
   */
  printSessionStats(stats: {
    totalRequests: number;
    uniqueHosts: number;
    uptime: string;
    restarts: number;
    totalBytesIn?: number;
    totalBytesOut?: number;
  }): void {
    logger.emptyLine();
    const items: Array<{ key: string; value: string | number }> = [
      { key: "Total Requests:", value: stats.totalRequests },
      { key: "Unique Hosts:", value: stats.uniqueHosts },
      { key: "Session Uptime:", value: stats.uptime },
      { key: "SSH Restarts:", value: stats.restarts },
    ];
    
    if (stats.totalBytesIn !== undefined || stats.totalBytesOut !== undefined) {
      const bytesIn = stats.totalBytesIn ?? 0;
      const bytesOut = stats.totalBytesOut ?? 0;
      items.push(
        { key: "Data Downloaded:", value: formatBytes(bytesIn) },
        { key: "Data Uploaded:", value: formatBytes(bytesOut) },
        { key: "Total Transfer:", value: formatBytes(bytesIn + bytesOut) },
      );
    }
    
    logger.raw(statsBox("Session Stats", items, 54));
  }

  /**
   * Print top hostnames
   */
  printTopHostnames(hosts: Array<{ hostname: string; requests: number; bytesIn?: number; bytesOut?: number }>): void {
    if (hosts.length === 0) return;
    
    logger.emptyLine();
    logger.raw("Top Hostnames:");
    for (const host of hosts) {
      const hasBytesInfo = host.bytesIn !== undefined || host.bytesOut !== undefined;
      if (hasBytesInfo) {
        const totalBytes = (host.bytesIn ?? 0) + (host.bytesOut ?? 0);
        logger.raw(`  ${host.hostname}: ${host.requests} requests (${formatBytes(totalBytes)})`);
      } else {
        logger.raw(`  ${host.hostname}: ${host.requests} requests`);
      }
    }
  }
}

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
  readonly name = "byte-usage-history";
  private statsPlugin: StatsPlugin | null = null;
  private pluginManager: PluginManager | null = null;
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
    this.pluginManager = ctx as PluginManager;
    
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
  getTotalUsage(): { totalBytesIn: number; totalBytesOut: number; totalBytes: number } {
    if (!this.statsPlugin || !this.pluginManager) {
      return { totalBytesIn: 0, totalBytesOut: 0, totalBytes: 0 };
    }

    // Get active connection stats from plugin manager
    const activeConnections = this.pluginManager.getActiveConnectionStats();
    
    // Get stats including active connections from StatsPlugin
    const stats = this.statsPlugin.getStatsIncludingActive(
      activeConnections.map(c => ({
        hostname: c.hostname,
        stats: { trgRxBytes: c.stats.trgRxBytes, trgTxBytes: c.stats.trgTxBytes }
      }))
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
    return this.history.length > 0 ? this.history[this.history.length - 1] ?? null : null;
  }

  /**
   * Get average bytes per second over the history
   */
  getAverageBytesPerSecond(): { avgBytesIn: number; avgBytesOut: number; avgTotalBytes: number } {
    if (this.history.length === 0) {
      return { avgBytesIn: 0, avgBytesOut: 0, avgTotalBytes: 0 };
    }

    const sum = this.history.reduce(
      (acc, snapshot) => ({
        bytesIn: acc.bytesIn + snapshot.bytesIn,
        bytesOut: acc.bytesOut + snapshot.bytesOut,
        totalBytes: acc.totalBytes + snapshot.totalBytes,
      }),
      { bytesIn: 0, bytesOut: 0, totalBytes: 0 }
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
  getPeakBytesPerSecond(): { peakBytesIn: number; peakBytesOut: number; peakTotalBytes: number } {
    if (this.history.length === 0) {
      return { peakBytesIn: 0, peakBytesOut: 0, peakTotalBytes: 0 };
    }

    return this.history.reduce(
      (peak, snapshot) => ({
        peakBytesIn: Math.max(peak.peakBytesIn, snapshot.bytesIn),
        peakBytesOut: Math.max(peak.peakBytesOut, snapshot.bytesOut),
        peakTotalBytes: Math.max(peak.peakTotalBytes, snapshot.totalBytes),
      }),
      { peakBytesIn: 0, peakBytesOut: 0, peakTotalBytes: 0 }
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

/**
 * Plugin manager that coordinates all plugins
 */
export class PluginManager implements PluginContext {
  private plugins: Map<string, ProxyPlugin> = new Map();
  private proxyServer: ProxyServer | null = null;
  private sshManager: SSHManager | null = null;
  private config: Config | null = null;
  private eventCleanups: Map<string, Array<() => void>> = new Map();
  private currentPluginName: string | null = null;

  /**
   * Set the proxy server to subscribe to events
   */
  setProxyServer(proxy: ProxyServer): void {
    this.proxyServer = proxy;
  }

  /**
   * Set the SSH manager to subscribe to events
   */
  setSSHManager(ssh: SSHManager): void {
    this.sshManager = ssh;
  }

  /**
   * Set the config
   */
  setConfig(config: Config): void {
    this.config = config;
  }

  /**
   * Register a plugin
   */
  register(plugin: ProxyPlugin): this {
    if (this.plugins.has(plugin.name)) {
      throw new Error(`Plugin "${plugin.name}" is already registered`);
    }
    this.plugins.set(plugin.name, plugin);
    this.eventCleanups.set(plugin.name, []);
    this.currentPluginName = plugin.name;
    plugin.onRegister?.(this);
    this.currentPluginName = null;
    return this;
  }

  /**
   * Unregister a plugin
   */
  unregister(name: string): this {
    const plugin = this.plugins.get(name);
    if (plugin) {
      // Cleanup event listeners for this plugin
      const cleanups = this.eventCleanups.get(name);
      if (cleanups) {
        for (const cleanup of cleanups) {
          cleanup();
        }
        this.eventCleanups.delete(name);
      }
      plugin.onUnregister?.();
      this.plugins.delete(name);
    }
    return this;
  }

  /**
   * Get a registered plugin by name
   */
  get<T extends ProxyPlugin>(name: string): T | undefined {
    return this.plugins.get(name) as T | undefined;
  }

  /**
   * Check if a plugin is registered
   */
  has(name: string): boolean {
    return this.plugins.has(name);
  }

  /**
   * Get all registered plugin names
   */
  getPluginNames(): string[] {
    return Array.from(this.plugins.keys());
  }

  // PluginContext implementation

  onProxyEvent<K extends keyof ProxyServerEvents>(
    event: K,
    handler: (...args: ProxyServerEvents[K]) => void
  ): void {
    if (this.proxyServer) {
      const typedHandler = handler as (...args: unknown[]) => void;
      this.proxyServer.on(event, typedHandler);
      // Track for cleanup
      if (this.currentPluginName) {
        const cleanups = this.eventCleanups.get(this.currentPluginName);
        cleanups?.push(() => this.proxyServer?.off(event, typedHandler));
      }
    }
  }

  onSSHEvent<K extends keyof SSHManagerEvents>(
    event: K,
    handler: (...args: SSHManagerEvents[K]) => void
  ): void {
    if (this.sshManager) {
      const typedHandler = handler as (...args: unknown[]) => void;
      this.sshManager.on(event, typedHandler);
      // Track for cleanup
      if (this.currentPluginName) {
        const cleanups = this.eventCleanups.get(this.currentPluginName);
        cleanups?.push(() => this.sshManager?.off(event, typedHandler));
      }
    }
  }

  getConfig(): Config | null {
    return this.config;
  }

  getActiveConnectionStats(): Array<{ connectionId: number; hostname: string; stats: { srcTxBytes: number; srcRxBytes: number; trgTxBytes: number | null; trgRxBytes: number | null } }> {
    if (!this.proxyServer) return [];

    const result: Array<{ connectionId: number; hostname: string; stats: { srcTxBytes: number; srcRxBytes: number; trgTxBytes: number | null; trgRxBytes: number | null } }> = [];
    const connectionIds = this.proxyServer.getActiveConnectionIds();

    for (const connectionId of connectionIds) {
      const stats = this.proxyServer.getConnectionStats(connectionId);
      const hostname = this.proxyServer.getConnectionHostname(connectionId);
      if (stats && hostname) {
        result.push({ connectionId, hostname, stats });
      }
    }

    return result;
  }
}

/**
 * Plugin that displays a persistent footer with live stats
 */
export class FooterPlugin implements ProxyPlugin {
  readonly name = "footer";
  private intervalId: ReturnType<typeof setInterval> | null = null;
  private statsPlugin: StatsPlugin | null = null;
  private byteUsageHistoryPlugin: ByteUsageHistoryPlugin | null = null;
  private pluginManager: PluginManager | null = null;
  private sshHost: string = "";
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
    this.pluginManager = ctx as PluginManager;
    this.startTime = new Date();

    // Track SSH restarts
    ctx.onSSHEvent("restart", (count) => {
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
    if (!this.startTime) return "0m 0s";
    const seconds = Math.floor((Date.now() - this.startTime.getTime()) / 1000);
    const hours = Math.floor(seconds / 3600);
    const minutes = Math.floor((seconds % 3600) / 60);
    const secs = seconds % 60;
    
    if (hours > 0) {
      return `${hours}h ${minutes}m ${secs}s`;
    }
    return `${minutes}m ${secs}s`;
  }

  /**
   * Update the footer display
   */
  private updateFooter(): void {
    const lines: string[] = [];
    const width = 60;
    const divider = "─".repeat(width);
    
    // Line 1: Divider
    lines.push(divider);
    
    // Line 2: Connection info
    const connInfo = [`SSH: ${this.sshHost}`.padEnd(17), `HTTP Proxy: :${this.httpPort}`].join(" | ");
    lines.push(connInfo);
    
    
    // Line 3: SSH stats (active connections, ssh resets)
    const activeConns = this.pluginManager?.getActiveConnectionStats().length ?? 0;

    const sshLine = [
      `Active Con: ${activeConns}`.padEnd(17),
      `SSH Resets: ${this.sshRestarts}`.padEnd(17),
    ].join(" | ");
    lines.push(sshLine);

    // Line 4: Stats (uptime, total usage, speed)
    const totalUsage = this.byteUsageHistoryPlugin?.getTotalUsage() ?? { totalBytes: 0 };
    const history = this.byteUsageHistoryPlugin?.getHistory() ?? [];
    const lastSnapshot = history.length > 0 ? history[history.length - 1] : null;
    const lastSpeed = lastSnapshot ? lastSnapshot.totalBytes : 0;
    
    const statsLine = [
      `Uptime: ${this.formatUptime()}`.padEnd(17),
      `Total: ${formatBytes(totalUsage.totalBytes)}`.padEnd(17),
      `Speed: ${formatBytes(lastSpeed)}/s`.padEnd(17),
    ].join(" | ");
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
  private buildGraphLine(history: ReadonlyArray<ByteUsageSnapshot>, width: number): string {
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

/**
 * Create default plugins for standard functionality
 */
export function createDefaultPlugins(logLevel: "debug" | "info" | "warn" | "error" = "info"): ProxyPlugin[] {
  const statsPlugin = new StatsPlugin();
  const byteUsageHistoryPlugin = new ByteUsageHistoryPlugin();
  byteUsageHistoryPlugin.setStatsPlugin(statsPlugin);
  
  const footerPlugin = new FooterPlugin();
  footerPlugin.setPlugins(statsPlugin, byteUsageHistoryPlugin);
  
  return [
    statsPlugin,
    byteUsageHistoryPlugin,
    new ConsoleLoggerPlugin(logLevel),
    new BannerPlugin(),
    footerPlugin,
  ];
}
