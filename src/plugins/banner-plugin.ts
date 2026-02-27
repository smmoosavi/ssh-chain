/**
 * Banner display plugin
 */

import type { ProxyPlugin, PluginContext } from '../types.ts';
import { box, statsBox } from '../box-utils.ts';
import { logger } from '../logger.ts';
import { formatBytes } from '../format-utils.ts';

/**
 * Plugin that provides a banner display
 */
export class BannerPlugin implements ProxyPlugin {
  readonly name = 'banner';
  private title: string;

  constructor(title: string = 'SSH Chain Proxy Manager') {
    this.title = title;
  }

  onRegister(ctx: PluginContext): void {
    // No events to subscribe to - banner is shown via public methods
  }

  /**
   * Print startup banner
   */
  printStartupBanner(): void {
    box(40).top().center(this.title).bottom().print();
    logger.emptyLine();
  }

  /**
   * Print running banner
   */
  printRunningBanner(proxyUrls: string[]): void {
    logger.emptyLine();
    const builder = box(48)
      .top()
      .left('Proxy is running! Configure your apps to use:');

    for (const url of proxyUrls) {
      builder.left(url);
    }

    builder.empty().left('Press Ctrl+C to stop').bottom().print();
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
      { key: 'Total Requests:', value: stats.totalRequests },
      { key: 'Unique Hosts:', value: stats.uniqueHosts },
      { key: 'Session Uptime:', value: stats.uptime },
      { key: 'SSH Restarts:', value: stats.restarts },
    ];

    if (stats.totalBytesIn !== undefined || stats.totalBytesOut !== undefined) {
      const bytesIn = stats.totalBytesIn ?? 0;
      const bytesOut = stats.totalBytesOut ?? 0;
      items.push(
        { key: 'Data Downloaded:', value: formatBytes(bytesIn) },
        { key: 'Data Uploaded:', value: formatBytes(bytesOut) },
        { key: 'Total Transfer:', value: formatBytes(bytesIn + bytesOut) },
      );
    }

    logger.raw(statsBox('Session Stats', items, 54));
  }

  /**
   * Print top hostnames
   */
  printTopHostnames(
    hosts: Array<{
      hostname: string;
      requests: number;
      bytesIn?: number;
      bytesOut?: number;
    }>,
  ): void {
    if (hosts.length === 0) return;

    logger.emptyLine();
    logger.raw('Top Hostnames:');
    for (const host of hosts) {
      const hasBytesInfo =
        host.bytesIn !== undefined || host.bytesOut !== undefined;
      if (hasBytesInfo) {
        const totalBytes = (host.bytesIn ?? 0) + (host.bytesOut ?? 0);
        logger.raw(
          `  ${host.hostname}: ${host.requests} requests (${formatBytes(totalBytes)})`,
        );
      } else {
        logger.raw(`  ${host.hostname}: ${host.requests} requests`);
      }
    }
  }
}
