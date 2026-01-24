/**
 * Plugin System for SSH Chain Proxy
 * Provides extensible plugins for logging, statistics, and reporting
 */

import type { Config } from "./config.ts";
import type { ProxyPlugin, PluginContext, ProxyRequestInfo, ProxyServerEvents, SSHManagerEvents } from "./types.ts";
import type { ProxyServer } from "./proxy-server.ts";
import type { SSHManager, SSHManagerState } from "./ssh-manager.ts";

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
          lastAccess: new Date(),
        });
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
  }> {
    return Array.from(this.stats.hostnameStats.entries())
      .map(([hostname, stats]) => ({
        hostname,
        requests: stats.requests,
        directRequests: stats.directRequests,
      }))
      .sort((a, b) => b.requests - a.requests)
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
      
      console.log(`[${timestamp}] ${info.method} ${displayUrl}${directLabel}`);
    });

    // Log proxy errors
    ctx.onProxyEvent("error", (error, context) => {
      if (!this.shouldLog("error")) return;
      console.error(`[Proxy] Error${context ? ` (${context})` : ""}: ${error.message}`);
    });

    // Log proxy started
    ctx.onProxyEvent("started", (port, proxyUrl) => {
      if (!this.shouldLog("info")) return;
      console.log(`[Proxy] HTTP proxy listening on ${proxyUrl}`);
    });

    // Log proxy stopped
    ctx.onProxyEvent("stopped", () => {
      if (!this.shouldLog("info")) return;
      console.log("[Proxy] Stopped");
    });

    // Log SSH events
    ctx.onSSHEvent("ready", (port) => {
      if (!this.shouldLog("info")) return;
      console.log(`[SSH] SOCKS5 proxy ready on port ${port}`);
    });

    ctx.onSSHEvent("error", (error) => {
      if (!this.shouldLog("error")) return;
      console.error(`[SSH] Error: ${error.message}`);
    });

    ctx.onSSHEvent("exit", (code) => {
      if (!this.shouldLog("info")) return;
      console.log(`[SSH] Process exited with code ${code}`);
    });

    ctx.onSSHEvent("restart", (count) => {
      if (!this.shouldLog("info")) return;
      console.log(`[SSH] Restarted (total restarts: ${count})`);
    });

    ctx.onSSHEvent("stderr", (data) => {
      if (!this.shouldLog("debug")) return;
      process.stderr.write(`[SSH] ${data}`);
    });
  }
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
    console.log("╔════════════════════════════════════════╗");
    console.log(`║       ${this.title.padEnd(31)} ║`);
    console.log("╚════════════════════════════════════════╝");
    console.log();
  }

  /**
   * Print running banner
   */
  printRunningBanner(proxyUrl: string): void {
    console.log();
    console.log("╔════════════════════════════════════════════════╗");
    console.log("║  Proxy is running! Configure your apps to use: ║");
    console.log(`║  ${proxyUrl.padEnd(45)} ║`);
    console.log("║                                                ║");
    console.log("║  Press Ctrl+C to stop                          ║");
    console.log("╚════════════════════════════════════════════════╝");
    console.log();
  }

  /**
   * Print session stats on shutdown
   */
  printSessionStats(stats: {
    totalRequests: number;
    uniqueHosts: number;
    uptime: string;
    restarts: number;
  }): void {
    console.log();
    console.log("╔════════════════════ Session Stats ═══════════════════╗");
    console.log(`║ Total Requests:  ${stats.totalRequests.toString().padStart(35)} ║`);
    console.log(`║ Unique Hosts:    ${stats.uniqueHosts.toString().padStart(35)} ║`);
    console.log(`║ Session Uptime:  ${stats.uptime.padStart(35)} ║`);
    console.log(`║ SSH Restarts:    ${stats.restarts.toString().padStart(35)} ║`);
    console.log("╚══════════════════════════════════════════════════════╝");
  }

  /**
   * Print top hostnames
   */
  printTopHostnames(hosts: Array<{ hostname: string; requests: number }>): void {
    if (hosts.length === 0) return;
    
    console.log();
    console.log("Top Hostnames:");
    for (const host of hosts) {
      console.log(`  ${host.hostname}: ${host.requests} requests`);
    }
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

  /**
   * Set the proxy server to subscribe to events
   */
  setProxyServer(proxy: ProxyServer): void {
    this.proxyServer = proxy;
    // Re-register all plugins with new event source
    for (const plugin of this.plugins.values()) {
      plugin.onRegister?.(this);
    }
  }

  /**
   * Set the SSH manager to subscribe to events
   */
  setSSHManager(ssh: SSHManager): void {
    this.sshManager = ssh;
    // Re-register all plugins with new event source
    for (const plugin of this.plugins.values()) {
      plugin.onRegister?.(this);
    }
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
    plugin.onRegister?.(this);
    return this;
  }

  /**
   * Unregister a plugin
   */
  unregister(name: string): this {
    const plugin = this.plugins.get(name);
    if (plugin) {
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
      this.proxyServer.on(event, handler as (...args: unknown[]) => void);
    }
  }

  onSSHEvent<K extends keyof SSHManagerEvents>(
    event: K,
    handler: (...args: SSHManagerEvents[K]) => void
  ): void {
    if (this.sshManager) {
      this.sshManager.on(event, handler as (...args: unknown[]) => void);
    }
  }

  getConfig(): Config | null {
    return this.config;
  }
}

/**
 * Create default plugins for standard functionality
 */
export function createDefaultPlugins(logLevel: "debug" | "info" | "warn" | "error" = "info"): ProxyPlugin[] {
  return [
    new StatsPlugin(),
    new ConsoleLoggerPlugin(logLevel),
    new BannerPlugin(),
  ];
}
