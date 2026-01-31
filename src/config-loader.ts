/**
 * Config Loader System
 * Provides a flexible system for loading and merging configuration from multiple sources
 */

import { z } from 'zod';
import type { Config } from './config.ts';
import type { ParsedArgs } from './args.ts';
import { fileExists, readFileText } from './fs-utils.ts';
import {
  ConfigSchema,
  SSHServerSchema,
  PortRangeSchema,
  LogLevelSchema,
} from './config.ts';

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
    if (typeof value === 'string') {
      return { host: value };
    }
    return value;
  });

/**
 * Zod schema for partial config that can be loaded from a source
 */
const PartialConfigSchema = z
  .object({
    sshServer: PartialSSHServerSchema.optional(),
    portRange: z
      .object({
        min: z.number().int().min(1024).max(65535),
        max: z.number().int().min(1024).max(65535),
      })
      .optional(),
    httpProxyHost: z.string().optional(),
    httpProxyPort: z.number().int().min(1).max(65535).optional(),
    inactivityTimeout: z.number().int().min(1).optional(),
    healthCheckInterval: z.number().int().min(1).optional(),
    retryAttempts: z.number().int().min(0).optional(),
    logLevel: LogLevelSchema.optional(),
    directDomains: z.array(z.string()).optional(),
    showFooter: z.boolean().optional(),
    maxSpeed: z.number().int().min(1).optional(),
  })
  .partial();

/**
 * Partial config that can be loaded from a source
 */
export type PartialConfig = z.infer<typeof PartialConfigSchema>;

/**
 * All config keys that should be merged (excluding sshServer which needs special handling)
 * This is the single source of truth for config properties
 */
const SIMPLE_CONFIG_KEYS = [
  'portRange',
  'httpProxyHost',
  'httpProxyPort',
  'inactivityTimeout',
  'healthCheckInterval',
  'retryAttempts',
  'logLevel',
  'directDomains',
  'showFooter',
  'maxSpeed',
] as const satisfies ReadonlyArray<keyof Omit<PartialConfig, 'sshServer'>>;

/**
 * Default configuration values - single source of truth for defaults
 */
const DEFAULT_CONFIG: Required<Omit<PartialConfig, 'sshServer'>> = {
  portRange: { min: 10000, max: 10100 },
  httpProxyHost: '127.0.0.1',
  httpProxyPort: 4080,
  inactivityTimeout: 60,
  healthCheckInterval: 30,
  retryAttempts: 3,
  logLevel: 'info',
  directDomains: [],
  showFooter: true,
  maxSpeed: 6 * 1024 * 1024,
};

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
  readonly name = 'defaults';
  readonly priority = 0;

  async load(): Promise<PartialConfig> {
    return { ...DEFAULT_CONFIG };
  }
}

/**
 * Load configuration from a JSON file
 */
export class FileConfigLoader implements ConfigLoader {
  readonly name = 'file';
  readonly priority = 10;
  private configPath: string;
  private required: boolean;

  constructor(configPath: string, required: boolean = false) {
    this.configPath = configPath;
    this.required = required;
  }

  async load(): Promise<PartialConfig> {
    if (!(await fileExists(this.configPath))) {
      if (this.required) {
        throw new Error(`Configuration file not found: ${this.configPath}`);
      }
      return {};
    }

    try {
      const content = await readFileText(this.configPath);
      const rawConfig = JSON.parse(content);
      return PartialConfigSchema.parse(rawConfig);
    } catch (error) {
      if (error instanceof SyntaxError) {
        throw new Error(`Invalid JSON in configuration file: ${error.message}`);
      }
      if (error instanceof z.ZodError) {
        const issues = error.issues
          .map((issue) => `  - ${issue.path.join('.')}: ${issue.message}`)
          .join('\n');
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
  readonly name = 'argv';
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

    if (this.args.showFooter !== undefined) {
      config.showFooter = this.args.showFooter;
    }

    if (this.args.maxSpeed !== undefined) {
      config.maxSpeed = this.args.maxSpeed;
    }

    return config;
  }
}

/**
 * Zod schema for environment variable parsing
 */
const EnvConfigSchema = z.object({
  sshServer: z
    .string()
    .min(1)
    .transform((v) => ({ host: v }))
    .optional(),
  httpProxyHost: z.string().min(1).optional(),
  httpProxyPort: z.coerce.number().int().min(1).max(65535).optional(),
  logLevel: LogLevelSchema.optional(),
});

/**
 * Load configuration from environment variables
 */
export class EnvConfigLoader implements ConfigLoader {
  readonly name = 'env';
  readonly priority = 15;
  private prefix: string;

  constructor(prefix: string = 'SSH_CHAIN_') {
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
    const sortedLoaders = [...this.loaders].sort(
      (a, b) => a.priority - b.priority,
    );

    // Merge configs
    let merged: PartialConfig = {};

    for (const loader of sortedLoaders) {
      try {
        const partial = await loader.load();
        merged = this.mergeConfigs(merged, partial);
      } catch (error) {
        throw new Error(
          `Config loader "${loader.name}" failed: ${error instanceof Error ? error.message : error}`,
        );
      }
    }

    // Validate final config
    return this.validateConfig(merged);
  }

  /**
   * Deep merge two partial configs (second overrides first)
   * Uses SIMPLE_CONFIG_KEYS to automatically handle all properties
   */
  private mergeConfigs(
    base: PartialConfig,
    override: PartialConfig,
  ): PartialConfig {
    const result: PartialConfig = { ...base };

    // Handle sshServer specially (it has nested structure)
    if (override.sshServer !== undefined) {
      result.sshServer = override.sshServer;
    }

    // Handle all simple config keys generically
    for (const key of SIMPLE_CONFIG_KEYS) {
      if (override[key] !== undefined) {
        // TypeScript needs help here due to union types
        (result as Record<string, unknown>)[key] = override[key];
      }
    }

    return result;
  }

  /**
   * Validate and create final config
   * Uses SIMPLE_CONFIG_KEYS to automatically include all properties
   */
  private validateConfig(partial: PartialConfig): Config {
    if (!partial.sshServer?.host) {
      throw new Error(
        'SSH server is required. Provide it as an argument or in the config file.\n' +
          'Usage: ssh-chain <ssh-server> or ssh-chain -c <config-file>',
      );
    }

    // Always append localhost and *.local to directDomains (user cannot bypass these)
    const builtinDirectDomains = ['localhost', '*.local'];
    const userDirectDomains = partial.directDomains ?? [];
    const mergedDirectDomains = [
      ...userDirectDomains.filter((d) => !builtinDirectDomains.includes(d)),
      ...builtinDirectDomains,
    ];

    // Build config object dynamically from SIMPLE_CONFIG_KEYS
    const configObj: Record<string, unknown> = {
      sshServer: partial.sshServer,
    };

    for (const key of SIMPLE_CONFIG_KEYS) {
      configObj[key] =
        key === 'directDomains' ? mergedDirectDomains : partial[key];
    }

    return ConfigSchema.parse(configObj);
  }
}

/**
 * Create a standard config manager with default loaders
 */
export function createConfigManager(args: ParsedArgs): ConfigManager {
  const configPath = args.configPath ?? './config.json';
  const isExplicit = args.configPath !== undefined;

  return new ConfigManager()
    .addLoader(new DefaultConfigLoader())
    .addLoader(new EnvConfigLoader())
    .addLoader(new FileConfigLoader(configPath, isExplicit))
    .addLoader(new ArgvConfigLoader(args));
}
