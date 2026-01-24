/**
 * SSH Chain Proxy Manager
 * Main entry point - loads config, starts SSH tunnel, and HTTP proxy
 */

import { resolveConfig } from "./src/config.ts";
import { parseArgv, printHelp, printVersion } from "./src/args.ts";
import { SSHManager } from "./src/ssh-manager.ts";
import { ProxyServer } from "./src/proxy-server.ts";

async function main() {
  // Parse command-line arguments
  let args;
  try {
    args = parseArgv();
  } catch (error) {
    console.error(`Error: ${error instanceof Error ? error.message : error}`);
    console.error("\nRun 'ssh-chain --help' for usage information.");
    process.exit(1);
  }

  // Handle help and version flags
  if (args.help) {
    printHelp();
    process.exit(0);
  }

  if (args.version) {
    printVersion();
    process.exit(0);
  }

  console.log("╔════════════════════════════════════════╗");
  console.log("║       SSH Chain Proxy Manager          ║");
  console.log("╚════════════════════════════════════════╝");
  console.log();

  // Load configuration (merges config file with command-line args)
  console.log("[Main] Loading configuration...");
  let config;
  try {
    config = await resolveConfig(args);
    console.log(`[Main] Config loaded: SSH ${config.sshServer.host}, HTTP proxy :${config.httpProxyPort}`);
  } catch (error) {
    console.error(`[Main] Failed to load config: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  // Create SSH manager
  const sshManager = new SSHManager(config, {
    onReady: (port) => {
      console.log(`[Main] SSH SOCKS5 ready on port ${port}`);
    },
    onError: (error) => {
      console.error(`[Main] SSH error: ${error.message}`);
    },
    onExit: (code) => {
      console.log(`[Main] SSH process exited with code ${code}`);
    },
    onStderr: (data) => {
      if (config.logLevel === "debug") {
        process.stderr.write(`[SSH] ${data}`);
      }
    },
  });

  // Create proxy server
  const proxyServer = new ProxyServer(config, sshManager, {
    onError: (error) => {
      console.error(`[Main] Proxy error: ${error.message}`);
    },
  });

  // Graceful shutdown handler
  let isShuttingDown = false;

  async function shutdown(signal: string) {
    if (isShuttingDown) return;
    isShuttingDown = true;

    console.log();
    console.log(`[Main] Received ${signal}, shutting down...`);

    // Print final stats
    const stats = proxyServer.getStats();
    const sshState = sshManager.getState();
    const uptime = sshState.startTime
      ? Math.floor((Date.now() - sshState.startTime.getTime()) / 1000)
      : 0;
    const uptimeStr = `${Math.floor(uptime / 60)}m ${uptime % 60}s`;

    console.log();
    console.log("╔════════════════════ Session Stats ═══════════════════╗");
    console.log(`║ Total Requests:  ${stats.totalRequests.toString().padStart(35)} ║`);
    console.log(`║ Unique Hosts:    ${stats.hostnameStats.size.toString().padStart(35)} ║`);
    console.log(`║ Session Uptime:  ${uptimeStr.padStart(35)} ║`);
    console.log(`║ SSH Restarts:    ${sshState.restartCount.toString().padStart(35)} ║`);
    console.log("╚══════════════════════════════════════════════════════╝");

    // Show top hostnames
    const topHosts = proxyServer.getTopHostnames(5);
    if (topHosts.length > 0) {
      console.log();
      console.log("Top Hostnames:");
      for (const host of topHosts) {
        console.log(`  ${host.hostname}: ${host.requests} requests`);
      }
    }

    console.log();

    await proxyServer.stop();
    await sshManager.stop();

    console.log("[Main] Goodbye!");
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  try {
    // Start SSH tunnel
    console.log();
    await sshManager.start();

    // Start HTTP proxy
    console.log();
    await proxyServer.start();

    // Print usage info
    console.log();
    console.log("╔════════════════════════════════════════════════╗");
    console.log("║  Proxy is running! Configure your apps to use: ║");
    console.log(`║  ${proxyServer.getProxyUrl().padEnd(45)} ║`);
    console.log("║                                                ║");
    console.log("║  Press Ctrl+C to stop                          ║");
    console.log("╚════════════════════════════════════════════════╝");
    console.log();
  } catch (error) {
    console.error(`[Main] Startup failed: ${error}`);
    await sshManager.stop();
    process.exit(1);
  }
}

function formatBytes(bytes: number): string {
  if (bytes === 0) return "0 B";
  const k = 1024;
  const sizes = ["B", "KB", "MB", "GB", "TB"];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${parseFloat((bytes / Math.pow(k, i)).toFixed(2))} ${sizes[i]}`;
}

main();