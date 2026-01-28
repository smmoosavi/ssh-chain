/**
 * Centralized logging module for SSH Chain Proxy
 * Provides structured logging with support for advanced terminal features
 */

export type LogLevel = "debug" | "info" | "warn" | "error";

const LOG_LEVEL_PRIORITY: Record<LogLevel, number> = {
  debug: 0,
  info: 1,
  warn: 2,
  error: 3,
};

export interface Logger {
  /** Log a debug message */
  debug: (...args: unknown[]) => void;
  /** Log an info message */
  info: (...args: unknown[]) => void;
  /** Log a warning message */
  warn: (...args: unknown[]) => void;
  /** Log an error message */
  error: (...args: unknown[]) => void;
  /** Log a raw message without any prefix or processing */
  raw: (...args: unknown[]) => void;
  /** Print an empty line */
  emptyLine: () => void;
  /** Write raw text to stdout without newline */
  write: (text: string) => void;
  /** Write raw text to stderr without newline */
  writeError: (text: string) => void;
  /** Clear the current line */
  clearLine: () => void;
  /** Move cursor to beginning of line */
  carriageReturn: () => void;
  /** Check if a log level should be displayed */
  shouldLog: (level: LogLevel) => boolean;
  /** Get current log level */
  getLevel: () => LogLevel;
  /** Set log level */
  setLevel: (level: LogLevel) => void;
}

/**
 * Create a logger instance
 */
export function createLogger(initialLevel: LogLevel = "info"): Logger {
  let currentLevel = initialLevel;

  const shouldLog = (level: LogLevel): boolean => {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel];
  };

  return {
    debug: (...args: unknown[]) => {
      if (shouldLog("debug")) {
        console.log(...args);
      }
    },

    info: (...args: unknown[]) => {
      if (shouldLog("info")) {
        console.log(...args);
      }
    },

    warn: (...args: unknown[]) => {
      if (shouldLog("warn")) {
        console.warn(...args);
      }
    },

    error: (...args: unknown[]) => {
      if (shouldLog("error")) {
        console.error(...args);
      }
    },

    raw: (...args: unknown[]) => {
      console.log(...args);
    },

    emptyLine: () => {
      console.log();
    },

    write: (text: string) => {
      process.stdout.write(text);
    },

    writeError: (text: string) => {
      process.stderr.write(text);
    },

    clearLine: () => {
      if (process.stdout.isTTY) {
        process.stdout.write("\x1b[2K");
      }
    },

    carriageReturn: () => {
      if (process.stdout.isTTY) {
        process.stdout.write("\r");
      }
    },

    shouldLog,

    getLevel: () => currentLevel,

    setLevel: (level: LogLevel) => {
      currentLevel = level;
    },
  };
}

/**
 * Default global logger instance
 */
export const logger = createLogger("info");
