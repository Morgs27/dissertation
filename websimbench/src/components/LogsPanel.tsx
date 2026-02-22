import { Button } from "@/components/ui/button";
import { Trash, Terminal } from "@phosphor-icons/react";
import { LogMessage } from '../hooks/useLogger';
import { useState, useRef, useEffect } from 'react';
import { LogLevel } from '@websimbench/agentyx';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select"

interface LogsPanelProps {
  logs: LogMessage[];
  onClear: () => void;
}

export const LogsPanel = ({ logs, onClear }: LogsPanelProps) => {
  const [filterLevel, setFilterLevel] = useState<string>('All');
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  const filteredLogs = logs.filter(log => {
    if (filterLevel === 'All') return true;
    const logValues: Record<string, number> = {
      'Error': LogLevel.Error,
      'Warning': LogLevel.Warning,
      'Info': LogLevel.Info,
      'Verbose': LogLevel.Verbose,
      'None': LogLevel.None
    };
    const filterValue = logValues[filterLevel] || LogLevel.Verbose;
    const currentLogValue = logValues[log.level] || LogLevel.Info;
    return currentLogValue <= filterValue;
  });

  useEffect(() => {
    if (shouldAutoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop = scrollContainerRef.current.scrollHeight;
    }
  }, [filteredLogs, shouldAutoScroll]);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } = scrollContainerRef.current;
      // If user is within 50px of the bottom, enable auto-scroll
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
      setShouldAutoScroll(isNearBottom);
    }
  };

  return (
    <div className="flex flex-col h-full bg-[#0d1619]">
      <div className="h-10 flex px-4 items-center bg-black/40 border-b border-white/5 shrink-0">
        <Terminal className="mr-2 text-tropicalTeal" size={16} />
        {/* <span className="font-bold mr-4 text-xs tracking-wider uppercase text-gray-400">Console</span> */}

        <Select value={filterLevel} onValueChange={setFilterLevel}>
          <SelectTrigger className="w-[110px] h-7 text-[10px] bg-white/5 border-none focus:ring-0">
            <SelectValue placeholder="All Levels" />
          </SelectTrigger>
          <SelectContent className="bg-[#1a2e33] border-white/10 text-xs">
            <SelectItem value="All">All Levels</SelectItem>
            <SelectItem value="Verbose">Verbose</SelectItem>
            <SelectItem value="Info">Info</SelectItem>
            <SelectItem value="Warning">Warning</SelectItem>
            <SelectItem value="Error">Error</SelectItem>
          </SelectContent>
        </Select>

        <Button
          className="ml-auto text-gray-300 hover:text-red-400 hover:bg-red-500/10 px-2 flex items-center gap-1.5"
          onClick={onClear}
        >
          <Trash size={14} />
          <span className="text-[12px] ">Clear</span>
        </Button>
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="flex-1 overflow-y-auto p-3 font-mono text-[13px] leading-relaxed"
      >
        {filteredLogs.length === 0 ? (
          <div className="h-full flex items-center justify-center text-gray-600 italic text-xs">
            No logs to display
          </div>
        ) : (
          <div className="flex flex-col gap-1">
            {filteredLogs.map((log, i) => (
              <div key={i} className="group hover:bg-white/5 rounded px-1 transition-colors">
                <span className="text-gray-600 text-[11px] mr-2">[{new Date(log.timestamp).toLocaleTimeString([], { hour12: false })}]</span>
                <span className={`font-bold mr-2 text-[11px] uppercase ${log.level === 'Error' ? 'text-red-400' :
                  log.level === 'Warning' ? 'text-orange-400' :
                    'text-tropicalTeal'
                  }`}>[{log.context}]</span>
                <span className={`whitespace-pre-wrap ${log.level === 'Error' ? 'text-red-300' :
                  log.level === 'Warning' ? 'text-orange-200' :
                    'text-gray-300'
                  }`}>{log.message}</span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
