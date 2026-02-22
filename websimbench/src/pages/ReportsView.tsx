import React, { useEffect, useMemo, useState } from 'react';
import {
  Button,
  Input,
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
  Badge,
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
  AlertDialogTrigger,
} from '@/components/ui';
import {
  ChartBar,
  Calendar,
  Trash,
  PencilSimple,
  Check,
  X,
  DownloadSimple,
} from '@phosphor-icons/react';
import type { BenchmarkReport, BenchmarkRunRecord } from '@/types/benchmark';

interface ReportsViewProps {
  reports: BenchmarkReport[];
  isLoading?: boolean;
  loadError?: string | null;
  onClear: () => Promise<void> | void;
  onRename: (id: string, newName: string) => Promise<void> | void;
}

const generateFileName = (report: BenchmarkReport, suffix: string): string => {
  const base = report.name?.trim() || report.id;
  const safeBase = base.replace(/[^a-z0-9-_]+/gi, '_').toLowerCase();
  return `${safeBase}-${suffix}`;
};

const downloadTextFile = (fileName: string, content: string, mimeType: string) => {
  const blob = new Blob([content], { type: mimeType });
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement('a');
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
};

const getRunExecutionMetrics = (run: BenchmarkRunRecord) => {
  const totalExecutionMs = run.trackingReport.summary.totalExecutionMs;
  const frameCount = run.trackingReport.frames.length;
  const averageFrameMs = frameCount > 0 ? totalExecutionMs / frameCount : 0;

  return {
    totalExecutionMs,
    frameCount,
    averageFrameMs,
  };
};

const buildRunCsv = (report: BenchmarkReport, runs: BenchmarkRunRecord[]): string => {
  const headers = [
    'run_id',
    'status',
    'method',
    'render_mode',
    'agents',
    'workers',
    'canvas_width',
    'canvas_height',
    'frames_requested',
    'frames_recorded',
    'warmup_frames',
    'run_index',
    'duration_ms',
    'total_execution_ms',
    'average_frame_ms',
    'error',
    'report_id',
    'report_name',
    'report_timestamp',
  ];

  const rows = runs.map((run) => {
    const metrics = getRunExecutionMetrics(run);

    return [
      run.id,
      run.status,
      run.config.method,
      run.config.renderMode,
      run.config.agents,
      run.config.workers ?? '',
      run.config.canvas.width,
      run.config.canvas.height,
      run.config.framesPerRun,
      metrics.frameCount,
      run.config.warmupFrames,
      run.config.runIndex,
      Math.max(0, run.endedAt - run.startedAt).toFixed(3),
      metrics.totalExecutionMs.toFixed(3),
      metrics.averageFrameMs.toFixed(3),
      run.error ?? '',
      report.id,
      report.name ?? '',
      new Date(report.timestamp).toISOString(),
    ];
  });

  const escape = (value: string | number) => {
    const text = String(value);
    if (text.includes(',') || text.includes('"') || text.includes('\n')) {
      return `"${text.replace(/"/g, '""')}"`;
    }
    return text;
  };

  return [headers, ...rows].map((row) => row.map(escape).join(',')).join('\n');
};

export const ReportsView: React.FC<ReportsViewProps> = ({
  reports,
  isLoading,
  loadError,
  onClear,
  onRename,
}) => {
  const [selectedReportId, setSelectedReportId] = useState<string | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');

  const [methodFilter, setMethodFilter] = useState<string>('all');
  const [renderFilter, setRenderFilter] = useState<string>('all');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [minAgentsFilter, setMinAgentsFilter] = useState<string>('');
  const [maxAgentsFilter, setMaxAgentsFilter] = useState<string>('');

  useEffect(() => {
    if (!selectedReportId && reports.length > 0) {
      setSelectedReportId(reports[0].id);
    }

    if (selectedReportId && reports.length > 0 && !reports.some((report) => report.id === selectedReportId)) {
      setSelectedReportId(reports[0].id);
    }
  }, [reports, selectedReportId]);

  const selectedReport = useMemo(
    () => reports.find((report) => report.id === selectedReportId),
    [reports, selectedReportId]
  );

  const availableMethods = useMemo(() => {
    if (!selectedReport) return [];
    return Array.from(new Set(selectedReport.runs.map((run) => run.config.method))).sort();
  }, [selectedReport]);

  const availableRenderModes = useMemo(() => {
    if (!selectedReport) return [];
    return Array.from(new Set(selectedReport.runs.map((run) => run.config.renderMode))).sort();
  }, [selectedReport]);

  const filteredRuns = useMemo(() => {
    if (!selectedReport) return [];

    const minAgents = minAgentsFilter.trim() === '' ? undefined : Number.parseInt(minAgentsFilter, 10);
    const maxAgents = maxAgentsFilter.trim() === '' ? undefined : Number.parseInt(maxAgentsFilter, 10);

    return selectedReport.runs.filter((run) => {
      if (methodFilter !== 'all' && run.config.method !== methodFilter) return false;
      if (renderFilter !== 'all' && run.config.renderMode !== renderFilter) return false;
      if (statusFilter !== 'all' && run.status !== statusFilter) return false;
      if (Number.isFinite(minAgents) && run.config.agents < (minAgents as number)) return false;
      if (Number.isFinite(maxAgents) && run.config.agents > (maxAgents as number)) return false;
      return true;
    });
  }, [
    selectedReport,
    methodFilter,
    renderFilter,
    statusFilter,
    minAgentsFilter,
    maxAgentsFilter,
  ]);

  const filteredSummary = useMemo(() => {
    const completedRuns = filteredRuns.filter((run) => run.status === 'completed');
    const failedRuns = filteredRuns.filter((run) => run.status === 'failed');

    const frameCount = completedRuns.reduce((sum, run) => sum + run.trackingReport.frames.length, 0);
    const totalExecutionMs = completedRuns.reduce(
      (sum, run) => sum + run.trackingReport.summary.totalExecutionMs,
      0
    );

    return {
      totalRuns: filteredRuns.length,
      completedRuns: completedRuns.length,
      failedRuns: failedRuns.length,
      frameCount,
      totalExecutionMs,
      averageFrameMs: frameCount > 0 ? totalExecutionMs / frameCount : 0,
    };
  }, [filteredRuns]);

  const handleStartEdit = (id: string, name: string) => {
    setEditingId(id);
    setEditName(name);
  };

  const handleSaveEdit = async (event: React.MouseEvent) => {
    event.stopPropagation();

    if (!editingId) {
      return;
    }

    await onRename(editingId, editName.trim());
    setEditingId(null);
  };

  const handleCancelEdit = (event: React.MouseEvent) => {
    event.stopPropagation();
    setEditingId(null);
  };

  const exportFullJson = () => {
    if (!selectedReport) return;

    downloadTextFile(
      `${generateFileName(selectedReport, 'full-report')}.json`,
      JSON.stringify(selectedReport, null, 2),
      'application/json'
    );
  };

  const exportFilteredJson = () => {
    if (!selectedReport) return;

    const exportPayload = {
      reportId: selectedReport.id,
      reportName: selectedReport.name,
      reportTimestamp: selectedReport.timestamp,
      filter: {
        method: methodFilter,
        renderMode: renderFilter,
        status: statusFilter,
        minAgents: minAgentsFilter,
        maxAgents: maxAgentsFilter,
      },
      summary: filteredSummary,
      runs: filteredRuns,
    };

    downloadTextFile(
      `${generateFileName(selectedReport, 'filtered-runs')}.json`,
      JSON.stringify(exportPayload, null, 2),
      'application/json'
    );
  };

  const exportFilteredCsv = () => {
    if (!selectedReport) return;

    downloadTextFile(
      `${generateFileName(selectedReport, 'filtered-runs')}.csv`,
      buildRunCsv(selectedReport, filteredRuns),
      'text/csv'
    );
  };

  return (
    <div className="reports-layout">
      <div className="reports-sidebar">
        <div className="page-header">
          <div className="page-title">
            <ChartBar className="text-tropicalTeal" size={20} weight="bold" />
            <h2 className="page-title-text">Reports</h2>
          </div>

          <AlertDialog>
            <AlertDialogTrigger asChild>
              <Button
                variant="ghost"
                className="text-gray-500 hover:text-red-400 hover:bg-red-500/10 h-8 w-8 p-0"
                disabled={reports.length === 0}
                title="Clear All Reports"
              >
                <Trash size={16} />
              </Button>
            </AlertDialogTrigger>
            <AlertDialogContent className="bg-[#0c1317] border-white/[0.08] text-white">
              <AlertDialogHeader>
                <AlertDialogTitle>Delete all reports?</AlertDialogTitle>
                <AlertDialogDescription className="text-gray-400">
                  This action cannot be undone. All stored benchmark reports will be removed from IndexedDB.
                </AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel className="bg-transparent border-white/[0.08] text-white hover:bg-white/[0.04] hover:text-white">
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  onClick={() => {
                    void onClear();
                  }}
                  className="bg-red-500 hover:bg-red-600 border-red-500 text-white"
                >
                  Delete All
                </AlertDialogAction>
              </AlertDialogFooter>
            </AlertDialogContent>
          </AlertDialog>
        </div>

        <div className="flex-1 overflow-y-auto py-2">
          {isLoading && (
            <div className="p-8 text-center opacity-60 text-xs text-gray-300">Loading reports...</div>
          )}

          {!isLoading && loadError && (
            <div className="p-4 text-xs text-red-400">Failed to load reports: {loadError}</div>
          )}

          {!isLoading && !loadError && reports.length === 0 && (
            <div className="p-8 text-center space-y-2 opacity-40">
              <ChartBar className="mx-auto" size={32} weight="thin" />
              <p className="text-xs font-medium">No reports yet.</p>
            </div>
          )}

          <div className="px-3 space-y-1">
            {reports.map((report) => (
              <div
                key={report.id}
                className="report-list-item group"
                data-selected={selectedReportId === report.id}
                onClick={() => setSelectedReportId(report.id)}
              >
                {editingId === report.id ? (
                  <div className="flex gap-2" onClick={(event) => event.stopPropagation()}>
                    <Input
                      className="h-8 text-xs bg-black/40 border-tropicalTeal/50 focus:ring-1 focus:ring-tropicalTeal/30"
                      value={editName}
                      onChange={(event) => setEditName(event.target.value)}
                      autoFocus
                    />
                    <div className="flex gap-1">
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-green-500 hover:bg-green-500/10" onClick={(event) => void handleSaveEdit(event)}>
                        <Check size={14} weight="bold" />
                      </Button>
                      <Button size="icon" variant="ghost" className="h-8 w-8 text-red-500 hover:bg-red-500/10" onClick={handleCancelEdit}>
                        <X size={14} weight="bold" />
                      </Button>
                    </div>
                  </div>
                ) : (
                  <div className="flex justify-between items-center">
                    <div className="flex items-center gap-3 overflow-hidden">
                      <div className="report-list-icon">
                        <Calendar size={16} weight={selectedReportId === report.id ? 'fill' : 'regular'} />
                      </div>
                      <div className="overflow-hidden">
                        <p className={`text-sm font-bold truncate ${selectedReportId === report.id ? 'text-white' : ''}`}>
                          {report.name || `Report ${report.id.slice(0, 6)}`}
                        </p>
                        <p className="text-[10px] font-mono opacity-60">
                          {new Date(report.timestamp).toLocaleString()} • {report.runs.length} runs
                        </p>
                      </div>
                    </div>
                    <Button
                      size="icon"
                      variant="ghost"
                      className={`h-7 w-7 opacity-0 group-hover:opacity-100 transition-opacity hover:bg-white/10 ${selectedReportId === report.id ? 'text-white' : 'text-gray-500'
                        }`}
                      onClick={(event) => {
                        event.stopPropagation();
                        handleStartEdit(report.id, report.name || '');
                      }}
                    >
                      <PencilSimple size={14} />
                    </Button>
                  </div>
                )}
              </div>
            ))}
          </div>
        </div>
      </div>

      <div className="flex-1 overflow-y-auto bg-[#0a1a1f]">
        {!selectedReport && (
          <div className="flex-1 mt-10 flex flex-col items-center justify-center">
            <ChartBar size={48} className="text-gray-600 mb-4" />
            <span className="text-gray-500">Select a report from the list to view details.</span>
          </div>
        )}

        {selectedReport && (
          <div className="p-8 max-w-7xl mx-auto space-y-6">
            <div className="p-4 border-b border-white/[0.06]">
              <div className="flex flex-wrap justify-between items-center gap-3 mb-2">
                <h2 className="text-lg font-bold text-tropicalTeal">
                  {selectedReport.name || 'Benchmark Report'}
                </h2>
                <div className="flex flex-wrap gap-2">
                  <Button variant="outline" size="sm" className="h-8" onClick={exportFullJson}>
                    <DownloadSimple className="mr-2" size={14} /> Full JSON
                  </Button>
                  <Button variant="outline" size="sm" className="h-8" onClick={exportFilteredJson}>
                    <DownloadSimple className="mr-2" size={14} /> Filtered JSON
                  </Button>
                  <Button variant="outline" size="sm" className="h-8" onClick={exportFilteredCsv}>
                    <DownloadSimple className="mr-2" size={14} /> Filtered CSV
                  </Button>
                </div>
              </div>
              <p className="text-xs text-gray-400">
                Generated on {new Date(selectedReport.timestamp).toLocaleString()}
              </p>
            </div>

            <div className="report-summary-block">
              <h3 className="report-summary-title">Summary</h3>
              <div className="report-metric-grid">
                <div>
                  <p className="report-metric-label">Runs</p>
                  <p className="report-metric-value">{filteredSummary.totalRuns}</p>
                </div>
                <div>
                  <p className="report-metric-label">Completed</p>
                  <p className="report-metric-value text-emerald-400">{filteredSummary.completedRuns}</p>
                </div>
                <div>
                  <p className="report-metric-label">Failed</p>
                  <p className="report-metric-value text-red-400">{filteredSummary.failedRuns}</p>
                </div>
                <div>
                  <p className="report-metric-label">Frames</p>
                  <p className="report-metric-value">{filteredSummary.frameCount.toLocaleString()}</p>
                </div>
                <div>
                  <p className="report-metric-label">Total Exec (ms)</p>
                  <p className="report-metric-value">{filteredSummary.totalExecutionMs.toFixed(2)}</p>
                </div>
                <div>
                  <p className="report-metric-label">Avg Frame (ms)</p>
                  <p className="report-metric-value">{filteredSummary.averageFrameMs.toFixed(4)}</p>
                </div>
              </div>
            </div>

            <div className="report-summary-block space-y-3">
              <h3 className="report-summary-title">Filters</h3>
              <div className="report-filter-grid">
                <Select value={methodFilter} onValueChange={setMethodFilter}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Method" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Methods</SelectItem>
                    {availableMethods.map((method) => (
                      <SelectItem key={method} value={method}>
                        {method}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={renderFilter} onValueChange={setRenderFilter}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Render" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Render Modes</SelectItem>
                    {availableRenderModes.map((renderMode) => (
                      <SelectItem key={renderMode} value={renderMode}>
                        {renderMode.toUpperCase()}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>

                <Select value={statusFilter} onValueChange={setStatusFilter}>
                  <SelectTrigger className="h-8">
                    <SelectValue placeholder="Status" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="all">All Status</SelectItem>
                    <SelectItem value="completed">Completed</SelectItem>
                    <SelectItem value="failed">Failed</SelectItem>
                  </SelectContent>
                </Select>

                <Input
                  type="number"
                  value={minAgentsFilter}
                  onChange={(event) => setMinAgentsFilter(event.target.value)}
                  className="h-8"
                  placeholder="Min agents"
                />

                <Input
                  type="number"
                  value={maxAgentsFilter}
                  onChange={(event) => setMaxAgentsFilter(event.target.value)}
                  className="h-8"
                  placeholder="Max agents"
                />
              </div>
            </div>

            <div className="report-table-container">
              <Table className="text-xs">
                <TableHeader>
                  <TableRow className="bg-white/[0.02] hover:bg-white/[0.02] border-white/[0.06]">
                    <TableHead className="text-gray-300">Status</TableHead>
                    <TableHead className="text-gray-300">Method</TableHead>
                    <TableHead className="text-gray-300">Render</TableHead>
                    <TableHead className="text-gray-300 text-right">Agents</TableHead>
                    <TableHead className="text-gray-300 text-right">Workers</TableHead>
                    <TableHead className="text-gray-300 text-right">Canvas</TableHead>
                    <TableHead className="text-gray-300 text-right">Frames</TableHead>
                    <TableHead className="text-gray-300 text-right">Duration (ms)</TableHead>
                    <TableHead className="text-gray-300 text-right">Exec (ms)</TableHead>
                    <TableHead className="text-gray-300 text-right">Avg Frame (ms)</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filteredRuns.map((run) => {
                    const metrics = getRunExecutionMetrics(run);

                    return (
                      <TableRow key={run.id} className="hover:bg-teal-500/5 border-white/[0.04]">
                        <TableCell>
                          <Badge className={run.status === 'completed' ? 'bg-emerald-600/80' : 'bg-red-600/80'}>
                            {run.status}
                          </Badge>
                        </TableCell>
                        <TableCell>{run.config.method}</TableCell>
                        <TableCell className="uppercase">{run.config.renderMode}</TableCell>
                        <TableCell className="text-right">{run.config.agents.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{run.config.workers ?? '-'}</TableCell>
                        <TableCell className="text-right">
                          {run.config.canvas.width}x{run.config.canvas.height}
                        </TableCell>
                        <TableCell className="text-right">{metrics.frameCount.toLocaleString()}</TableCell>
                        <TableCell className="text-right">{Math.max(0, run.endedAt - run.startedAt).toFixed(2)}</TableCell>
                        <TableCell className="text-right">{metrics.totalExecutionMs.toFixed(2)}</TableCell>
                        <TableCell className="text-right">{metrics.averageFrameMs.toFixed(4)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {filteredRuns.length === 0 && (
              <div className="text-xs text-gray-400">No runs match current filters.</div>
            )}
          </div>
        )}
      </div>
    </div>
  );
};
