import prettier from "prettier/standalone";
import babelPlugin from "prettier/plugins/babel";
import estreePlugin from "prettier/plugins/estree";

type Verbosity = 'Verbose' | 'Silent';

type Language = 'js' | 'wgsl' | 'wasm';

const visible: Verbosity = 'Verbose';

export default class Logger {
    private context: string;

    constructor(context: string) {
        this.context = context;
    }

    log(message: string, ...args: any[]) {
        if (visible === 'Verbose')
            console.log(`[${this.context}] : ${message}`, ...args);
    }

    warn(message: string, ...args: any[]) {
        console.warn(`[${this.context}] WARNING: ${message}`, ...args);
    }

    error(message: string, ...args: any[]) {
        console.error(`[${this.context}] ERROR: ${message}`, ...args);
    }

    info(message: string, ...args: any[]) {
        console.info(`[${this.context}] INFO: ${message}`, ...args);
    }

    success(message: string, ...args: any[]) {
        console.log(`%c[${this.context}] SUCCESS: ${message}`, 'color: green; font-weight: bold;', ...args);
    }

    async code(label: string, code: string, language: Language) {
        switch (language) {
            case 'js':
                console.log(`%c[${this.context}] CODE: ${label}\n${await this.formatJS(code)}`, 'color: blue;');
                break;
            case 'wgsl':
                console.log(`%c[${this.context}] CODE: ${label}\n${this.formatWGSL(code)}`, 'color: blue;');
                break;
            case 'wasm':
                console.log(`%c[${this.context}] CODE: ${label}\n${this.formatWASM(code)}`, 'color: blue;');
                break;
            default:
                console.log(`[${this.context}] CODE: ${label}\n${code}`);
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

    private formatWGSL(code: string): string {
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

    private formatWASM(code: string): string {
        return this.formatWGSL(code);
    }
}