/**
 * Centralized logging module for SSH Chain Proxy
 * Provides structured logging with support for advanced terminal features
 */

export type LogLevel = 'debug' | 'info' | 'warn' | 'error';

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
  /** Set footer lines that persist at the bottom */
  setFooter: (lines: string[]) => void;
  /** Update a specific footer line by index */
  updateFooterLine: (index: number, line: string) => void;
  /** Clear the footer */
  clearFooter: () => void;
  /** Get current footer lines */
  getFooter: () => string[];
  /** Check if footer is enabled */
  hasFooter: () => boolean;
}

/**
 * Create a logger instance
 */
export function createLogger(initialLevel: LogLevel = 'info'): Logger {
  let currentLevel = initialLevel;
  let footerLines: string[] = [];
  let footerRendered = false;

  const shouldLog = (level: LogLevel): boolean => {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel];
  };

  /**
   * Clear the footer from the terminal (move up and clear each line)
   */
  const clearRenderedFooter = (): void => {
    if (!footerRendered || footerLines.length === 0 || !process.stdout.isTTY) {
      return;
    }
    // Move cursor up N lines and clear each line
    for (let i = 0; i < footerLines.length; i++) {
      process.stdout.write('\x1b[1A'); // Move up one line
      process.stdout.write('\x1b[2K'); // Clear the line
    }
    footerRendered = false;
  };

  /**
   * Build ANSI sequence to clear footer (for buffered output)
   */
  const buildClearFooterSequence = (): string => {
    if (!footerRendered || footerLines.length === 0 || !process.stdout.isTTY) {
      return '';
    }
    let seq = '';
    for (let i = 0; i < footerLines.length; i++) {
      seq += '\x1b[1A\x1b[2K'; // Move up + clear line
    }
    return seq;
  };

  /**
   * Build footer content string
   */
  const buildFooterContent = (): string => {
    if (footerLines.length === 0 || !process.stdout.isTTY) {
      return '';
    }
    return footerLines.join('\n') + '\n';
  };

  /**
   * Render the footer to the terminal
   */
  const renderFooter = (): void => {
    if (footerLines.length === 0 || !process.stdout.isTTY) {
      return;
    }
    for (const line of footerLines) {
      process.stdout.write(line + '\n');
    }
    footerRendered = true;
  };

  /**
   * Log with footer handling: clear footer, log, re-render footer
   * Buffers all output and writes at once to prevent flickering
   */
  const logWithFooter = (message: string): void => {
    if (!process.stdout.isTTY || footerLines.length === 0) {
      // No footer or not a TTY, just write directly
      process.stdout.write(message + '\n');
      return;
    }

    // Buffer: clear footer + message + footer
    const buffer =
      buildClearFooterSequence() + message + '\n' + buildFooterContent();
    footerRendered = false; // Will be true after write
    process.stdout.write(buffer);
    footerRendered = true;
  };

  /**
   * Log to stderr with footer handling
   */
  const logWithFooterStderr = (message: string): void => {
    if (!process.stdout.isTTY || footerLines.length === 0) {
      process.stderr.write(message + '\n');
      return;
    }

    // Clear footer on stdout, write to stderr, re-render footer on stdout
    const clearSeq = buildClearFooterSequence();
    const footerContent = buildFooterContent();
    footerRendered = false;
    process.stdout.write(clearSeq);
    process.stderr.write(message + '\n');
    process.stdout.write(footerContent);
    footerRendered = true;
  };

  /**
   * Format arguments to string (like console.log does)
   */
  const formatArgs = (...args: unknown[]): string => {
    return args
      .map((arg) => (typeof arg === 'string' ? arg : String(arg)))
      .join(' ');
  };

  return {
    debug: (...args: unknown[]) => {
      if (shouldLog('debug')) {
        logWithFooter(formatArgs(...args));
      }
    },

    info: (...args: unknown[]) => {
      if (shouldLog('info')) {
        logWithFooter(formatArgs(...args));
      }
    },

    warn: (...args: unknown[]) => {
      if (shouldLog('warn')) {
        logWithFooterStderr(formatArgs(...args));
      }
    },

    error: (...args: unknown[]) => {
      if (shouldLog('error')) {
        logWithFooterStderr(formatArgs(...args));
      }
    },

    raw: (...args: unknown[]) => {
      logWithFooter(formatArgs(...args));
    },

    emptyLine: () => {
      logWithFooter('');
    },

    write: (text: string) => {
      clearRenderedFooter();
      process.stdout.write(text);
      renderFooter();
    },

    writeError: (text: string) => {
      clearRenderedFooter();
      process.stderr.write(text);
      renderFooter();
    },

    clearLine: () => {
      if (process.stdout.isTTY) {
        process.stdout.write('\x1b[2K');
      }
    },

    carriageReturn: () => {
      if (process.stdout.isTTY) {
        process.stdout.write('\r');
      }
    },

    shouldLog,

    getLevel: () => currentLevel,

    setLevel: (level: LogLevel) => {
      currentLevel = level;
    },

    setFooter: (lines: string[]) => {
      clearRenderedFooter();
      footerLines = [...lines];
      renderFooter();
    },

    updateFooterLine: (index: number, line: string) => {
      if (index >= 0 && index < footerLines.length) {
        clearRenderedFooter();
        footerLines[index] = line;
        renderFooter();
      }
    },

    clearFooter: () => {
      clearRenderedFooter();
      footerLines = [];
    },

    getFooter: () => [...footerLines],

    hasFooter: () => footerLines.length > 0,
  };
}

/**
 * Default global logger instance
 */
export const logger = createLogger('info');
