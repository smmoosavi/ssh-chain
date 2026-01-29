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

  // Buffer for batching output
  let stdoutBuffer = '';
  let stderrBuffer = '';

  const shouldLog = (level: LogLevel): boolean => {
    return LOG_LEVEL_PRIORITY[level] >= LOG_LEVEL_PRIORITY[currentLevel];
  };

  /**
   * Flush stdout buffer
   */
  const flushStdout = (): void => {
    if (stdoutBuffer) {
      process.stdout.write(stdoutBuffer);
      stdoutBuffer = '';
    }
  };

  /**
   * Flush stderr buffer
   */
  const flushStderr = (): void => {
    if (stderrBuffer) {
      process.stderr.write(stderrBuffer);
      stderrBuffer = '';
    }
  };

  /**
   * Flush all buffers
   */
  const flush = (): void => {
    flushStdout();
    flushStderr();
  };

  /**
   * Buffer content for stdout
   */
  const bufferStdout = (content: string): void => {
    stdoutBuffer += content;
  };

  /**
   * Buffer content for stderr
   */
  const bufferStderr = (content: string): void => {
    stderrBuffer += content;
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
   * Buffer clear footer sequence (marks footer as not rendered)
   */
  const bufferClearFooter = (): void => {
    const seq = buildClearFooterSequence();
    if (seq) {
      bufferStdout(seq);
      footerRendered = false;
    }
  };

  /**
   * Buffer footer render (marks footer as rendered)
   */
  const bufferRenderFooter = (): void => {
    const content = buildFooterContent();
    if (content) {
      bufferStdout(content);
      footerRendered = true;
    }
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

    // Buffer: clear footer + message + footer, then flush
    bufferClearFooter();
    bufferStdout(message + '\n');
    bufferRenderFooter();
    flush();
  };

  /**
   * Log to stderr with footer handling
   */
  const logWithFooterStderr = (message: string): void => {
    if (!process.stdout.isTTY || footerLines.length === 0) {
      process.stderr.write(message + '\n');
      return;
    }

    // Buffer: clear footer, flush stdout, write stderr, buffer footer, flush
    bufferClearFooter();
    flushStdout();
    process.stderr.write(message + '\n');
    bufferRenderFooter();
    flushStdout();
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
      if (!process.stdout.isTTY || footerLines.length === 0) {
        process.stdout.write(text);
        return;
      }
      bufferClearFooter();
      bufferStdout(text);
      bufferRenderFooter();
      flush();
    },

    writeError: (text: string) => {
      if (!process.stdout.isTTY || footerLines.length === 0) {
        process.stderr.write(text);
        return;
      }
      bufferClearFooter();
      flushStdout();
      process.stderr.write(text);
      bufferRenderFooter();
      flushStdout();
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
      if (!process.stdout.isTTY) {
        footerLines = [...lines];
        return;
      }
      bufferClearFooter();
      footerLines = [...lines];
      bufferRenderFooter();
      flush();
    },

    updateFooterLine: (index: number, line: string) => {
      if (index >= 0 && index < footerLines.length) {
        if (!process.stdout.isTTY) {
          footerLines[index] = line;
          return;
        }
        bufferClearFooter();
        footerLines[index] = line;
        bufferRenderFooter();
        flush();
      }
    },

    clearFooter: () => {
      if (!process.stdout.isTTY) {
        footerLines = [];
        return;
      }
      bufferClearFooter();
      footerLines = [];
      flush();
    },

    getFooter: () => [...footerLines],

    hasFooter: () => footerLines.length > 0,
  };
}

/**
 * Default global logger instance
 */
export const logger = createLogger('info');
