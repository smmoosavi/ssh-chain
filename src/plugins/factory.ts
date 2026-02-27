/**
 * Factory functions for creating plugin instances
 */

import type { ProxyPlugin } from '../types.ts';
import { StatsPlugin } from './stats-plugin.ts';
import { ByteUsageHistoryPlugin } from './byte-history-plugin.ts';
import { ConsoleLoggerPlugin } from './logger-plugin.ts';
import { BannerPlugin } from './banner-plugin.ts';
import { FooterPlugin } from './footer-plugin.ts';

/**
 * Create default plugins for standard functionality
 */
export function createDefaultPlugins(
  logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info',
): ProxyPlugin[] {
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
