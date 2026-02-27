/**
 * HTTP Proxy Server
 * Provides an HTTP/HTTPS proxy interface that forwards to the SSH SOCKS5 tunnel
 * Emits events for extensibility via plugins
 */

import { networkInterfaces } from 'os';
import ProxyChain from 'proxy-chain';
import type { Config } from './config.ts';
import type { SSHManager } from './ssh-manager.ts';
import {
  TypedEventEmitter,
  type ProxyServerEvents,
  type ProxyRequestInfo,
  type ConnectionStats,
} from './types.ts';
import { shouldUseDirect } from './domain-matcher.ts';
import { extractHostname, extractPort } from './url-utils.ts';

export class ProxyServer extends TypedEventEmitter<ProxyServerEvents> {
  private config: Config;
  private sshManager: SSHManager;
  private server: ProxyChain.Server | null = null;
  /** Map connectionId to hostname for tracking */
  private connectionHostnames: Map<number, string> = new Map();
  /** Map connectionId to SSH port used for that connection */
  private connectionSshPorts: Map<number, number> = new Map();

  constructor(config: Config, sshManager: SSHManager) {
    super();
    this.config = config;
    this.sshManager = sshManager;
  }

  /**
   * Start the HTTP proxy server
   */
  async start(): Promise<void> {
    const initialSocksUrl = this.sshManager.getSocksUrl();

    if (!initialSocksUrl) {
      throw new Error('SSH SOCKS5 proxy is not running');
    }

    this.server = new ProxyChain.Server({
      port: this.config.httpProxyPort,
      host: this.config.httpProxyHost,
      verbose: this.config.logLevel === 'debug',

      prepareRequestFunction: ({
        request,
        hostname,
        port,
        isHttp,
        connectionId,
      }) => {
        const targetHost = hostname || extractHostname(request.url || '');
        const targetPort = port || extractPort(request.url || '', !isHttp);

        // Track connection hostname for stats
        this.connectionHostnames.set(connectionId, targetHost);

        // Check if domain should bypass proxy
        const isDirect = shouldUseDirect(targetHost, this.config.directDomains);

        const method = request.method || 'CONNECT';

        // Emit request event for plugins
        const requestInfo: ProxyRequestInfo = {
          connectionId,
          hostname: targetHost,
          port: targetPort,
          method,
          url: request.url || `${targetHost}:${targetPort}`,
          isHttps: !isHttp,
          isDirect,
          timestamp: new Date(),
        };
        this.emit('request', requestInfo);

        // Notify activity to SSH manager (only for proxied requests)
        if (!isDirect) {
          this.sshManager.updateActivity();
        }

        // If domain should go direct, return null to bypass proxy
        if (isDirect) {
          return {
            upstreamProxyUrl: undefined,
            requestAuthentication: false,
          };
        }

        // Get current SOCKS URL (may change if SSH restarts)
        const currentSocksUrl = this.sshManager.getSocksUrl();
        const currentSshPort = this.sshManager.getCurrentPort();

        if (!currentSocksUrl || !currentSshPort) {
          this.emit(
            'error',
            new Error('SSH SOCKS5 proxy not available'),
            'prepareRequest',
          );
          // Trigger SSH restart in background to recover from the error
          this.sshManager.restart().catch((error) => {
            this.emit(
              'error',
              new Error(`Failed to restart SSH: ${error.message}`),
              'sshRestart',
            );
          });
          return { failMsg: 'SSH SOCKS5 proxy not available' };
        }

        // Track which SSH port this connection is using
        this.connectionSshPorts.set(connectionId, currentSshPort);

        // Return upstream proxy configuration
        return {
          upstreamProxyUrl: currentSocksUrl,
          requestAuthentication: false,
        };
      },
    });

    // Listen for connection closed events to emit byte statistics
    this.server.on(
      'connectionClosed',
      ({
        connectionId,
        stats,
      }: {
        connectionId: number;
        stats: ConnectionStats;
      }) => {
        const hostname =
          this.connectionHostnames.get(connectionId) || 'unknown';
        this.connectionHostnames.delete(connectionId);
        this.connectionSshPorts.delete(connectionId);
        this.emit('connectionClosed', connectionId, stats, hostname);
      },
    );

    this.server.on('requestFailed', ({ error }) => {
      // Filter out "Only HTTP protocol is supported" errors - these occur when
      // misbehaving clients (like Microsoft telemetry) send direct HTTPS requests
      // instead of using the CONNECT method. This is expected and not actionable.
      if (error.message.includes('Only HTTP protocol is supported')) {
        return;
      }
      this.emit('error', error, 'requestFailed');
    });

    await this.server.listen();

    // Emit started event
    this.emit('started', this.config.httpProxyPort, this.getProxyUrl());
  }

  /**
   * Stop the HTTP proxy server
   */
  async stop(): Promise<void> {
    if (this.server) {
      await this.server.close(true);
      this.server = null;
    }
    this.connectionHostnames.clear();
    this.connectionSshPorts.clear();

    this.emit('stopped');
  }

  /**
   * Get the proxy URL for clients to use
   */
  getProxyUrl(): string {
    return `http://${this.config.httpProxyHost}:${this.config.httpProxyPort}`;
  }

  /**
   * Get all proxy URLs for clients to use
   * When listening on 0.0.0.0, returns URLs for all network interfaces
   */
  getProxyUrls(): string[] {
    const port = this.config.httpProxyPort;
    const host = this.config.httpProxyHost;

    // If not listening on all interfaces, return single URL
    if (host !== '0.0.0.0') {
      return [`http://${host}:${port}`];
    }

    // Get all network interfaces
    const nets = networkInterfaces();
    const urls: string[] = [];

    for (const name of Object.keys(nets)) {
      for (const net of nets[name] ?? []) {
        // Skip non-IPv4 addresses
        if (net.family === 'IPv4') {
          urls.push(`http://${net.address}:${port}`);
        }
      }
    }

    // Fallback to localhost if no interfaces found
    if (urls.length === 0) {
      urls.push(`http://127.0.0.1:${port}`);
    }

    return urls;
  }

  /**
   * Get the HTTP proxy port
   */
  getPort(): number {
    return this.config.httpProxyPort;
  }

  /**
   * Get traffic statistics for a specific connection
   */
  getConnectionStats(connectionId: number): ConnectionStats | undefined {
    return this.server?.getConnectionStats(connectionId);
  }

  /**
   * Get all active connection IDs
   */
  getActiveConnectionIds(): number[] {
    return this.server?.getConnectionIds() ?? [];
  }

  /**
   * Get hostname associated with a connection
   */
  getConnectionHostname(connectionId: number): string | undefined {
    return this.connectionHostnames.get(connectionId);
  }

  /**
   * Close a specific connection
   */
  closeConnection(connectionId: number): void {
    if (this.server) {
      this.server.closeConnection(connectionId);
    }
  }

  /**
   * Close all active connections
   * This is useful when SSH tunnel restarts - connections will break anyway,
   * so we close them explicitly so clients know immediately and can reconnect
   */
  closeAllConnections(): void {
    if (this.server) {
      const connectionIds = this.getActiveConnectionIds();
      this.emit('closingConnections', connectionIds.length);
      this.server.closeConnections();
    }
  }

  /**
   * Close connections that are using a specific SSH port
   * When an SSH tunnel is restarted, only connections using the old port are closed
   */
  closeConnectionsBySSHPort(sshPort: number): void {
    if (!this.server) return;

    const connectionsToClose: number[] = [];

    // Find all connections using this SSH port
    for (const [connectionId, port] of this.connectionSshPorts.entries()) {
      if (port === sshPort) {
        connectionsToClose.push(connectionId);
      }
    }

    if (connectionsToClose.length > 0) {
      this.emit('closingConnections', connectionsToClose.length);
      for (const connectionId of connectionsToClose) {
        this.server.closeConnection(connectionId);
      }
    }
  }
}
