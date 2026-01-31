/**
 * Configuration schema and loader for SSH Chain Proxy
 */

import { z } from 'zod';
import type { ParsedArgs } from './args.ts';
import { fileExists, readFileText } from './fs-utils.ts';
import { parseSize } from './size-utils.ts';

// SSH Server configuration schema (full object format)
const SSHServerObjectSchema = z.object({
  /** SSH host - can be a hostname, IP, or .ssh/config Host entry */
  host: z.string().min(1, 'SSH host is required'),
  /** SSH port (default: 22) */
  port: z.number().int().min(1).max(65535).optional(),
  /** Username for SSH connection */
  username: z.string().optional(),
  /** Path to private key file */
  identityFile: z.string().optional(),
  /** Additional SSH options (e.g., "-o StrictHostKeyChecking=no") */
  options: z.array(z.string()).optional(),
});

// Support both string (simple host) and full object format
// Always outputs the full object shape
const SSHServerSchema = z
  .union([z.string().min(1), SSHServerObjectSchema])
  .transform((value): z.infer<typeof SSHServerObjectSchema> => {
    if (typeof value === 'string') {
      return { host: value };
    }
    return value;
  });

// Optional SSH server schema for config file (can be overridden by args)
const OptionalSSHServerSchema = z
  .union([z.string().min(1), SSHServerObjectSchema])
  .optional()
  .transform((value): z.infer<typeof SSHServerObjectSchema> | undefined => {
    if (value === undefined) return undefined;
    if (typeof value === 'string') {
      return { host: value };
    }
    return value;
  });

// Port range schema
const PortRangeSchema = z
  .object({
    /** Minimum port number for SOCKS5 proxy */
    min: z.number().int().min(1024).max(65535).default(10000),
    /** Maximum port number for SOCKS5 proxy */
    max: z.number().int().min(1024).max(65535).default(10100),
  })
  .refine((data) => data.min <= data.max, {
    message: 'portRange.min must be less than or equal to max',
  });

// Log level schema
const LogLevelSchema = z.enum(['debug', 'info', 'warn', 'error']);

// Main configuration schema
const ConfigSchema = z.object({
  /** SSH server configuration */
  sshServer: SSHServerSchema,
  /** Port range for dynamic SOCKS5 proxy allocation */
  portRange: PortRangeSchema.default({ min: 10000, max: 10100 }),
  /** Host for the HTTP proxy server to bind to */
  httpProxyHost: z.string().default('127.0.0.1'),
  /** Port for the HTTP proxy server to listen on */
  httpProxyPort: z.number().int().min(1).max(65535).default(4080),
  /** Duration of no data flow before considering connection stalled (seconds) */
  inactivityTimeout: z.number().int().min(1).default(60),
  /** Health check interval in seconds */
  healthCheckInterval: z.number().int().min(1).optional().default(30),
  /** Number of retry attempts before giving up */
  retryAttempts: z.number().int().min(0).optional().default(3),
  /** Logging level */
  logLevel: LogLevelSchema.optional().default('info'),
  /** List of domains that should bypass the proxy (support wildcards) */
  directDomains: z.array(z.string()).optional().default([]),
  /** Show footer display */
  showFooter: z.boolean().optional().default(true),
  /** Max speed for graph scaling in bytes/sec */
  maxSpeed: z
    .number()
    .int()
    .min(1)
    .optional()
    .default(6 * 1024 * 1024),
});

// Partial config schema for file loading (sshServer is optional, can come from args)
const PartialConfigSchema = z.object({
  /** SSH server configuration (optional if provided via CLI) */
  sshServer: OptionalSSHServerSchema,
  /** Port range for dynamic SOCKS5 proxy allocation */
  portRange: PortRangeSchema.default({ min: 10000, max: 10100 }),
  /** Host for the HTTP proxy server to bind to */
  httpProxyHost: z.string().default('127.0.0.1'),
  /** Port for the HTTP proxy server to listen on */
  httpProxyPort: z.number().int().min(1).max(65535).default(4080),
  /** Duration of no data flow before considering connection stalled (seconds) */
  inactivityTimeout: z.number().int().min(1).default(60),
  /** Health check interval in seconds */
  healthCheckInterval: z.number().int().min(1).optional().default(30),
  /** Number of retry attempts before giving up */
  retryAttempts: z.number().int().min(0).optional().default(3),
  /** Logging level */
  logLevel: LogLevelSchema.optional().default('info'),
  /** List of domains that should bypass the proxy (support wildcards) */
  directDomains: z.array(z.string()).optional().default([]),
  /** Show footer display */
  showFooter: z.boolean().optional(),
  /** Max speed for graph scaling in bytes/sec */
  maxSpeed: z.number().int().min(1).optional(),
});

// Export inferred types from schemas
export type SSHServerConfig = z.infer<typeof SSHServerObjectSchema>;
export type PortRangeConfig = z.infer<typeof PortRangeSchema>;
export type Config = z.infer<typeof ConfigSchema>;

/**
 * Loads configuration from a JSON file (partial config, sshServer optional)
 */
export async function loadConfigFile(
  configPath: string,
): Promise<z.infer<typeof PartialConfigSchema>> {
  if (!(await fileExists(configPath))) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  try {
    const content = await readFileText(configPath);
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

/**
 * Resolves final configuration from args and optional config file
 * Args have higher priority than config file values
 */
export async function resolveConfig(args: ParsedArgs): Promise<Config> {
  // Try to load config file if specified or if default exists
  let fileConfig: z.infer<typeof PartialConfigSchema> | undefined;
  const configPath = args.configPath ?? './config.json';

  try {
    if (await fileExists(configPath)) {
      fileConfig = await loadConfigFile(configPath);
    } else if (args.configPath) {
      // Config file was explicitly specified but doesn't exist
      throw new Error(`Configuration file not found: ${args.configPath}`);
    }
  } catch (error) {
    // Re-throw if config was explicitly specified
    if (args.configPath) {
      throw error;
    }
    // Ignore if default config doesn't exist
  }

  // Determine SSH server (args take priority)
  const sshServer = args.sshServer ?? fileConfig?.sshServer?.host;
  if (!sshServer) {
    throw new Error(
      'SSH server is required. Provide it as an argument or in the config file.\n' +
        'Usage: ssh-chain <ssh-server> or ssh-chain -c <config-file>',
    );
  }

  // Build merged config with args having higher priority
  const mergedConfig = {
    sshServer: args.sshServer
      ? { host: args.sshServer }
      : (fileConfig?.sshServer ?? { host: sshServer }),
    portRange: fileConfig?.portRange ?? { min: 10000, max: 10100 },
    httpProxyHost:
      args.httpProxyHost ?? fileConfig?.httpProxyHost ?? '127.0.0.1',
    httpProxyPort: args.httpProxyPort ?? fileConfig?.httpProxyPort ?? 4080,
    inactivityTimeout: fileConfig?.inactivityTimeout ?? 60,
    healthCheckInterval: fileConfig?.healthCheckInterval ?? 30,
    retryAttempts: fileConfig?.retryAttempts ?? 3,
    logLevel: args.logLevel ?? fileConfig?.logLevel ?? 'info',
    directDomains: fileConfig?.directDomains ?? [],
    showFooter:
      args.showFooter !== undefined
        ? args.showFooter
        : (fileConfig?.showFooter ?? true),
    maxSpeed: parseSize(args.maxSpeed ?? fileConfig?.maxSpeed ?? '6M'),
  };

  return ConfigSchema.parse(mergedConfig);
}

/**
 * Loads configuration from a JSON file (legacy, requires sshServer)
 */
export async function loadConfig(
  configPath: string = './config.json',
): Promise<Config> {
  if (!(await fileExists(configPath))) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  try {
    const content = await readFileText(configPath);
    const rawConfig = JSON.parse(content);
    return ConfigSchema.parse(rawConfig);
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

/**
 * Creates a config object from partial input with defaults
 */
export function createConfig(input: z.input<typeof ConfigSchema>): Config {
  return ConfigSchema.parse(input);
}

/**
 * Export schemas for external use
 */
export { ConfigSchema, SSHServerSchema, PortRangeSchema, LogLevelSchema };
