/**
 * @module logger
 * Structured, colour-coded console logger with global listeners.
 *
 * The {@link Logger} class provides context-aware logging with configurable
 * verbosity via {@link LogLevel}. A global listener mechanism allows the
 * {@link SimulationTracker} to intercept all log output for inclusion in
 * tracking reports.
 */

import prettier from "prettier/standalone";
import babelPlugin from "prettier/plugins/babel";
import estreePlugin from "prettier/plugins/estree";

/**
 * Log verbosity levels, ordered from most restrictive to most verbose.
 *
 * | Level     | Value | Description                                |
 * |-----------|-------|--------------------------------------------|
 * | `None`    | 0     | Suppress all output.                       |
 * | `Error`   | 1     | Errors only.                               |
 * | `Warning` | 2     | Errors and warnings.                       |
 * | `Info`    | 3     | Errors, warnings, and informational output.|
 * | `Verbose` | 4     | All output including debug-level messages. |
 */
export enum LogLevel {
  None = 0,
  Error = 1,
  Warning = 2,
  Info = 3,
  Verbose = 4,
}

/** @internal Supported code languages for the {@link Logger.code} method. */
type Language = "js" | "wgsl" | "wasm" | "dsl";

/** @internal Global log level state shared across all Logger instances. */
let GlobalLogLevel: LogLevel = LogLevel.Verbose;

/**
 * Structured, colour-coded console logger with global listener support.
 *
 * Each instance is bound to a named context (e.g. `'Compiler'`, `'WebGPU'`)
 * and a CSS colour for styled `console.log` output.
 *
 * @example
 * ```ts
 * import Logger, { LogLevel } from '@websimbench/agentyx';
 *
 * Logger.setGlobalLogLevel(LogLevel.Info);
 *
 * const log = new Logger('MyModule', 'purple');
 * log.info('Initialised');
 * log.error('Something went wrong');
 * ```
 */
export default class Logger {
  private context: string;
  private color: string;

  /** @internal Global listener registry for log interception. */
  private static listeners: ((
    level: LogLevel,
    context: string,
    message: string,
    args: unknown[],
  ) => void)[] = [];

  /**
   * Create a new logger instance.
   *
   * @param context - Human-readable context name shown in log prefixes.
   * @param color - CSS colour string for styled console output.
   */
  constructor(context: string, color: string = "black") {
    this.context = context;
    this.color = color;
  }

  /**
   * Set the global minimum log level for all Logger instances.
   *
   * Messages below this level are silently discarded.
   *
   * @param level - The new minimum log level.
   */
  static setGlobalLogLevel(level: LogLevel): void {
    GlobalLogLevel = level;
  }

  /**
   * Register a global listener that receives all log messages.
   *
   * @param listener - Callback invoked for each log message.
   */
  static addListener(
    listener: (
      level: LogLevel,
      context: string,
      message: string,
      args: unknown[],
    ) => void,
  ): void {
    this.listeners.push(listener);
  }

  /**
   * Remove a previously registered global listener.
   *
   * @param listener - The listener callback to remove.
   */
  static removeListener(
    listener: (
      level: LogLevel,
      context: string,
      message: string,
      args: unknown[],
    ) => void,
  ): void {
    this.listeners = this.listeners.filter((l) => l !== listener);
  }

  /**
   * Emit a log message to all registered listeners.
   *
   * @param level - Log level of the message.
   * @param message - Primary message string.
   * @param args - Additional arguments (serialised into the message for listeners).
   * @internal
   */
  private emit(level: LogLevel, message: string, ...args: unknown[]): void {
    const fullMessage =
      args.length > 0
        ? `${message} ${args.map((arg) => (typeof arg === "object" ? JSON.stringify(arg) : String(arg))).join(" ")}`
        : message;
    Logger.listeners.forEach((listener) =>
      listener(level, this.context, fullMessage, args),
    );
  }

  /**
   * Log a verbose/debug message.
   *
   * @param message - Message string.
   * @param args - Additional values to log.
   */
  log(message: string, ...args: unknown[]): void {
    if (GlobalLogLevel >= LogLevel.Verbose) {
      this.emit(LogLevel.Verbose, message, ...args);
      console.log(
        `%c[${this.context}] : ${message}`,
        `color: ${this.color}`,
        ...args,
      );
    }
  }

  /**
   * Log an informational message.
   *
   * @param message - Message string.
   * @param args - Additional values to log.
   */
  info(message: string, ...args: unknown[]): void {
    if (GlobalLogLevel >= LogLevel.Info) {
      this.emit(LogLevel.Info, message, ...args);
      console.info(`[${this.context}] INFO: ${message}`, ...args);
    }
  }

  /**
   * Log a warning message.
   *
   * @param message - Message string.
   * @param args - Additional values to log.
   */
  warn(message: string, ...args: unknown[]): void {
    if (GlobalLogLevel >= LogLevel.Warning) {
      this.emit(LogLevel.Warning, message, ...args);
      console.warn(`[${this.context}] WARNING: ${message}`, ...args);
    }
  }

  /**
   * Log an error message.
   *
   * @param message - Message string.
   * @param args - Additional values to log.
   */
  error(message: string, ...args: unknown[]): void {
    if (GlobalLogLevel >= LogLevel.Error) {
      this.emit(LogLevel.Error, message, ...args);
      console.error(`[${this.context}] ERROR: ${message}`, ...args);
    }
  }

  /**
   * Log an error with surrounding source-code context.
   *
   * Shows 2 lines above and below the error line with a `>` marker
   * pointing to the offending line.
   *
   * @param message - Error description.
   * @param code - Full source code string.
   * @param lineIndex - Zero-based line index where the error occurred.
   */
  codeError(message: string, code: string, lineIndex: number): void {
    if (GlobalLogLevel >= LogLevel.Error) {
      const lines = code.split("\n");

      const contextStart = Math.max(0, lineIndex - 2);
      const contextEnd = Math.min(lines.length - 1, lineIndex + 2);

      const contextLines = lines
        .slice(contextStart, contextEnd + 1)
        .map((l, i) => {
          const currentLineIndex = contextStart + i;
          const marker = currentLineIndex === lineIndex ? " > " : "   ";
          return `${marker}${currentLineIndex + 1}| ${l}`;
        })
        .join("\n");

      const formattedMessage = `${message}\nAt line ${lineIndex + 1}:\n${contextLines}`;

      this.emit(LogLevel.Error, formattedMessage);
      console.error(
        `[${this.context}] CODE ERROR: ${message}`,
        "\n",
        contextLines,
      );
    }
  }

  /**
   * Pretty-print a code snippet to the console with syntax-appropriate formatting.
   *
   * JavaScript code is formatted with Prettier; WGSL and WAT use a simple
   * indentation-based formatter.
   *
   * @param label - Descriptive label for the code block.
   * @param code - The source code to format and display.
   * @param language - Language identifier for formatting.
   */
  async code(label: string, code: string, language: Language): Promise<void> {
    if (GlobalLogLevel >= LogLevel.Verbose) {
      let formattedCode: string;

      try {
        switch (language) {
          case "js":
            formattedCode = await this.formatJS(code);
            break;
          case "wgsl":
          case "wasm":
            formattedCode = this.formatGeneralCode(code);
            break;
          default:
            formattedCode = code;
        }
      } catch {
        formattedCode = code;
      }

      console.log(
        `%c[${this.context}] ${label}:\n%c${formattedCode}`,
        `color: ${this.color}; font-weight: bold;`,
        "color: gray; font-family: monospace;",
      );
    }
  }

  /**
   * Format JavaScript code using Prettier.
   *
   * @param code - Raw JavaScript source.
   * @returns Formatted JavaScript source.
   * @internal
   */
  private async formatJS(code: string): Promise<string> {
    return prettier.format(code, {
      parser: "babel",
      plugins: [babelPlugin, estreePlugin],
      semi: true,
      singleQuote: true,
      tabWidth: 2,
    });
  }

  /**
   * Apply simple indentation-based formatting to WGSL/WAT code.
   *
   * Adjusts indentation based on brace/bracket nesting.
   *
   * @param code - Raw WGSL or WAT source.
   * @returns Re-indented source.
   * @internal
   */
  private formatGeneralCode(code: string): string {
    const lines = code.split(/\r?\n/).map((line) => {
      let s = line.replace(/\t/g, "  ");
      s = s.replace(/\s+$/, "");
      return s;
    });

    let indentLevel = 0;
    const indentSize = 2;
    const out: string[] = [];

    for (const raw of lines) {
      const trimmed = raw.trim();

      if (
        trimmed.startsWith("}") ||
        trimmed.startsWith("]);") ||
        trimmed.startsWith("}")
      ) {
        indentLevel = Math.max(indentLevel - 1, 0);
      }

      const indent = " ".repeat(indentLevel * indentSize);
      out.push(indent + trimmed);

      if (
        trimmed.endsWith("{") ||
        trimmed.endsWith("([") ||
        trimmed.endsWith("(")
      ) {
        indentLevel++;
      }
    }

    return out.join("\n") + "\n";
  }
}
