/**
 * SSH Chain Proxy Manager
 * Main entry point - loads config, starts SSH tunnel, and HTTP proxy
 */

import { parseArgv, printHelp, printVersion } from "./src/args.ts";
import { createConfigManager } from "./src/config-loader.ts";
import { createApp } from "./src/app.ts";
import {
  createDefaultPlugins,
  BannerPlugin,
} from "./src/plugins.ts";

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

  // Load configuration using the config manager
  console.log("[Main] Loading configuration...");
  let config;
  try {
    const configManager = createConfigManager(args);
    config = await configManager.load();
    console.log(`[Main] Config loaded: SSH ${config.sshServer.host}, HTTP proxy :${config.httpProxyPort}`);
  } catch (error) {
    console.error(`[Main] Failed to load config: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  // Create plugins
  const plugins = createDefaultPlugins(config.logLevel);

  // Get banner plugin for startup display
  const bannerPlugin = plugins.find((p) => p.name === "banner") as BannerPlugin;
  bannerPlugin?.printStartupBanner();

  // Create app with composition
  const app = createApp(config, plugins);

  // Graceful shutdown handler
  async function shutdown(signal: string) {
    if (!app.isAppRunning()) return;

    console.log();
    console.log(`[Main] Received ${signal}, shutting down...`);

    // Print final stats using banner plugin
    const stats = app.getSessionStats();
    bannerPlugin?.printSessionStats(stats);
    bannerPlugin?.printTopHostnames(stats.topHostnames);
    console.log();

    // Add timeout to shutdown process (max 5 seconds)
    const shutdownTimeout = setTimeout(() => {
      console.log("[Main] Shutdown timeout reached, forcing exit...");
      process.exit(1);
    }, 5000);

    try {
      await app.stop();
    } catch (error) {
      console.error(`[Main] Error during shutdown: ${error}`);
    } finally {
      clearTimeout(shutdownTimeout);
    }

    console.log("[Main] Goodbye!");
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  try {
    // Start the app (SSH tunnel + HTTP proxy)
    console.log();
    await app.start();

    // Print running banner
    bannerPlugin?.printRunningBanner(app.getProxyUrls());
  } catch (error) {
    console.error(`[Main] Startup failed: ${error}`);
    await app.stop();
    process.exit(1);
  }
}

main();