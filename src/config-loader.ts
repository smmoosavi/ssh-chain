/**
 * Config Loader System
 * Provides a flexible system for loading and merging configuration from multiple sources
 */

import { z } from "zod";
import type { Config } from "./config.ts";
import type { ParsedArgs } from "./args.ts";
import {
  ConfigSchema,
  SSHServerSchema,
  PortRangeSchema,
  LogLevelSchema,
} from "./config.ts";

/**
 * Partial config that can be loaded from a source
 */
export interface PartialConfig {
  sshServer?: { host: string; port?: number; username?: string; identityFile?: string; options?: string[] };
  portRange?: { min: number; max: number };
  httpProxyPort?: number;
  inactivityTimeout?: number;
  healthCheckInterval?: number;
  retryAttempts?: number;
  logLevel?: "debug" | "info" | "warn" | "error";
  directDomains?: string[];
}

/**
 * Interface for config loaders
 */
export interface ConfigLoader {
  /** Name of the loader for debugging */
  readonly name: string;
  /** Priority (higher = loaded later, overrides earlier) */
  readonly priority: number;
  /** Load configuration from this source */
  load(): Promise<PartialConfig>;
}

/**
 * Default configuration values
 */
export class DefaultConfigLoader implements ConfigLoader {
  readonly name = "defaults";
  readonly priority = 0;

  async load(): Promise<PartialConfig> {
    return {
      portRange: { min: 10000, max: 10100 },
      httpProxyPort: 4080,
      inactivityTimeout: 60,
      healthCheckInterval: 30,
      retryAttempts: 3,
      logLevel: "info",
      directDomains: [],
    };
  }
}

/**
 * Load configuration from a JSON file
 */
export class FileConfigLoader implements ConfigLoader {
  readonly name = "file";
  readonly priority = 10;
  private configPath: string;
  private required: boolean;

  constructor(configPath: string, required: boolean = false) {
    this.configPath = configPath;
    this.required = required;
  }

  async load(): Promise<PartialConfig> {
    const file = Bun.file(this.configPath);
    
    if (!(await file.exists())) {
      if (this.required) {
        throw new Error(`Configuration file not found: ${this.configPath}`);
      }
      return {};
    }

    try {
      const content = await file.text();
      const rawConfig = JSON.parse(content);
      return this.parseConfig(rawConfig);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in configuration file: ${error.message}`);
      }
      throw error;
    }
  }

  private parseConfig(raw: unknown): PartialConfig {
    if (typeof raw !== "object" || raw === null) {
      throw new Error("Configuration must be an object");
    }

    const config: PartialConfig = {};
    const obj = raw as Record<string, unknown>;

    // Parse sshServer
    if (obj.sshServer !== undefined) {
      if (typeof obj.sshServer === "string") {
        config.sshServer = { host: obj.sshServer };
      } else if (typeof obj.sshServer === "object" && obj.sshServer !== null) {
        const ssh = obj.sshServer as Record<string, unknown>;
        config.sshServer = {
          host: String(ssh.host ?? ""),
          ...(ssh.port !== undefined && { port: Number(ssh.port) }),
          ...(ssh.username !== undefined && { username: String(ssh.username) }),
          ...(ssh.identityFile !== undefined && { identityFile: String(ssh.identityFile) }),
          ...(ssh.options !== undefined && { options: ssh.options as string[] }),
        };
      }
    }

    // Parse other fields
    if (obj.portRange !== undefined) {
      const pr = obj.portRange as Record<string, unknown>;
      config.portRange = {
        min: Number(pr.min ?? 10000),
        max: Number(pr.max ?? 10100),
      };
    }

    if (obj.httpProxyPort !== undefined) {
      config.httpProxyPort = Number(obj.httpProxyPort);
    }

    if (obj.inactivityTimeout !== undefined) {
      config.inactivityTimeout = Number(obj.inactivityTimeout);
    }

    if (obj.healthCheckInterval !== undefined) {
      config.healthCheckInterval = Number(obj.healthCheckInterval);
    }

    if (obj.retryAttempts !== undefined) {
      config.retryAttempts = Number(obj.retryAttempts);
    }

    if (obj.logLevel !== undefined) {
      config.logLevel = obj.logLevel as PartialConfig["logLevel"];
    }

    if (obj.directDomains !== undefined) {
      config.directDomains = obj.directDomains as string[];
    }

    return config;
  }
}

/**
 * Load configuration from command-line arguments
 */
export class ArgvConfigLoader implements ConfigLoader {
  readonly name = "argv";
  readonly priority = 20;
  private args: ParsedArgs;

  constructor(args: ParsedArgs) {
    this.args = args;
  }

  async load(): Promise<PartialConfig> {
    const config: PartialConfig = {};

    if (this.args.sshServer) {
      config.sshServer = { host: this.args.sshServer };
    }

    if (this.args.httpProxyPort !== undefined) {
      config.httpProxyPort = this.args.httpProxyPort;
    }

    if (this.args.logLevel !== undefined) {
      config.logLevel = this.args.logLevel;
    }

    return config;
  }
}

/**
 * Load configuration from environment variables
 */
export class EnvConfigLoader implements ConfigLoader {
  readonly name = "env";
  readonly priority = 15;
  private prefix: string;

  constructor(prefix: string = "SSH_CHAIN_") {
    this.prefix = prefix;
  }

  async load(): Promise<PartialConfig> {
    const config: PartialConfig = {};

    const sshServer = process.env[`${this.prefix}SSH_SERVER`];
    if (sshServer) {
      config.sshServer = { host: sshServer };
    }

    const httpProxyPort = process.env[`${this.prefix}HTTP_PROXY_PORT`];
    if (httpProxyPort) {
      config.httpProxyPort = parseInt(httpProxyPort, 10);
    }

    const logLevel = process.env[`${this.prefix}LOG_LEVEL`];
    if (logLevel && ["debug", "info", "warn", "error"].includes(logLevel)) {
      config.logLevel = logLevel as PartialConfig["logLevel"];
    }

    return config;
  }
}

/**
 * Configuration manager that combines multiple loaders
 */
export class ConfigManager {
  private loaders: ConfigLoader[] = [];

  /**
   * Add a config loader
   */
  addLoader(loader: ConfigLoader): this {
    this.loaders.push(loader);
    return this;
  }

  /**
   * Remove a loader by name
   */
  removeLoader(name: string): this {
    this.loaders = this.loaders.filter((l) => l.name !== name);
    return this;
  }

  /**
   * Load and merge all configurations
   */
  async load(): Promise<Config> {
    // Sort by priority (lower first)
    const sortedLoaders = [...this.loaders].sort((a, b) => a.priority - b.priority);

    // Merge configs
    let merged: PartialConfig = {};

    for (const loader of sortedLoaders) {
      try {
        const partial = await loader.load();
        merged = this.mergeConfigs(merged, partial);
      } catch (error) {
        throw new Error(
          `Config loader "${loader.name}" failed: ${error instanceof Error ? error.message : error}`
        );
      }
    }

    // Validate final config
    return this.validateConfig(merged);
  }

  /**
   * Deep merge two partial configs (second overrides first)
   */
  private mergeConfigs(base: PartialConfig, override: PartialConfig): PartialConfig {
    const result: PartialConfig = { ...base };

    if (override.sshServer !== undefined) {
      result.sshServer = override.sshServer;
    }
    if (override.portRange !== undefined) {
      result.portRange = override.portRange;
    }
    if (override.httpProxyPort !== undefined) {
      result.httpProxyPort = override.httpProxyPort;
    }
    if (override.inactivityTimeout !== undefined) {
      result.inactivityTimeout = override.inactivityTimeout;
    }
    if (override.healthCheckInterval !== undefined) {
      result.healthCheckInterval = override.healthCheckInterval;
    }
    if (override.retryAttempts !== undefined) {
      result.retryAttempts = override.retryAttempts;
    }
    if (override.logLevel !== undefined) {
      result.logLevel = override.logLevel;
    }
    if (override.directDomains !== undefined) {
      result.directDomains = override.directDomains;
    }

    return result;
  }

  /**
   * Validate and create final config
   */
  private validateConfig(partial: PartialConfig): Config {
    if (!partial.sshServer?.host) {
      throw new Error(
        "SSH server is required. Provide it as an argument or in the config file.\n" +
          "Usage: ssh-chain <ssh-server> or ssh-chain -c <config-file>"
      );
    }

    return ConfigSchema.parse({
      sshServer: partial.sshServer,
      portRange: partial.portRange,
      httpProxyPort: partial.httpProxyPort,
      inactivityTimeout: partial.inactivityTimeout,
      healthCheckInterval: partial.healthCheckInterval,
      retryAttempts: partial.retryAttempts,
      logLevel: partial.logLevel,
      directDomains: partial.directDomains,
    });
  }
}

/**
 * Create a standard config manager with default loaders
 */
export function createConfigManager(args: ParsedArgs): ConfigManager {
  const configPath = args.configPath ?? "./config.json";
  const isExplicit = args.configPath !== undefined;

  return new ConfigManager()
    .addLoader(new DefaultConfigLoader())
    .addLoader(new EnvConfigLoader())
    .addLoader(new FileConfigLoader(configPath, isExplicit))
    .addLoader(new ArgvConfigLoader(args));
}
