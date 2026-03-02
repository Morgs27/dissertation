"""
Data loading and flattening utilities for WebSimBench benchmark reports.

Reads ``websimbench.benchmark.v1`` JSON files and produces tidy
Pandas DataFrames ready for analysis and plotting.
"""

from __future__ import annotations

import json
from pathlib import Path
from typing import Any

import numpy as np
import pandas as pd


# ── Loading raw JSON ──────────────────────────────────────────────────────

def load_benchmark_suite(json_path: str | Path) -> dict[str, Any]:
    """Load a single benchmark suite JSON and return the raw dict."""
    with open(json_path, "r") as fh:
        data = json.load(fh)
    assert data.get("schemaVersion") == "websimbench.benchmark.v1", (
        f"Unexpected schema: {data.get('schemaVersion')}"
    )
    return data


# ── Run-level DataFrame ───────────────────────────────────────────────────

def _extract_run_row(run: dict, suite_name: str) -> dict:
    """Flatten a single run entry into a dict suitable for a DataFrame row."""
    summary = run.get("summary", {})
    method_summaries = summary.get("methodSummaries", [{}])
    ms = method_summaries[0] if method_summaries else {}
    frame_stats = summary.get("frameTimeStats", {})

    return {
        "suite": suite_name,
        "status": run.get("status"),
        "method": run.get("method"),
        "renderMode": run.get("renderMode"),
        "agentCount": run.get("agentCount"),
        "workerCount": run.get("workerCount"),
        "wasmExecutionMode": run.get("wasmExecutionMode"),
        "executedFrames": run.get("executedFrames"),
        # Summary aggregates
        "durationMs": summary.get("durationMs"),
        "avgExecutionMs": summary.get("averageExecutionMs"),
        "totalExecutionMs": summary.get("totalExecutionMs"),
        "errorCount": summary.get("errorCount"),
        # Per-method averages (from methodSummaries[0])
        "avgSetupTime": ms.get("avgSetupTime"),
        "avgComputeTime": ms.get("avgComputeTime"),
        "avgRenderTime": ms.get("avgRenderTime"),
        "avgReadbackTime": ms.get("avgReadbackTime"),
        "avgTotalTime": ms.get("avgTotalTime"),
        "avgCompileTime": ms.get("avgCompileTime"),
        "compileEvents": ms.get("compileEvents"),
        # Frame time distribution
        "frameTime_min": frame_stats.get("min"),
        "frameTime_max": frame_stats.get("max"),
        "frameTime_avg": frame_stats.get("average"),
        "frameTime_stdDev": frame_stats.get("stdDev"),
        "frameTime_p50": frame_stats.get("p50"),
        "frameTime_p95": frame_stats.get("p95"),
        "frameTime_p99": frame_stats.get("p99"),
    }


def runs_to_dataframe(suite: dict[str, Any], suite_name: str = "") -> pd.DataFrame:
    """
    Flatten all ``runs[]`` in a benchmark suite into a tidy DataFrame.

    Each row = one benchmark run (unique method × renderMode × agentCount
    × optional workerCount / wasmExecutionMode combination).
    """
    if not suite_name:
        suite_name = suite.get("simulationName", "unknown")
    rows = [_extract_run_row(r, suite_name) for r in suite.get("runs", [])]
    df = pd.DataFrame(rows)
    # Ensure sensible dtypes
    for col in ("agentCount", "workerCount", "executedFrames", "errorCount", "compileEvents"):
        if col in df.columns:
            df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


# ── Frame-level DataFrame ────────────────────────────────────────────────

def frames_to_dataframe(suite: dict[str, Any], suite_name: str = "") -> pd.DataFrame:
    """
    Flatten per-frame performance data across all runs in a suite.

    Returns one row per frame with run-level metadata attached.
    Useful for time-series analysis and percentile distributions.
    """
    if not suite_name:
        suite_name = suite.get("simulationName", "unknown")

    rows: list[dict] = []
    for run in suite.get("runs", []):
        tr = run.get("trackingReport", {})
        base = {
            "suite": suite_name,
            "method": run.get("method"),
            "renderMode": run.get("renderMode"),
            "agentCount": run.get("agentCount"),
            "workerCount": run.get("workerCount"),
            "wasmExecutionMode": run.get("wasmExecutionMode"),
        }
        for frame in tr.get("frames", []):
            perf = frame.get("performance", {})
            row = {
                **base,
                "frameNumber": frame.get("frameNumber"),
                "totalExecutionTime": perf.get("totalExecutionTime"),
                "setupTime": perf.get("setupTime"),
                "computeTime": perf.get("computeTime"),
                "renderTime": perf.get("renderTime"),
                "readbackTime": perf.get("readbackTime"),
                "compileTime": perf.get("compileTime"),
            }
            # Bridge timings (WebGPU)
            bridge = perf.get("bridgeTimings", {})
            if bridge:
                row["hostToGpuTime"] = bridge.get("hostToGpuTime")
                row["gpuToHostTime"] = bridge.get("gpuToHostTime")
            # Memory
            mem = perf.get("memoryStats", {})
            if mem:
                row["methodMemoryFootprintBytes"] = mem.get("methodMemoryFootprintBytes")
            rows.append(row)
    return pd.DataFrame(rows)


# ── Multi-suite loader ────────────────────────────────────────────────────

def load_all_suites(raw_data_dir: str | Path) -> pd.DataFrame:
    """
    Walk *raw_data_dir*, load every ``*.json`` benchmark file, and
    return a concatenated run-level DataFrame with a ``suite`` column
    derived from the parent folder name.
    """
    raw = Path(raw_data_dir)
    dfs: list[pd.DataFrame] = []
    for json_path in sorted(raw.rglob("*.json")):
        suite_name = json_path.parent.name
        suite = load_benchmark_suite(json_path)
        dfs.append(runs_to_dataframe(suite, suite_name=suite_name))
    if not dfs:
        raise FileNotFoundError(f"No benchmark JSON files found under {raw}")
    return pd.concat(dfs, ignore_index=True)
