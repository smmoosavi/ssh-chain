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
 * Zod schema for partial SSH server config (string or object)
 */
const PartialSSHServerSchema = z
  .union([
    z.string().min(1),
    z.object({
      host: z.string().min(1),
      port: z.number().int().min(1).max(65535).optional(),
      username: z.string().optional(),
      identityFile: z.string().optional(),
      options: z.array(z.string()).optional(),
    }),
  ])
  .transform((value) => {
    if (typeof value === "string") {
      return { host: value };
    }
    return value;
  });

/**
 * Zod schema for partial config that can be loaded from a source
 */
const PartialConfigSchema = z.object({
  sshServer: PartialSSHServerSchema.optional(),
  portRange: z.object({
    min: z.number().int().min(1024).max(65535),
    max: z.number().int().min(1024).max(65535),
  }).optional(),
  httpProxyHost: z.string().optional(),
  httpProxyPort: z.number().int().min(1).max(65535).optional(),
  inactivityTimeout: z.number().int().min(1).optional(),
  healthCheckInterval: z.number().int().min(1).optional(),
  retryAttempts: z.number().int().min(0).optional(),
  logLevel: LogLevelSchema.optional(),
  directDomains: z.array(z.string()).optional(),
}).partial();

/**
 * Partial config that can be loaded from a source
 */
export type PartialConfig = z.infer<typeof PartialConfigSchema>;

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
      httpProxyHost: "127.0.0.1",
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
      return PartialConfigSchema.parse(rawConfig);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in configuration file: ${error.message}`);
      }
      if (error instanceof z.ZodError) {
        const issues = error.issues
          .map((issue) => `  - ${issue.path.join(".")}: ${issue.message}`)
          .join("\n");
        throw new Error(`Configuration validation failed:\n${issues}`);
      }
      throw error;
    }
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

    if (this.args.httpProxyHost !== undefined) {
      config.httpProxyHost = this.args.httpProxyHost;
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
 * Zod schema for environment variable parsing
 */
const EnvConfigSchema = z.object({
  sshServer: z.string().min(1).transform((v) => ({ host: v })).optional(),
  httpProxyHost: z.string().min(1).optional(),
  httpProxyPort: z.coerce.number().int().min(1).max(65535).optional(),
  logLevel: LogLevelSchema.optional(),
});

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
    const rawEnv: Record<string, unknown> = {};

    const sshServer = process.env[`${this.prefix}SSH_SERVER`];
    if (sshServer) rawEnv.sshServer = sshServer;

    const httpProxyHost = process.env[`${this.prefix}HTTP_PROXY_HOST`];
    if (httpProxyHost) rawEnv.httpProxyHost = httpProxyHost;

    const httpProxyPort = process.env[`${this.prefix}HTTP_PROXY_PORT`];
    if (httpProxyPort) rawEnv.httpProxyPort = httpProxyPort;

    const logLevel = process.env[`${this.prefix}LOG_LEVEL`];
    if (logLevel) rawEnv.logLevel = logLevel;

    const result = EnvConfigSchema.safeParse(rawEnv);
    return result.success ? result.data : {};
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
    if (override.httpProxyHost !== undefined) {
      result.httpProxyHost = override.httpProxyHost;
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

    // Always append localhost and *.local to directDomains (user cannot bypass these)
    const builtinDirectDomains = ["localhost", "*.local"];
    const userDirectDomains = partial.directDomains ?? [];
    const mergedDirectDomains = [
      ...userDirectDomains.filter(d => !builtinDirectDomains.includes(d)),
      ...builtinDirectDomains,
    ];

    return ConfigSchema.parse({
      sshServer: partial.sshServer,
      portRange: partial.portRange,
      httpProxyHost: partial.httpProxyHost,
      httpProxyPort: partial.httpProxyPort,
      inactivityTimeout: partial.inactivityTimeout,
      healthCheckInterval: partial.healthCheckInterval,
      retryAttempts: partial.retryAttempts,
      logLevel: partial.logLevel,
      directDomains: mergedDirectDomains,
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
