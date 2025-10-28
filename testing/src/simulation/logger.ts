export class Logger {
    private context: string;

    constructor(context: string) {
        this.context = context;
    }

    log(message: string, ...args: any[]) {
        console.log(`[${this.context}] : ${message}`, ...args);
    }
}

export default Logger;
