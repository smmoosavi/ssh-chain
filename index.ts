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
import { logger } from "./src/logger.ts";

async function main() {
  // Parse command-line arguments
  let args;
  try {
    args = parseArgv();
  } catch (error) {
    logger.error(`Error: ${error instanceof Error ? error.message : error}`);
    logger.error("\nRun 'ssh-chain --help' for usage information.");
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
  logger.info("[Main] Loading configuration...");
  let config;
  try {
    const configManager = createConfigManager(args);
    config = await configManager.load();
    logger.info(`[Main] Config loaded: SSH ${config.sshServer.host}, HTTP proxy :${config.httpProxyPort}`);
  } catch (error) {
    logger.error(`[Main] Failed to load config: ${error instanceof Error ? error.message : error}`);
    process.exit(1);
  }

  // Create plugins
  const plugins = createDefaultPlugins(config.logLevel);

  // Get banner plugin for startup display
  const bannerPlugin = plugins.find((p) => p.name === "banner") as BannerPlugin;
  bannerPlugin?.printStartupBanner();

  // Create app with composition
  const app = createApp(config, plugins);

  // Track shutdown state to prevent double shutdown
  let isShuttingDown = false;

  // Graceful shutdown handler
  async function shutdown(signal: string) {
    if (isShuttingDown || !app.isAppRunning()) return;
    isShuttingDown = true;

    logger.emptyLine();
    logger.info(`[Main] Received ${signal}, shutting down...`);

    // Print final stats using banner plugin (including active connections)
    const stats = app.getSessionStatsIncludingActive();
    bannerPlugin?.printSessionStats(stats);
    bannerPlugin?.printTopHostnames(stats.topHostnames);
    logger.emptyLine();

    // Add timeout to shutdown process (max 5 seconds)
    const shutdownTimeout = setTimeout(() => {
      logger.warn("[Main] Shutdown timeout reached, forcing exit...");
      process.exit(1);
    }, 5000);

    try {
      await app.stop();
    } catch (error) {
      logger.error(`[Main] Error during shutdown: ${error}`);
    } finally {
      clearTimeout(shutdownTimeout);
    }

    logger.info("[Main] Goodbye!");
    process.exit(0);
  }

  process.on("SIGINT", () => shutdown("SIGINT"));
  process.on("SIGTERM", () => shutdown("SIGTERM"));

  try {
    // Start the app (SSH tunnel + HTTP proxy)
    logger.emptyLine();
    await app.start();

    // Print running banner
    bannerPlugin?.printRunningBanner(app.getProxyUrls());
  } catch (error) {
    logger.error(`[Main] Startup failed: ${error}`);
    await app.stop();
    process.exit(1);
  }
}

main();