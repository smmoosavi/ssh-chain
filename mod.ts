/**
 * SSH Chain Proxy - Modular Exports
 * Re-exports all public APIs for easy importing
 */

// Core application
export { App, createApp, type AppOptions } from "./src/app.ts";

// Config system
export {
  type Config,
  type SSHServerConfig,
  type PortRangeConfig,
  ConfigSchema,
  SSHServerSchema,
  PortRangeSchema,
  LogLevelSchema,
  loadConfigFile,
  resolveConfig,
  loadConfig,
  createConfig,
} from "./src/config.ts";

// Config loaders
export {
  type ConfigLoader,
  type PartialConfig,
  ConfigManager,
  DefaultConfigLoader,
  FileConfigLoader,
  ArgvConfigLoader,
  EnvConfigLoader,
  createConfigManager,
} from "./src/config-loader.ts";

// Core components
export { SSHManager, type SSHManagerState } from "./src/ssh-manager.ts";
export { ProxyServer } from "./src/proxy-server.ts";

// Plugin system
export {
  PluginManager,
  StatsPlugin,
  ConsoleLoggerPlugin,
  BannerPlugin,
  createDefaultPlugins,
  type ProxyStats,
} from "./src/plugins.ts";

// Types
export {
  TypedEventEmitter,
  type ProxyPlugin,
  type PluginContext,
  type ProxyRequestInfo,
  type ProxyServerEvents,
  type SSHManagerEvents,
  type ConnectionStats,
} from "./src/types.ts";

// Args parsing
export {
  parseArgv,
  printHelp,
  printVersion,
  type ParsedArgs,
} from "./src/args.ts";
