import { Speedometer } from "@phosphor-icons/react";
import "./PerformanceWidget.css";

export const PerformanceWidget = ({ fps }: { fps: number }) => {
  return (
    <div className="perf-widget">
      <div className="perf-icon-container">
        <div className="perf-icon-box">
          <Speedometer size={14} weight="fill" />
        </div>
        <span className="perf-title">Performance</span>
      </div>
      <div className="perf-divider" />
      <div className="perf-value-container">
        <span className="perf-value">{fps}</span>
        <span className="perf-unit">FPS</span>
      </div>
    </div>
  );
};
