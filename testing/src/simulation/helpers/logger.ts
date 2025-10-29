import prettier from "prettier/standalone";
import babelPlugin from "prettier/plugins/babel";
import estreePlugin from "prettier/plugins/estree";

type LogLevel = 'Error' | 'Warning' | 'Info' | 'Verbose';

type Language = 'js' | 'wgsl' | 'wasm';

const LogLevel: LogLevel = 'Verbose';

export default class Logger {
    private context: string;
    private color: string;

    constructor(context: string, color: string = 'black') {
        this.context = context;
        this.color = color;
    }

    log(message: string, ...args: any[]) {
        if (LogLevel === 'Verbose')
            console.log(`%c[${this.context}] : ${message}`, `color: ${this.color}`, ...args);
    }

    info(message: string, ...args: any[]) {
        if (LogLevel === 'Info' || LogLevel === 'Verbose')
            console.info(`[${this.context}] INFO: ${message}`, ...args);
    }

    warn(message: string, ...args: any[]) {
        if (LogLevel === 'Warning' || LogLevel === 'Info' || LogLevel === 'Verbose')
            console.warn(`[${this.context}] WARNING: ${message}`, ...args);
    }

    error(message: string, ...args: any[]) {
        if (LogLevel === 'Error' || LogLevel === 'Warning' || LogLevel === 'Info' || LogLevel === 'Verbose')
            console.error(`[${this.context}] ERROR: ${message}`, ...args);
    }

    async code(label: string, code: string, language: Language) {

        let formattedCode: string;

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

        console.log(`%c[${this.context}] ${label}:\n%c${formattedCode}`, `color: ${this.color}; font-weight: bold;`, 'color: gray; font-family: monospace;');
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