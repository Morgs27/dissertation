import { Trash, Terminal } from "@phosphor-icons/react";
import { LogMessage } from "../../hooks/useLogger";
import { useState, useRef, useEffect } from "react";
import { LogLevel } from "@websimbench/agentyx";
import { NavDropdown } from "@/components/ui/nav-dropdown";
import { HeaderIconButton } from "@/components/ui/header-icon-button";
import "./LogsPanel.css";

interface LogsPanelProps {
  logs: LogMessage[];
  onClear: () => void;
}

export const LogsPanel = ({ logs, onClear }: LogsPanelProps) => {
  const [filterLevel, setFilterLevel] = useState<string>("All");
  const scrollContainerRef = useRef<HTMLDivElement>(null);
  const [shouldAutoScroll, setShouldAutoScroll] = useState(true);

  const filteredLogs = logs.filter((log) => {
    if (filterLevel === "All") return true;
    const logValues: Record<string, number> = {
      Error: LogLevel.Error,
      Warning: LogLevel.Warning,
      Info: LogLevel.Info,
      Verbose: LogLevel.Verbose,
      None: LogLevel.None,
    };
    const filterValue = logValues[filterLevel] || LogLevel.Verbose;
    const currentLogValue = logValues[log.level] || LogLevel.Info;
    return currentLogValue <= filterValue;
  });

  useEffect(() => {
    if (shouldAutoScroll && scrollContainerRef.current) {
      scrollContainerRef.current.scrollTop =
        scrollContainerRef.current.scrollHeight;
    }
  }, [filteredLogs, shouldAutoScroll]);

  const handleScroll = () => {
    if (scrollContainerRef.current) {
      const { scrollTop, scrollHeight, clientHeight } =
        scrollContainerRef.current;
      // If user is within 50px of the bottom, enable auto-scroll
      const isNearBottom = scrollHeight - scrollTop - clientHeight < 50;
      setShouldAutoScroll(isNearBottom);
    }
  };

  return (
    <div className="logs-panel">
      <div className="logs-header">
        <NavDropdown
          icon={<Terminal size={16} weight="fill" />}
          label="Console"
          value={filterLevel}
          onValueChange={setFilterLevel}
          options={[
            { value: "All", label: "All Levels" },
            { value: "Verbose", label: "Verbose" },
            { value: "Info", label: "Info" },
            { value: "Warning", label: "Warning" },
            { value: "Error", label: "Error" },
          ]}
        />

        <HeaderIconButton
          className="ml-auto"
          icon={<Trash size={14} />}
          label="Clear"
          onClick={onClear}
        />
      </div>

      <div
        ref={scrollContainerRef}
        onScroll={handleScroll}
        className="logs-content"
      >
        {filteredLogs.length === 0 ? (
          <div className="log-empty">No logs to display</div>
        ) : (
          <div className="flex flex-col gap-1">
            {filteredLogs.map((log, i) => (
              <div key={i} className="log-item">
                <span className="log-timestamp">
                  [
                  {new Date(log.timestamp).toLocaleTimeString([], {
                    hour12: false,
                  })}
                  ]
                </span>
                <span
                  className={`log-context ${
                    log.level === "Error"
                      ? "text-red-400"
                      : log.level === "Warning"
                        ? "text-orange-400"
                        : "text-tropicalTeal"
                  }`}
                >
                  [{log.context}]
                </span>
                <span
                  className={`log-message ${
                    log.level === "Error"
                      ? "text-red-300"
                      : log.level === "Warning"
                        ? "text-orange-200"
                        : "text-gray-300"
                  }`}
                >
                  {log.message}
                </span>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
};
