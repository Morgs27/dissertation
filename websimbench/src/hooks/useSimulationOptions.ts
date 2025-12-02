import { useState, useEffect } from 'react';
import Logger, { LogLevel } from '../simulation/helpers/logger';

export type AgentShape = 'circle' | 'square';

export interface SimulationAppearanceOptions {
  agentColor: string;
  backgroundColor: string;
  agentSize: number;
  agentShape: AgentShape;
  logLevel: LogLevel;
}

export type UpdateOptionFn = <K extends keyof SimulationAppearanceOptions>(key: K, value: SimulationAppearanceOptions[K]) => void;

const DEFAULT_OPTIONS: SimulationAppearanceOptions = {
  agentColor: '#00FFFF', // Cyan
  backgroundColor: '#000000', // Black
  agentSize: 3,
  agentShape: 'circle',
  logLevel: LogLevel.Info
};

export function useSimulationOptions() {
  const [options, setOptions] = useState<SimulationAppearanceOptions>(() => {
    try {
      const saved = localStorage.getItem('websimbench_options');
      if (saved) {
          const parsed = JSON.parse(saved);
          // Merge with default options to ensure new fields are present
          return { ...DEFAULT_OPTIONS, ...parsed };
      }
      return DEFAULT_OPTIONS;
    } catch (e) {
      return DEFAULT_OPTIONS;
    }
  });

  useEffect(() => {
    localStorage.setItem('websimbench_options', JSON.stringify(options));
    
    // Ensure logLevel is valid before setting
    const level = options.logLevel !== undefined ? options.logLevel : DEFAULT_OPTIONS.logLevel;
    Logger.setGlobalLogLevel(level);
  }, [options]);

  const updateOption: UpdateOptionFn = (key, value) => {
    setOptions(prev => ({ ...prev, [key]: value }));
  };

  const resetOptions = () => setOptions(DEFAULT_OPTIONS);

  return { options, updateOption, resetOptions };
}
