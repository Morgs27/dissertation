type Verbosity = 'Verbose' | 'Silent';

const visible: Verbosity = 'Silent';

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
}