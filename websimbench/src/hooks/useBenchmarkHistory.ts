import { useCallback, useEffect, useState } from 'react';
import {
  clearBenchmarkReports,
  listBenchmarkReports,
  renameBenchmarkReport,
  saveBenchmarkReport,
} from '@/lib/benchmarkDb';
import type { BenchmarkReport } from '@/types/benchmark';

export function useBenchmarkHistory() {
  const [reports, setReports] = useState<BenchmarkReport[]>([]);
  const [isLoading, setIsLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  const refreshReports = useCallback(async () => {
    setIsLoading(true);
    setError(null);

    try {
      const nextReports = await listBenchmarkReports();
      setReports(nextReports);
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      setError(message);
    } finally {
      setIsLoading(false);
    }
  }, []);

  useEffect(() => {
    void refreshReports();
  }, [refreshReports]);

  const addReport = useCallback(async (report: BenchmarkReport) => {
    await saveBenchmarkReport(report);
    setReports((previous) => {
      const remaining = previous.filter((entry) => entry.id !== report.id);
      return [report, ...remaining].sort((a, b) => b.timestamp - a.timestamp);
    });
  }, []);

  const updateReportName = useCallback(async (id: string, name: string) => {
    await renameBenchmarkReport(id, name);
    setReports((previous) =>
      previous.map((report) => (report.id === id ? { ...report, name } : report))
    );
  }, []);

  const clearReports = useCallback(async () => {
    await clearBenchmarkReports();
    setReports([]);
  }, []);

  return {
    reports,
    isLoading,
    error,
    addReport,
    updateReportName,
    clearReports,
    refreshReports,
  };
}
