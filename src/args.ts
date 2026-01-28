/**
 * Command-line argument parsing for SSH Chain Proxy
 */

import { parseArgs } from "util";
import { logger } from "./logger.ts";

export interface ParsedArgs {
  /** SSH server (positional argument or from config) */
  sshServer?: string;
  /** Path to config file */
  configPath?: string;
  /** HTTP proxy host */
  httpProxyHost?: string;
  /** HTTP proxy port */
  httpProxyPort?: number;
  /** Log level */
  logLevel?: "debug" | "info" | "warn" | "error";
  /** Show help */
  help: boolean;
  /** Show version */
  version: boolean;
}

const HELP_TEXT = `
SSH Chain Proxy - HTTP proxy through SSH SOCKS5 tunnel

Usage:
  ssh-chain [options] [ssh-server]
  ssh-chain <ssh-server>
  ssh-chain -c <config-file>
  ssh-chain <ssh-server> -c <config-file>

Arguments:
  ssh-server              SSH host (hostname, IP, or ~/.ssh/config Host entry)
                          This overrides sshServer in config file

Options:
  -c, --config <path>     Path to config file (default: ./config.json)
  -H, --host <host>       HTTP proxy host/IP (default: 127.0.0.1)
  -p, --port <port>       HTTP proxy port (default: 4080)
  -l, --log-level <level> Log level: debug, info, warn, error (default: info)
  -h, --help              Show this help message
  -v, --version           Show version

Examples:
  ssh-chain my-server                    # Connect using ~/.ssh/config host
  ssh-chain user@192.168.1.100           # Connect with user@host
  ssh-chain -c ./custom-config.json      # Use custom config file
  ssh-chain my-server -p 8080            # Use custom HTTP proxy port
  ssh-chain my-server --log-level debug  # Enable debug logging
`;

export function printHelp(): void {
  logger.raw(HELP_TEXT.trim());
}

/** Build-time git hash (injected via --define during build) */
declare const BUILD_GIT_HASH: string | undefined;
/** Build-time git dirty flag (injected via --define during build) */
declare const BUILD_GIT_DIRTY: boolean | undefined;

function getGitHash(): string | null {
  // Use build-time constant if available
  if (typeof BUILD_GIT_HASH !== "undefined" && BUILD_GIT_HASH) {
    return BUILD_GIT_HASH;
  }
  return null;
}

function isGitDirty(): boolean {
  return typeof BUILD_GIT_DIRTY !== "undefined" && BUILD_GIT_DIRTY === true;
}

export function printVersion(): void {
  // Read version from package.json
  const pkg = require("../package.json");
  const version = pkg.version || "0.0.0";
  const gitHash = getGitHash();
  const dirtyIndicator = isGitDirty() ? " 🔧" : "";
  const versionStr = gitHash ? `${version} (${gitHash})${dirtyIndicator}` : version;
  logger.raw(`ssh-chain v${versionStr}`);
}

export function parseArgv(argv: string[] = process.argv): ParsedArgs {
  const { values, positionals } = parseArgs({
    args: argv.slice(2), // Skip node/bun and script path
    options: {
      config: {
        type: "string",
        short: "c",
      },
      host: {
        type: "string",
        short: "H",
      },
      port: {
        type: "string",
        short: "p",
      },
      "log-level": {
        type: "string",
        short: "l",
      },
      help: {
        type: "boolean",
        short: "h",
        default: false,
      },
      version: {
        type: "boolean",
        short: "v",
        default: false,
      },
    },
    allowPositionals: true,
    strict: true,
  });

  // Parse port if provided
  let httpProxyPort: number | undefined;
  if (values.port) {
    const parsed = parseInt(values.port, 10);
    if (isNaN(parsed) || parsed < 1 || parsed > 65535) {
      throw new Error(`Invalid port number: ${values.port}`);
    }
    httpProxyPort = parsed;
  }

  // Validate log level
  let logLevel: ParsedArgs["logLevel"];
  if (values["log-level"]) {
    const level = values["log-level"];
    if (!["debug", "info", "warn", "error"].includes(level)) {
      throw new Error(
        `Invalid log level: ${level}. Must be one of: debug, info, warn, error`
      );
    }
    logLevel = level as ParsedArgs["logLevel"];
  }

  // Get SSH server from positional argument (first non-option argument)
  const sshServer = positionals[0];

  return {
    sshServer,
    configPath: values.config,
    httpProxyHost: values.host,
    httpProxyPort,
    logLevel,
    help: values.help ?? false,
    version: values.version ?? false,
  };
}
