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

/**
 * Handle for a single SSH connection
 * Encapsulates all state and control for one SSH process
 */
export class SSHHandle {
  readonly port: number;
  readonly process: ChildProcess;
  readonly processExited: Promise<number | null>;
  readonly startTime: Date;

  private _isRunning: boolean = true;
  private _lastActivity: Date;
  private _bytesTransferred: number = 0;

  constructor(port: number, process: ChildProcess) {
    this.port = port;
    this.process = process;
    this.startTime = new Date();
    this._lastActivity = new Date();

    // Create a promise for process exit
    this.processExited = new Promise<number | null>((resolve) => {
      process.on('exit', (code) => {
        this._isRunning = false;
        resolve(code);
      });
      process.on('error', () => {
        this._isRunning = false;
        resolve(null);
      });
    });
  }

  get isRunning(): boolean {
    return this._isRunning;
  }

  get lastActivity(): Date {
    return this._lastActivity;
  }

  get bytesTransferred(): number {
    return this._bytesTransferred;
  }

  /**
   * Update activity timestamp and byte count
   */
  updateActivity(bytes: number = 0): void {
    this._lastActivity = new Date();
    if (bytes > 0) {
      this._bytesTransferred += bytes;
    }
  }

  /**
   * Stop this SSH connection
   */
  async stop(): Promise<void> {
    if (!this.isRunning || this.process.killed) {
      return;
    }

    // Try graceful shutdown first (SIGTERM)
    this.process.kill('SIGTERM');

    // Wait up to 2 seconds for graceful exit
    const timeout = new Promise<void>((resolve) => setTimeout(resolve, 2000));
    await Promise.race([this.processExited.then(() => {}), timeout]);

    // Force kill if still running
    if (this.isRunning && !this.process.killed) {
      this.process.kill('SIGKILL');
      // Give it a brief moment to die
      await Promise.race([
        this.processExited,
        new Promise((resolve) => setTimeout(resolve, 500)),
      ]);
    }
  }
}

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
  private currentHandle: SSHHandle | null = null;
  private oldHandle: SSHHandle | null = null;
  private usedPorts: Set<number> = new Set();
  private healthCheckTimer: ReturnType<typeof setInterval> | null = null;
  private inactivityCheckTimer: ReturnType<typeof setInterval> | null = null;
  private isRestarting: boolean = false;
  private restartCount: number = 0;

  constructor(config: Config) {
    super();
    this.config = config;
  }

  /**
   * Get the current state of the SSH manager
   */
  getState(): Readonly<SSHManagerState> {
    return {
      isRunning: this.currentHandle?.isRunning ?? false,
      currentPort: this.currentHandle?.port ?? null,
      startTime: this.currentHandle?.startTime ?? null,
      lastActivity: this.currentHandle?.lastActivity ?? null,
      restartCount: this.restartCount,
      bytesTransferred: this.currentHandle?.bytesTransferred ?? 0,
    };
  }

  /**
   * Get the SOCKS5 proxy URL
   */
  getSocksUrl(): string | null {
    if (!this.currentHandle || !this.currentHandle.isRunning) {
      return null;
    }
    return `socks5://127.0.0.1:${this.currentHandle.port}`;
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
    if (this.currentHandle?.isRunning) {
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

        const handle = await this.attemptStart();

        if (handle) {
          this.currentHandle = handle;
          if (attempt > 1) {
            logger.info(`[SSH] Successfully started after ${attempt} attempts`);
          }
          return;
        }

        // If we get here, attemptStart returned null (shouldn't happen with current implementation)
        lastError = 'Start attempt returned null';
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        logger.warn(
          `[SSH] Attempt ${attempt}/${maxAttempts} failed: ${lastError}`,
        );
      }

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
   * Returns a handle to the SSH connection if successful
   */
  private async attemptStart(): Promise<SSHHandle> {
    const port = this.pickPort();
    this.usedPorts.add(port);

    logger.info(`[SSH] Starting SOCKS5 proxy on port ${port}...`);

    const args = this.buildSSHArgs(port);
    logger.info(`[SSH] Command: ssh ${args.join(' ')}`);

    const process = spawn('ssh', args, {
      stdio: ['ignore', 'pipe', 'pipe'],
    });

    // Create the handle
    const handle = new SSHHandle(port, process);

    // Monitor stderr for SSH messages (SSH outputs to stderr in verbose mode)
    this.monitorHandleOutput(handle);

    // Monitor process exit
    handle.processExited.then((code) => {
      this.emit('exit', code);
      this.usedPorts.delete(handle.port);
    });

    // Wait for SSH to be ready
    const result = await this.waitForReady(handle);

    if (!result.success) {
      // Clean up failed handle
      await handle.stop();
      this.usedPorts.delete(port);
      throw new Error(result.error || 'Unknown error during SSH startup');
    }

    // Start health checks
    this.startHealthChecks();

    return handle;
  }

  /**
   * Monitor SSH handle output
   */
  private monitorHandleOutput(handle: SSHHandle): void {
    // SSH verbose output goes to stderr
    const stderr = handle.process.stderr;
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
          handle.updateActivity();
          this.emit('activity');
        }
      });
    }
  }

  /**
   * Wait for SSH tunnel to be ready by attempting a test connection
   */
  private async waitForReady(
    handle: SSHHandle,
    timeout: number = 30000,
  ): Promise<{ success: boolean; error?: string }> {
    const startTime = Date.now();
    const checkInterval = 500;

    while (Date.now() - startTime < timeout) {
      // Check if process died
      if (!handle.isRunning) {
        return {
          success: false,
          error: 'SSH process died before becoming ready',
        };
      }

      // Try to connect to the SOCKS5 proxy
      const connected = await new Promise<boolean>((resolve) => {
        const socket = createConnection(
          { host: '127.0.0.1', port: handle.port },
          () => {
            socket.end();
            resolve(true);
          },
        );
        socket.on('error', () => resolve(false));
        socket.setTimeout(1000, () => {
          socket.destroy();
          resolve(false);
        });
      });

      if (connected) {
        // Connection successful, proxy is ready
        this.emit('ready', handle.port);
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
   * Update last activity timestamp
   */
  updateActivity(bytes: number = 0): void {
    if (this.currentHandle) {
      this.currentHandle.updateActivity(bytes);
      this.emit('activity');
      if (bytes > 0) {
        this.emit('data', bytes);
      }
    }
  }

  /**
   * Start health check timers
   */
  private startHealthChecks(): void {
    // Check for inactivity
    if (this.config.inactivityTimeout > 0) {
      this.inactivityCheckTimer = setInterval(() => {
        if (!this.currentHandle) return;

        const elapsed = Date.now() - this.currentHandle.lastActivity.getTime();
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

    if (this.currentHandle) {
      await this.currentHandle.stop();
      this.usedPorts.delete(this.currentHandle.port);
      this.currentHandle = null;
    }

    if (this.oldHandle) {
      await this.oldHandle.stop();
      this.usedPorts.delete(this.oldHandle.port);
      this.oldHandle = null;
    }
  }

  /**
   * Perform a smooth restart - start new SSH, then stop old one
   * Keeps old connection alive briefly to allow in-flight requests to complete
   */
  async smoothRestart(gracePeriodMs: number = 3000): Promise<void> {
    // Skip if already restarting
    if (this.isRestarting) {
      logger.info('[SSH] Restart already in progress, skipping');
      return;
    }

    this.isRestarting = true;
    try {
      this.restartCount++;
      this.emit('restart', this.restartCount);

      logger.info('[SSH] Starting smooth restart...');

      // Start new SSH connection
      logger.info('[SSH] Starting new SSH connection...');
      const newHandle = await this.createNewHandle();

      // Save old handle
      const oldHandle = this.currentHandle;

      // Switch to new handle
      this.currentHandle = newHandle;
      logger.info(`[SSH] Switched to new connection on port ${newHandle.port}`);

      // Keep old handle alive for grace period
      if (oldHandle) {
        this.oldHandle = oldHandle;
        logger.info(
          `[SSH] Keeping old connection (port ${oldHandle.port}) alive for ${gracePeriodMs}ms...`,
        );
        await sleep(gracePeriodMs);

        // Stop old handle
        logger.info(`[SSH] Stopping old connection on port ${oldHandle.port}`);
        await oldHandle.stop();
        this.usedPorts.delete(oldHandle.port);
        this.oldHandle = null;
      }

      logger.info('[SSH] Smooth restart completed successfully');
    } finally {
      this.isRestarting = false;
    }
  }

  /**
   * Create a new SSH handle with retries
   */
  private async createNewHandle(): Promise<SSHHandle> {
    const maxAttempts = this.config.retryAttempts + 1;
    let attempt = 1;
    let lastError: string | undefined;

    while (attempt <= maxAttempts) {
      try {
        if (attempt > 1) {
          logger.info(
            `[SSH] Starting new connection (attempt ${attempt}/${maxAttempts})...`,
          );
        }

        return await this.attemptStart();
      } catch (error) {
        lastError = error instanceof Error ? error.message : String(error);
        logger.warn(
          `[SSH] Attempt ${attempt}/${maxAttempts} failed: ${lastError}`,
        );

        attempt++;

        if (attempt <= maxAttempts) {
          const delay = Math.min(1000 * Math.pow(2, attempt - 2), 10000);
          logger.info(`[SSH] Waiting ${delay}ms before retry...`);
          await sleep(delay);
        }
      }
    }

    throw new Error(
      `Failed to create new SSH handle after ${maxAttempts} attempts. Last error: ${lastError}`,
    );
  }

  /**
   * Restart the SSH process
   */
  async restart(): Promise<void> {
    // Use smooth restart if we have a current handle, otherwise do a hard restart
    if (this.currentHandle?.isRunning) {
      await this.smoothRestart();
    } else {
      // Skip if already restarting
      if (this.isRestarting) {
        logger.info('[SSH] Restart already in progress, skipping');
        return;
      }

      this.isRestarting = true;
      try {
        this.restartCount++;
        this.emit('restart', this.restartCount);

        await this.stop();
        await sleep(1000); // Brief delay before restart
        await this.start();
      } finally {
        this.isRestarting = false;
      }
    }
  }
}
