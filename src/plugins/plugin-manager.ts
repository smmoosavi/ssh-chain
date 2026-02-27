/**
 * Plugin manager for coordinating all plugins
 */

import type { Config } from '../config.ts';
import type {
  ProxyPlugin,
  PluginContext,
  ProxyServerEvents,
  SSHManagerEvents,
  ConnectionStats,
} from '../types.ts';
import type { ProxyServer } from '../proxy-server.ts';
import type { SSHManager } from '../ssh-manager.ts';

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
    handler: (...args: ProxyServerEvents[K]) => void,
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
    handler: (...args: SSHManagerEvents[K]) => void,
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

  getActiveConnectionStats(): Array<{
    connectionId: number;
    hostname: string;
    stats: {
      srcTxBytes: number;
      srcRxBytes: number;
      trgTxBytes: number | null;
      trgRxBytes: number | null;
    };
  }> {
    if (!this.proxyServer) return [];

    const result: Array<{
      connectionId: number;
      hostname: string;
      stats: {
        srcTxBytes: number;
        srcRxBytes: number;
        trgTxBytes: number | null;
        trgRxBytes: number | null;
      };
    }> = [];
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
