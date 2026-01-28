/**
 * App Class - Main application coordinator
 * Uses composition to bring together all components
 */

import type { Config } from "./config.ts";
import { SSHManager } from "./ssh-manager.ts";
import { ProxyServer } from "./proxy-server.ts";
import { PluginManager, StatsPlugin, BannerPlugin } from "./plugins.ts";
import type { ProxyPlugin } from "./types.ts";

export interface AppOptions {
  /** Configuration */
  config: Config;
  /** Optional custom SSH manager */
  sshManager?: SSHManager;
  /** Optional custom proxy server */
  proxyServer?: ProxyServer;
  /** Plugins to register */
  plugins?: ProxyPlugin[];
}

/**
 * Main application class that coordinates SSH tunnel and HTTP proxy
 */
export class App {
  private config: Config;
  private sshManager: SSHManager;
  private proxyServer: ProxyServer;
  private pluginManager: PluginManager;
  private isRunning = false;
  private isShuttingDown = false;

  constructor(options: AppOptions) {
    this.config = options.config;
    this.pluginManager = new PluginManager();
    this.pluginManager.setConfig(this.config);

    // Use provided managers or create defaults
    this.sshManager = options.sshManager ?? new SSHManager(this.config);
    this.proxyServer = options.proxyServer ?? new ProxyServer(this.config, this.sshManager);

    // Wire up plugin manager
    this.pluginManager.setSSHManager(this.sshManager);
    this.pluginManager.setProxyServer(this.proxyServer);

    // Register plugins
    if (options.plugins) {
      for (const plugin of options.plugins) {
        this.pluginManager.register(plugin);
      }
    }
  }

  /**
   * Get the plugin manager for registering custom plugins
   */
  getPluginManager(): PluginManager {
    return this.pluginManager;
  }

  /**
   * Get the SSH manager
   */
  getSSHManager(): SSHManager {
    return this.sshManager;
  }

  /**
   * Get the proxy server
   */
  getProxyServer(): ProxyServer {
    return this.proxyServer;
  }

  /**
   * Get the config
   */
  getConfig(): Config {
    return this.config;
  }

  /**
   * Get a registered plugin by name
   */
  getPlugin<T extends ProxyPlugin>(name: string): T | undefined {
    return this.pluginManager.get<T>(name);
  }

  /**
   * Start the application
   */
  async start(): Promise<void> {
    if (this.isRunning) {
      throw new Error("App is already running");
    }

    // Start SSH tunnel first
    await this.sshManager.start();

    // Then start HTTP proxy
    await this.proxyServer.start();

    this.isRunning = true;
  }

  /**
   * Stop the application
   */
  async stop(): Promise<void> {
    if (!this.isRunning || this.isShuttingDown) {
      return;
    }

    this.isShuttingDown = true;

    try {
      await this.proxyServer.stop();
      await this.sshManager.stop();
    } finally {
      this.isRunning = false;
      this.isShuttingDown = false;
    }
  }

  /**
   * Check if the app is running
   */
  isAppRunning(): boolean {
    return this.isRunning;
  }

  /**
   * Get proxy URL for client configuration
   */
  getProxyUrl(): string {
    return this.proxyServer.getProxyUrl();
  }

  /**
   * Get all proxy URLs for client configuration
   * When listening on 0.0.0.0, returns URLs for all network interfaces
   */
  getProxyUrls(): string[] {
    return this.proxyServer.getProxyUrls();
  }

  /**
   * Get session statistics (if stats plugin is registered)
   */
  getSessionStats(): {
    totalRequests: number;
    uniqueHosts: number;
    uptime: string;
    restarts: number;
    topHostnames: Array<{ hostname: string; requests: number }>;
  } {
    const statsPlugin = this.pluginManager.get<StatsPlugin>("stats");
    const sshState = this.sshManager.getState();

    // Calculate uptime
    const uptime = sshState.startTime
      ? Math.floor((Date.now() - sshState.startTime.getTime()) / 1000)
      : 0;
    const uptimeStr = `${Math.floor(uptime / 60)}m ${uptime % 60}s`;

    if (statsPlugin) {
      const stats = statsPlugin.getStats();
      return {
        totalRequests: stats.totalRequests,
        uniqueHosts: stats.hostnameStats.size,
        uptime: uptimeStr,
        restarts: sshState.restartCount,
        topHostnames: statsPlugin.getTopHostnames(5),
      };
    }

    return {
      totalRequests: 0,
      uniqueHosts: 0,
      uptime: uptimeStr,
      restarts: sshState.restartCount,
      topHostnames: [],
    };
  }

  /**
   * Get session statistics including active connections that haven't closed yet
   * Use this during shutdown to get accurate byte totals
   */
  getSessionStatsIncludingActive(): {
    totalRequests: number;
    uniqueHosts: number;
    uptime: string;
    restarts: number;
    totalBytesIn: number;
    totalBytesOut: number;
    topHostnames: Array<{ hostname: string; requests: number; bytesIn: number; bytesOut: number }>;
  } {
    const statsPlugin = this.pluginManager.get<StatsPlugin>("stats");
    const sshState = this.sshManager.getState();

    // Calculate uptime
    const uptime = sshState.startTime
      ? Math.floor((Date.now() - sshState.startTime.getTime()) / 1000)
      : 0;
    const uptimeStr = `${Math.floor(uptime / 60)}m ${uptime % 60}s`;

    if (statsPlugin) {
      const activeConns = this.pluginManager.getActiveConnectionStats();
      const stats = statsPlugin.getStatsIncludingActive(activeConns);
      const topHostnames = statsPlugin.getTopHostnamesIncludingActive(activeConns, 5);
      return {
        totalRequests: stats.totalRequests,
        uniqueHosts: stats.hostnameStats.size,
        uptime: uptimeStr,
        restarts: sshState.restartCount,
        totalBytesIn: stats.totalBytesIn,
        totalBytesOut: stats.totalBytesOut,
        topHostnames,
      };
    }

    return {
      totalRequests: 0,
      uniqueHosts: 0,
      uptime: uptimeStr,
      restarts: sshState.restartCount,
      totalBytesIn: 0,
      totalBytesOut: 0,
      topHostnames: [],
    };
  }
}

/**
 * Create an App with standard configuration
 */
export function createApp(config: Config, plugins?: ProxyPlugin[]): App {
  return new App({
    config,
    plugins,
  });
}
