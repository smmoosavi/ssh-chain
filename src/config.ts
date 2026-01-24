/**
 * Configuration schema and loader for SSH Chain Proxy
 */

import { z } from "zod";

// SSH Server configuration schema (full object format)
const SSHServerObjectSchema = z.object({
  /** SSH host - can be a hostname, IP, or .ssh/config Host entry */
  host: z.string().min(1, "SSH host is required"),
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
    if (typeof value === "string") {
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
    message: "portRange.min must be less than or equal to max",
  });

// Log level schema
const LogLevelSchema = z.enum(["debug", "info", "warn", "error"]);

// Main configuration schema
const ConfigSchema = z.object({
  /** SSH server configuration */
  sshServer: SSHServerSchema,
  /** Port range for dynamic SOCKS5 proxy allocation */
  portRange: PortRangeSchema.default({ min: 10000, max: 10100 }),
  /** Port for the HTTP proxy server to listen on */
  httpProxyPort: z.number().int().min(1).max(65535).default(4080),
  /** Duration of no data flow before considering connection stalled (seconds) */
  inactivityTimeout: z.number().int().min(1).default(60),
  /** Health check interval in seconds */
  healthCheckInterval: z.number().int().min(1).optional().default(30),
  /** Number of retry attempts before giving up */
  retryAttempts: z.number().int().min(0).optional().default(3),
  /** Logging level */
  logLevel: LogLevelSchema.optional().default("info"),
});

// Export inferred types from schemas
export type SSHServerConfig = z.infer<typeof SSHServerObjectSchema>;
export type PortRangeConfig = z.infer<typeof PortRangeSchema>;
export type Config = z.infer<typeof ConfigSchema>;

/**
 * Loads configuration from a JSON file
 */
export async function loadConfig(
  configPath: string = "./config.json"
): Promise<Config> {
  const file = Bun.file(configPath);

  if (!(await file.exists())) {
    throw new Error(`Configuration file not found: ${configPath}`);
  }

  try {
    const content = await file.text();
    const rawConfig = JSON.parse(content);
    return ConfigSchema.parse(rawConfig);
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
