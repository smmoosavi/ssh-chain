/**
 * Console logging plugin for proxy events
 */

import type { ProxyPlugin, PluginContext } from '../types.ts';
import { logger } from '../logger.ts';
import { formatTimeOnly } from '../format-utils.ts';

/**
 * Plugin that logs proxy events to console
 */
export class ConsoleLoggerPlugin implements ProxyPlugin {
  readonly name = 'console-logger';
  private logLevel: 'debug' | 'info' | 'warn' | 'error';

  constructor(logLevel: 'debug' | 'info' | 'warn' | 'error' = 'info') {
    this.logLevel = logLevel;
  }

  private shouldLog(level: 'debug' | 'info' | 'warn' | 'error'): boolean {
    const levels = ['debug', 'info', 'warn', 'error'];
    return levels.indexOf(level) >= levels.indexOf(this.logLevel);
  }

  onRegister(ctx: PluginContext): void {
    // Log proxy requests
    ctx.onProxyEvent('request', (info) => {
      if (!this.shouldLog('info')) return;

      const timestamp = formatTimeOnly(info.timestamp);
      const directLabel = info.isDirect ? ' [DIRECT]' : '';
      const displayUrl = info.isHttps
        ? `${info.hostname}:${info.port}`
        : info.url;

      logger.info(`[${timestamp}] ${info.method} ${displayUrl}${directLabel}`);
    });

    // Log proxy errors
    ctx.onProxyEvent('error', (error, context) => {
      if (!this.shouldLog('error')) return;
      logger.error(
        `[Proxy] Error${context ? ` (${context})` : ''}: ${error.message}`,
      );
    });

    // Log proxy started
    ctx.onProxyEvent('started', (port, proxyUrl) => {
      if (!this.shouldLog('info')) return;
      logger.info(`[Proxy] HTTP proxy listening on ${proxyUrl}`);
    });

    // Log proxy stopped
    ctx.onProxyEvent('stopped', () => {
      if (!this.shouldLog('info')) return;
      logger.info('[Proxy] Stopped');
    });

    // Log SSH events
    ctx.onSSHEvent('ready', (port) => {
      if (!this.shouldLog('info')) return;
      logger.info(`[SSH] SOCKS5 proxy ready on port ${port}`);
    });

    ctx.onSSHEvent('error', (error) => {
      if (!this.shouldLog('error')) return;
      logger.error(`[SSH] Error: ${error.message}`);
    });

    ctx.onSSHEvent('exit', (code) => {
      if (!this.shouldLog('info')) return;
      logger.info(`[SSH] Process exited with code ${code}`);
    });

    ctx.onSSHEvent('restart', (count) => {
      if (!this.shouldLog('info')) return;
      logger.info(`[SSH] Restarted (total restarts: ${count})`);
    });

    ctx.onSSHEvent('stderr', (data) => {
      if (!this.shouldLog('debug')) return;
      logger.writeError(`[SSH] ${data}`);
    });
  }
}
