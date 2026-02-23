import { useState, useEffect } from "react";
import { Logger, LogLevel } from "@websimbench/agentyx";

/**
 * Definition of a formatted log message.
 */
export type LogMessage = {
  level: string;
  context: string;
  message: string;
  timestamp: number;
};

/**
 * Hook to interface with the core Agentyx Logger.
 * Captures global simulation logs and stores a running history of the most recent 1000 logs.
 *
 * @returns An object containing the current log history and a utility to clear them.
 */
export function useLogger() {
  const [logs, setLogs] = useState<LogMessage[]>([]);

  useEffect(() => {
    const handleLog = (level: LogLevel, context: string, message: string) => {
      // Convert LogLevel enum to string representation for display
      const levelStr = LogLevel[level] || "Unknown";
      setLogs((prev) => [
        ...prev.slice(-999),
        { level: levelStr, context, message, timestamp: Date.now() },
      ]);
    };
    Logger.addListener(handleLog);
    return () => {
      Logger.removeListener(handleLog);
    };
  }, []);

  const clearLogs = () => setLogs([]);

  return { logs, clearLogs };
}
