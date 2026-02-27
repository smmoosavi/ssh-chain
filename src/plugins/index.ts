/**
 * Plugin System for SSH Chain Proxy
 * Provides extensible plugins for logging, statistics, and reporting
 */

// Export plugin classes
export { StatsPlugin, type ProxyStats } from './stats-plugin.ts';
export { ConsoleLoggerPlugin } from './logger-plugin.ts';
export { BannerPlugin } from './banner-plugin.ts';
export {
  ByteUsageHistoryPlugin,
  type ByteUsageSnapshot,
} from './byte-history-plugin.ts';
export { FooterPlugin } from './footer-plugin.ts';
export { PluginManager } from './plugin-manager.ts';

// Export factory functions
export { createDefaultPlugins } from './factory.ts';
