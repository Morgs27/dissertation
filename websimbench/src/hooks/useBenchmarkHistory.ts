import { useLocalStorage } from './useLocalStorage';
import { BenchmarkResult, BenchmarkReport, DeviceInfo, BenchmarkConfiguration } from '../simulation/helpers/grapher';

export function useBenchmarkHistory() {
  const [reports, setReports] = useLocalStorage<BenchmarkReport[]>('websimbench_reports', []);

  const addReport = (results: BenchmarkResult[], deviceInfo?: DeviceInfo, configuration?: BenchmarkConfiguration) => {
    const newReport: BenchmarkReport = {
      id: crypto.randomUUID(),
      timestamp: Date.now(),
      results,
      deviceInfo,
      configuration
    };
    setReports(prev => [newReport, ...prev]);
  };

  const updateReportName = (id: string, name: string) => {
    setReports(prev => prev.map(r => r.id === id ? { ...r, name } : r));
  };

  const clearReports = () => {
    setReports([]);
  };

  return { reports, addReport, updateReportName, clearReports };
}
