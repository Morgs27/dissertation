import { useState, useEffect } from 'react';
import Logger, { LogLevel } from '../simulation/helpers/logger';

export type LogMessage = {
  level: string;
  context: string;
  message: string;
  timestamp: number;
};

export function useLogger() {
  const [logs, setLogs] = useState<LogMessage[]>([]);

  useEffect(() => {
    const handleLog = (level: LogLevel, context: string, message: string) => {
      // Convert LogLevel enum to string representation for display
      const levelStr = LogLevel[level] || 'Unknown';
      setLogs(prev => [...prev.slice(-999), { level: levelStr, context, message, timestamp: Date.now() }]);
    };
    Logger.addListener(handleLog);
    return () => {
      Logger.removeListener(handleLog);
    };
  }, []);

  const clearLogs = () => setLogs([]);

  return { logs, clearLogs };
}

