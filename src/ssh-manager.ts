/**
 * SSH SOCKS5 Proxy Manager
 * Spawns and manages SSH -D processes for SOCKS5 proxy tunnels
 * Emits events for extensibility via plugins
 */

import type { Config, SSHServerConfig } from './config.ts';
import { spawn, type ChildProcess } from 'node:child_process';
import { createConnection } from 'node:net';
import { TypedEventEmitter, type SSHManagerEvents } from './types.ts';
import { logger } from './logger.ts';
import { sleep } from './async-utils.ts';

export interface SSHManagerState {
  isRunning: boolean;
  currentPort: number | null;
  startTime: Date | null;
  lastActivity: Date | null;
  restartCount: number;
  bytesTransferred: number;
}

export class SSHManager extends TypedEventEmitter<SSHManagerEvents> {
  private config: Config;
  private process: ChildProcess | null = null;
  private processExited: Promise<number | null> | null = null;
  private state: SSHManagerState = {
    isRunning: false,
    currentPort: null,
    startTime: null,
    lastActivity: null,
    restartCount: 0,
    bytesTransferred: 0,
  };
  private usedPorts: Set<number> = new Set();
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private inactivityCheckTimer: ReturnType<typeof setInterval> | null = null;
  private isRestarting: boolean = false;

  constructor(config: Config) {
    super();
    this.config = config;
  }

  /**
   * Get the current state of the SSH manager
   */
  getState(): Readonly<SSHManagerState> {
    return { ...this.state };
  }

  /**
   * Get the SOCKS5 proxy URL
   */
  getSocksUrl(): string | null {
    if (!this.state.isRunning || !this.state.currentPort) {
      return null;
    }
    return `socks5://127.0.0.1:${this.state.currentPort}`;
  }

  /**
   * Pick a random available port from the configured range
   */
  private pickPort(): number {
    const { min, max } = this.config.portRange;
    const range = max - min + 1;

    // Try random ports first
    for (let i = 0; i < 10; i++) {
      const port = min + Math.floor(Math.random() * range);
      if (!this.usedPorts.has(port)) {
        return port;
      }
    }

    // Fallback to sequential search
    for (let port = min; port <= max; port++) {
      if (!this.usedPorts.has(port)) {
        return port;
      }
    }

    throw new Error(`No available ports in range ${min}-${max}`);
  }

  /**
   * Build SSH command arguments
   */
  private buildSSHArgs(port: number): string[] {
    const ssh = this.config.sshServer;
    const args: string[] = [];

    // Dynamic port forwarding
    args.push('-D', `127.0.0.1:${port}`);

    // Don't execute remote command, just forward
    args.push('-N');

    // Exit if forwarding setup fails
    args.push('-o', 'ExitOnForwardFailure=yes');

    // Keep connection alive
    args.push('-o', 'ServerAliveInterval=30');
    args.push('-o', 'ServerAliveCountMax=3');

    // Verbose for debugging (we'll parse this to detect ready state)
    args.push('-v');

    // Port (if not default)
    if (ssh.port && ssh.port !== 22) {
      args.push('-p', String(ssh.port));
    }

    // Identity file
    if (ssh.identityFile) {
      args.push('-i', ssh.identityFile);
    }

    // Additional options
    if (ssh.options) {
      for (const opt of ssh.options) {
        args.push('-o', opt);
      }
    }

    // Build destination
    let destination = ssh.host;
    if (ssh.username) {
      destination = `${ssh.username}@${ssh.host}`;
    }
    args.push(destination);

    return args;
  }

  /**
   * Start the SSH SOCKS5 proxy
   */
  async start(): Promise<void> {
    if (this.state.isRunning) {
      logger.info('[SSH] Already running, skipping start');
      return;
    }

    const maxAttempts = this.config.retryAttempts + 1; // +1 for initial attempt
    let attempt = 1;
    let lastError: string | undefined;

    while (attempt <= maxAttempts) {
      try {
        logger.info(
          `[SSH] Starting SOCKS5 proxy (attempt ${attempt}/${maxAttempts})...`,
        );

        const success = await this.attemptStart();

        if (success) {
          if (attempt > 1) {
            logger.info(`[SSH] Successfully started after ${attempt} attempts`);
          }
          return;
        }

        // If we get here, attemptStart returned false (shouldn't happen with current implementation)
        lastError = 'Start attempt returned false';
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        logger.warn(
          `[SSH] Attempt ${attempt}/${maxAttempts} failed: ${lastError}`,
        );
      }

      // Clean up failed attempt
      await this.cleanup();

      attempt++;

      if (attempt <= maxAttempts) {
        const delay = Math.min(1000 * Math.pow(2, attempt - 2), 10000); // Exponential backoff, max 10s
        logger.info(`[SSH] Waiting ${delay}ms before retry...`);
        await sleep(delay);
      }
    }

    // All attempts failed
    throw new Error(
      `Failed to start SSH proxy after ${maxAttempts} attempts. Last error: ${lastError}`,
    );
  }

  /**
   * Attempt to start the SSH SOCKS5 proxy once
   */
  private async attemptStart(): Promise<boolean> {
    const port = this.pickPort();
    this.usedPorts.add(port);
    this.state.currentPort = port;

    logger.info(`[SSH] Starting SOCKS5 proxy on port ${port}...`);

    const args = this.buildSSHArgs(port);
    logger.info(`[SSH] Command: ssh ${args.join(' ')}`);

    this.process = spawn('ssh', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Create a promise for process exit
    this.processExited = new Promise<number | null>((resolve) => {
      this.process?.on('exit', (code) => resolve(code));
      this.process?.on('error', () => resolve(null));
    });

    this.state.isRunning = true;
    this.state.startTime = new Date();
    this.state.lastActivity = new Date();

    // Monitor stderr for SSH messages (SSH outputs to stderr in verbose mode)
    this.monitorOutput();

    // Wait for SSH to be ready
    const result = await this.waitForReady(port);

    if (!result.success) {
      throw new Error(result.error || 'Unknown error during SSH startup');
    }

    // Start health checks
    this.startHealthChecks();

    return true;
  }

  /**
   * Monitor SSH process output
   */
  private monitorOutput(): void {
    if (!this.process) return;

    // SSH verbose output goes to stderr
    const stderr = this.process.stderr;
    if (stderr) {
      stderr.setEncoding('utf-8');
      stderr.on('data', (text: string) => {
        this.emit('stderr', text);

        // Check for activity indicators in SSH debug output
        if (
          text.includes('Entering interactive session') ||
          text.includes('channel') ||
          text.includes('data')
        ) {
          this.updateActivity();
        }
      });
    }

    // Monitor process exit
    this.processExited?.then((code) => {
      this.state.isRunning = false;
      this.emit('exit', code);

      if (this.state.currentPort) {
        this.usedPorts.delete(this.state.currentPort);
      }
    });
  }

  /**
   * Wait for SSH tunnel to be ready by attempting a test connection
   */
  private async waitForReady(
    port: number,
    timeout: number = 30000,
  ): Promise<{ success: boolean; error?: string }> {
    const startTime = Date.now();
    const checkInterval = 500;

    while (Date.now() - startTime < timeout) {
      // Check if process died
      if (!this.state.isRunning || !this.process) {
        return {
          success: false,
          error: 'SSH process died before becoming ready',
        };
      }

      // Try to connect to the SOCKS5 proxy
      const connected = await new Promise<boolean>((resolve) => {
        const socket = createConnection({ host: '127.0.0.1', port }, () => {
          socket.end();
          resolve(true);
        });
        socket.on('error', () => resolve(false));
        socket.setTimeout(1000, () => {
          socket.destroy();
          resolve(false);
        });
      });

      if (connected) {
        // Connection successful, proxy is ready
        this.emit('ready', port);
        return { success: true };
      }

      // Not ready yet, wait and retry
      await sleep(checkInterval);
    }

    return {
      success: false,
      error: `SSH SOCKS5 proxy failed to start within ${timeout}ms`,
    };
  }

  /**
   * Clean up failed SSH attempt
   */
  private async cleanup(): Promise<void> {
    // Clear running state
    this.state.isRunning = false;

    // Kill process if still running
    if (this.process && !this.process.killed) {
      this.process.kill('SIGTERM');

      // Wait a bit for graceful shutdown
      setTimeout(() => {
        if (this.process && !this.process.killed) {
          this.process.kill('SIGKILL');
        }
      }, 2000);
    }

    // Clear process reference
    this.process = null;
    this.processExited = null;

    // Free up the port
    if (this.state.currentPort) {
      this.usedPorts.delete(this.state.currentPort);
      this.state.currentPort = null;
    }

    // Stop timers
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }

    if (this.inactivityCheckTimer) {
      clearInterval(this.inactivityCheckTimer);
      this.inactivityCheckTimer = null;
    }
  }

  /**
   * Update last activity timestamp
   */
  updateActivity(bytes: number = 0): void {
    this.state.lastActivity = new Date();
    this.emit('activity');
    if (bytes > 0) {
      this.state.bytesTransferred += bytes;
      this.emit('data', bytes);
    }
  }

  /**
   * Start health check timers
   */
  private startHealthChecks(): void {
    // Check for inactivity
    if (this.config.inactivityTimeout > 0) {
      this.inactivityCheckTimer = setInterval(() => {
        if (!this.state.lastActivity) return;

        const elapsed = Date.now() - this.state.lastActivity.getTime();
        const timeoutMs = this.config.inactivityTimeout * 1000;

        if (elapsed > timeoutMs) {
          this.restart();
        }
      }, 5000);
      // Unref so this timer doesn't prevent process exit
      if (typeof this.inactivityCheckTimer.unref === 'function') {
        this.inactivityCheckTimer.unref();
      }
    }
  }

  /**
   * Stop health check timers
   */
  private stopHealthChecks(): void {
    if (this.healthCheckTimer) {
      clearInterval(this.healthCheckTimer);
      this.healthCheckTimer = null;
    }
    if (this.inactivityCheckTimer) {
      clearInterval(this.inactivityCheckTimer);
      this.inactivityCheckTimer = null;
    }
  }

  /**
   * Stop the SSH process
   */
  async stop(): Promise<void> {
    this.stopHealthChecks();

    if (this.process && !this.process.killed) {
      // Try graceful shutdown first (SIGTERM)
      this.process.kill('SIGTERM');

      // Wait up to 2 seconds for graceful exit
      const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2000));
      const exited = this.processExited?.then(() => {}) ?? Promise.resolve();

      await Promise.race([exited, timeout]);

      // Force kill if still running
      if (this.process && !this.process.killed) {
        this.process.kill('SIGKILL');
        // Give it a brief moment to die
        await Promise.race([
          this.processExited ?? Promise.resolve(),
          new Promise((resolve) => setTimeout(resolve, 500)),
        ]);
      }
    }

    this.process = null;
    this.processExited = null;

    if (this.state.currentPort) {
      this.usedPorts.delete(this.state.currentPort);
    }

    this.state.isRunning = false;
    this.state.currentPort = null;
    this.state.startTime = null;
  }

  /**
   * Restart the SSH process
   */
  async restart(): Promise<void> {
    // Skip if already restarting
    if (this.isRestarting) {
      logger.info('[SSH] Restart already in progress, skipping');
      return;
    }

    this.isRestarting = true;
    try {
      this.state.restartCount++;
      this.emit('restart', this.state.restartCount);

      await this.stop();
      await sleep(1000); // Brief delay before restart
      await this.start();
    } finally {
      this.isRestarting = false;
    }
  }
}
