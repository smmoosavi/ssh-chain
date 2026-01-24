/**
 * SSH SOCKS5 Proxy Manager
 * Spawns and manages SSH -D processes for SOCKS5 proxy tunnels
 */

import type { Config, SSHServerConfig } from "./config.ts";
import type { Subprocess } from "bun";

export interface SSHManagerEvents {
  onReady?: (port: number) => void;
  onError?: (error: Error) => void;
  onExit?: (code: number | null) => void;
  onData?: (bytes: number) => void;
  onStdout?: (data: string) => void;
  onStderr?: (data: string) => void;
}

export interface SSHManagerState {
  isRunning: boolean;
  currentPort: number | null;
  startTime: Date | null;
  lastActivity: Date | null;
  restartCount: number;
  bytesTransferred: number;
}

export class SSHManager {
  private config: Config;
  private process: Subprocess | null = null;
  private events: SSHManagerEvents;
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

  constructor(config: Config, events: SSHManagerEvents = {}) {
    this.config = config;
    this.events = events;
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

    throw new Error(
      `No available ports in range ${min}-${max}`
    );
  }

  /**
   * Build SSH command arguments
   */
  private buildSSHArgs(port: number): string[] {
    const ssh = this.config.sshServer;
    const args: string[] = [];

    // Dynamic port forwarding
    args.push("-D", `127.0.0.1:${port}`);

    // Don't execute remote command, just forward
    args.push("-N");

    // Exit if forwarding setup fails
    args.push("-o", "ExitOnForwardFailure=yes");

    // Keep connection alive
    args.push("-o", "ServerAliveInterval=30");
    args.push("-o", "ServerAliveCountMax=3");

    // Verbose for debugging (we'll parse this to detect ready state)
    args.push("-v");

    // Port (if not default)
    if (ssh.port && ssh.port !== 22) {
      args.push("-p", String(ssh.port));
    }

    // Identity file
    if (ssh.identityFile) {
      args.push("-i", ssh.identityFile);
    }

    // Additional options
    if (ssh.options) {
      for (const opt of ssh.options) {
        args.push("-o", opt);
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
      console.log("[SSH] Already running, skipping start");
      return;
    }

    const port = this.pickPort();
    this.usedPorts.add(port);
    this.state.currentPort = port;

    console.log(`[SSH] Starting SOCKS5 proxy on port ${port}...`);

    const args = this.buildSSHArgs(port);
    console.log(`[SSH] Command: ssh ${args.join(" ")}`);

    this.process = Bun.spawn(["ssh", ...args], {
      stdout: "pipe",
      stderr: "pipe",
      stdin: "ignore",
    });

    this.state.isRunning = true;
    this.state.startTime = new Date();
    this.state.lastActivity = new Date();

    // Monitor stderr for SSH messages (SSH outputs to stderr in verbose mode)
    this.monitorOutput();

    // Wait for SSH to be ready
    await this.waitForReady(port);

    // Start health checks
    this.startHealthChecks();
  }

  /**
   * Monitor SSH process output
   */
  private async monitorOutput(): Promise<void> {
    if (!this.process) return;

    // SSH verbose output goes to stderr
    const stderr = this.process.stderr;
    if (stderr && typeof stderr !== "number") {
      const reader = stderr.getReader();
      const decoder = new TextDecoder();

      (async () => {
        try {
          while (true) {
            const { done, value } = await reader.read();
            if (done) break;

            const text = decoder.decode(value);
            this.events.onStderr?.(text);

            // Check for activity indicators in SSH debug output
            if (
              text.includes("Entering interactive session") ||
              text.includes("channel") ||
              text.includes("data")
            ) {
              this.updateActivity();
            }
          }
        } catch (error) {
          // Stream closed
        }
      })();
    }

    // Monitor process exit
    this.process.exited.then((code) => {
      console.log(`[SSH] Process exited with code ${code}`);
      this.state.isRunning = false;
      this.events.onExit?.(code);

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
    timeout: number = 30000
  ): Promise<void> {
    const startTime = Date.now();
    const checkInterval = 500;

    console.log(`[SSH] Waiting for SOCKS5 proxy to be ready on port ${port}...`);

    while (Date.now() - startTime < timeout) {
      // Check if process died
      if (!this.state.isRunning || !this.process) {
        throw new Error("SSH process died before becoming ready");
      }

      // Try to connect to the SOCKS5 proxy
      try {
        const socket = await Bun.connect({
          hostname: "127.0.0.1",
          port: port,
          socket: {
            data() {},
            open(socket) {
              socket.end();
            },
            close() {},
            error() {},
          },
        });

        // Connection successful, proxy is ready
        console.log(`[SSH] SOCKS5 proxy ready on port ${port}`);
        this.events.onReady?.(port);
        return;
      } catch {
        // Not ready yet, wait and retry
        await Bun.sleep(checkInterval);
      }
    }

    throw new Error(`SSH SOCKS5 proxy failed to start within ${timeout}ms`);
  }

  /**
   * Update last activity timestamp
   */
  updateActivity(bytes: number = 0): void {
    this.state.lastActivity = new Date();
    if (bytes > 0) {
      this.state.bytesTransferred += bytes;
      this.events.onData?.(bytes);
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
          console.log(
            `[SSH] Connection stalled (no activity for ${this.config.inactivityTimeout}s), restarting...`
          );
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
    console.log("[SSH] Stopping SSH process...");

    this.stopHealthChecks();

    if (this.process) {
      // Try graceful shutdown first (SIGTERM)
      this.process.kill("SIGTERM");
      
      // Wait up to 2 seconds for graceful exit
      const timeout = new Promise<void>(resolve => setTimeout(resolve, 2000));
      const exited = this.process.exited.then(() => {});
      
      await Promise.race([exited, timeout]);
      
      // Force kill if still running
      if (!this.process.killed) {
        console.log("[SSH] Force killing process...");
        this.process.kill("SIGKILL");
        // Give it a brief moment to die
        await Promise.race([this.process.exited, new Promise(resolve => setTimeout(resolve, 500))]);
      }
      
      this.process = null;
    }

    if (this.state.currentPort) {
      this.usedPorts.delete(this.state.currentPort);
    }

    this.state.isRunning = false;
    this.state.currentPort = null;
    this.state.startTime = null;

    console.log("[SSH] Stopped");
  }

  /**
   * Restart the SSH process
   */
  async restart(): Promise<void> {
    console.log("[SSH] Restarting...");
    this.state.restartCount++;

    await this.stop();
    await Bun.sleep(1000); // Brief delay before restart
    await this.start();

    console.log(`[SSH] Restarted (total restarts: ${this.state.restartCount})`);
  }
}
