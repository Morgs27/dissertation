import prettier from "prettier/standalone";
import babelPlugin from "prettier/plugins/babel";
import estreePlugin from "prettier/plugins/estree";

export enum LogLevel {
    None = 0,
    Error = 1,
    Warning = 2,
    Info = 3,
    Verbose = 4
}

type Language = 'js' | 'wgsl' | 'wasm' | 'dsl';

// Global log level state
let GlobalLogLevel: LogLevel = LogLevel.Verbose;

export default class Logger {
    private context: string;
    private color: string;
    private static listeners: ((level: LogLevel, context: string, message: string, args: any[]) => void)[] = [];

    constructor(context: string, color: string = 'black') {
        this.context = context;
        this.color = color;
    }

    static setGlobalLogLevel(level: LogLevel) {
        GlobalLogLevel = level;
    }

    static addListener(listener: (level: LogLevel, context: string, message: string, args: any[]) => void) {
        this.listeners.push(listener);
    }

    static removeListener(listener: (level: LogLevel, context: string, message: string, args: any[]) => void) {
        this.listeners = this.listeners.filter(l => l !== listener);
    }

    private emit(level: LogLevel, message: string, ...args: any[]) {
        // Concatenate args into the message for display in UI
        const fullMessage = args.length > 0
            ? `${message} ${args.map(arg => typeof arg === 'object' ? JSON.stringify(arg) : String(arg)).join(' ')}`
            : message;
        Logger.listeners.forEach(listener => listener(level, this.context, fullMessage, args));
    }

    log(message: string, ...args: any[]) {
        if (GlobalLogLevel >= LogLevel.Verbose) {
            this.emit(LogLevel.Verbose, message, ...args);
            console.log(`%c[${this.context}] : ${message}`, `color: ${this.color}`, ...args);
        }
    }

    info(message: string, ...args: any[]) {
        if (GlobalLogLevel >= LogLevel.Info) {
            this.emit(LogLevel.Info, message, ...args);
            console.info(`[${this.context}] INFO: ${message}`, ...args);
        }
    }

    warn(message: string, ...args: any[]) {
        if (GlobalLogLevel >= LogLevel.Warning) {
            this.emit(LogLevel.Warning, message, ...args);
            console.warn(`[${this.context}] WARNING: ${message}`, ...args);
        }
    }

    error(message: string, ...args: any[]) {
        if (GlobalLogLevel >= LogLevel.Error) {
            this.emit(LogLevel.Error, message, ...args);
            console.error(`[${this.context}] ERROR: ${message}`, ...args);
        }
    }

    codeError(message: string, code: string, lineIndex: number) {
        if (GlobalLogLevel >= LogLevel.Error) {
            const lines = code.split('\n');
            const line = lines[lineIndex];
            const contextStart = Math.max(0, lineIndex - 2);
            const contextEnd = Math.min(lines.length - 1, lineIndex + 2);
            
            const contextLines = lines.slice(contextStart, contextEnd + 1).map((l, i) => {
                const currentLineIndex = contextStart + i;
                const marker = currentLineIndex === lineIndex ? ' > ' : '   ';
                return `${marker}${currentLineIndex + 1}| ${l}`;
            }).join('\n');

            const formattedMessage = `${message}\nAt line ${lineIndex + 1}:\n${contextLines}`;
            
            this.emit(LogLevel.Error, formattedMessage);
            console.error(`[${this.context}] CODE ERROR: ${message}`, '\n', contextLines);
        }
    }

    async code(label: string, code: string, language: Language) {
        if (GlobalLogLevel >= LogLevel.Verbose) {
            let formattedCode: string;

            try {
                switch (language) {
                    case 'js':
                        formattedCode = await this.formatJS(code);
                        break;
                    case 'wgsl':
                        formattedCode = this.formatGeneralCode(code);
                        break;
                    case 'wasm':
                        formattedCode = this.formatGeneralCode(code);
                        break;
                    default:
                        formattedCode = code;
                }
            } catch (e) {
                formattedCode = code;
            }

            console.log(`%c[${this.context}] ${label}:\n%c${formattedCode}`, `color: ${this.color}; font-weight: bold;`, 'color: gray; font-family: monospace;');
        }
    }

    private async formatJS(code: string) {
        return prettier.format(code, {
            parser: "babel",
            plugins: [babelPlugin, estreePlugin],
            semi: true,
            singleQuote: true,
            tabWidth: 2,
        });
    }

    private formatGeneralCode(code: string): string {
        const lines = code
            .split(/\r?\n/)
            .map(line => {
                let s = line.replace(/\t/g, "  ");

                s = s.replace(/\s+$/, "");

                return s;
            });

        let indentLevel = 0;
        const indentSize = 2;
        const out: string[] = [];

        for (const raw of lines) {
            const trimmed = raw.trim();

            if (trimmed.startsWith("}") || trimmed.startsWith("]);") || trimmed.startsWith("}")) {
                indentLevel = Math.max(indentLevel - 1, 0);
            }

            const indent = " ".repeat(indentLevel * indentSize);
            out.push(indent + trimmed);

            if (trimmed.endsWith("{") || trimmed.endsWith("([") || trimmed.endsWith("(")) {
                indentLevel++;
            }
        }

        return out.join("\n") + "\n";
    }
}
