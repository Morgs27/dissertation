"""
Data loading utilities for WebSimBench benchmark reports.

Reads ``websimbench.benchmark.v1`` JSON files and produces tidy
Pandas DataFrames ready for analysis and plotting.

Two loading strategies:
* **Streaming** (``load_runs_df``, ``load_frames_df``) — uses *ijson* to
  iterate over the file without holding the entire JSON tree in memory.
  Essential for the 4 GB+ files produced by large-agent-sweep benchmarks.
* **Full load** (``load_raw``) — reads the entire file with ``json.load()``.
  Only appropriate for files < ~500 MB.
"""

from __future__ import annotations

import json
import os
import warnings
from pathlib import Path
from typing import Any

import ijson
import numpy as np
import pandas as pd


# ── Helpers ───────────────────────────────────────────────────────────────

_SIZE_WARNING_BYTES = 500 * 1024 * 1024  # 500 MB

import re as _re


def _human_size(n: int) -> str:
    for unit in ("B", "KB", "MB", "GB"):
        if abs(n) < 1024:
            return f"{n:.1f} {unit}"
        n /= 1024  # type: ignore[assignment]
    return f"{n:.1f} TB"


def _snake_case(s: str) -> str:
    """Convert a human-readable key like ``'JS Execution'`` to ``'js_execution'``."""
    s = s.replace("(", "").replace(")", "").replace("->", "_to_")
    s = _re.sub(r"[^a-zA-Z0-9]+", "_", s)
    return s.strip("_").lower()


# ── Discovery ─────────────────────────────────────────────────────────────

def discover_files(raw_data_dir: str | Path) -> pd.DataFrame:
    """
    Walk *raw_data_dir* and return a DataFrame listing every ``*.json``
    benchmark file with metadata (path, size, category, simulation name).

    Useful for picking which files to load before committing to a
    potentially slow streaming parse.

    Returns
    -------
    pd.DataFrame
        Columns: ``path``, ``size_bytes``, ``size_human``, ``category``,
        ``simulation``, ``filename``.
    """
    raw = Path(raw_data_dir)
    rows: list[dict[str, Any]] = []
    for json_path in sorted(raw.rglob("*.json")):
        rel = json_path.relative_to(raw)
        parts = rel.parts  # e.g. ('basic-sweeps', 'boids', 'file.json')
        size = json_path.stat().st_size
        rows.append({
            "path": str(json_path),
            "size_bytes": size,
            "size_human": _human_size(size),
            "category": parts[0] if len(parts) > 1 else "",
            "simulation": parts[1] if len(parts) > 2 else parts[0] if len(parts) > 1 else "",
            "filename": json_path.name,
        })
    return pd.DataFrame(rows)


# ── Full load (small files only) ──────────────────────────────────────────

def load_raw(json_path: str | Path) -> dict[str, Any]:
    """
    Load a single benchmark suite JSON and return the raw dict.

    .. warning::
       This reads the **entire** file into memory.  For files larger than
       ~500 MB, use ``load_runs_df`` or ``load_frames_df`` instead.
    """
    path = Path(json_path)
    size = path.stat().st_size
    if size > _SIZE_WARNING_BYTES:
        warnings.warn(
            f"{path.name} is {_human_size(size)} — consider using "
            f"load_runs_df() or load_frames_df() to avoid high memory usage.",
            ResourceWarning,
            stacklevel=2,
        )
    with open(path, "r") as fh:
        data = json.load(fh)
    assert data.get("schemaVersion") == "websimbench.benchmark.v1", (
        f"Unexpected schema: {data.get('schemaVersion')}"
    )
    return data


# ── Streaming run-level loader ────────────────────────────────────────────

def _extract_run_row(run: dict, suite_name: str) -> dict:
    """Flatten a single run entry into a dict suitable for a DataFrame row."""
    summary = run.get("summary", {})
    method_summaries = summary.get("methodSummaries", [{}])
    ms = method_summaries[0] if method_summaries else {}
    frame_stats = summary.get("frameTimeStats", {})

    # Method-render summaries for bridge timings & memory
    mrs_list = summary.get("methodRenderSummaries", [{}])
    mrs = mrs_list[0] if mrs_list else {}

    # Runtime sampling aggregates (jsHeap, battery, thermalCanary)
    rs = summary.get("runtimeSampling", {})
    rs_heap = rs.get("jsHeap", {})
    rs_batt = rs.get("battery", {})
    rs_therm = rs.get("thermalCanary", {})

    # Input & agent stats
    inp = summary.get("inputStats", {})
    ags = summary.get("agentStats", {})

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
        "frameCount": summary.get("frameCount"),
        "durationMs": summary.get("durationMs"),
        "avgExecutionMs": summary.get("averageExecutionMs"),
        "totalExecutionMs": summary.get("totalExecutionMs"),
        "errorCount": summary.get("errorCount"),
        # Per-method averages
        "avgSetupTime": ms.get("avgSetupTime"),
        "avgComputeTime": ms.get("avgComputeTime"),
        "avgRenderTime": ms.get("avgRenderTime"),
        "avgReadbackTime": ms.get("avgReadbackTime"),
        "avgTotalTime": ms.get("avgTotalTime"),
        "avgCompileTime": ms.get("avgCompileTime"),
        "compileEvents": ms.get("compileEvents"),
        # Bridge timings (WebGPU)
        "avgHostToGpuTime": mrs.get("avgHostToGpuBridgeTime"),
        "avgGpuToHostTime": mrs.get("avgGpuToHostBridgeTime"),
        "avgMemoryBytes": mrs.get("avgMethodMemoryFootprintBytes"),
        # Frame time distribution
        "frameTime_min": frame_stats.get("min"),
        "frameTime_max": frame_stats.get("max"),
        "frameTime_avg": frame_stats.get("average"),
        "frameTime_stdDev": frame_stats.get("stdDev"),
        "frameTime_p50": frame_stats.get("p50"),
        "frameTime_p95": frame_stats.get("p95"),
        "frameTime_p99": frame_stats.get("p99"),
        # ── Runtime sampling: JS heap ─────────────────────────────────
        "rsJsHeap_sampleCount": rs_heap.get("sampleCount"),
        "rsJsHeap_startBytes": rs_heap.get("startBytes"),
        "rsJsHeap_endBytes": rs_heap.get("endBytes"),
        "rsJsHeap_deltaBytes": rs_heap.get("deltaBytes"),
        "rsJsHeap_minBytes": rs_heap.get("minBytes"),
        "rsJsHeap_maxBytes": rs_heap.get("maxBytes"),
        "rsJsHeap_avgBytes": rs_heap.get("averageBytes"),
        # ── Runtime sampling: battery ─────────────────────────────────
        "rsBattery_supported": rs_batt.get("supported"),
        "rsBattery_sampleCount": rs_batt.get("sampleCount"),
        "rsBattery_startLevel": rs_batt.get("startLevel"),
        "rsBattery_endLevel": rs_batt.get("endLevel"),
        "rsBattery_deltaLevel": rs_batt.get("deltaLevel"),
        "rsBattery_startCharging": rs_batt.get("startCharging"),
        "rsBattery_endCharging": rs_batt.get("endCharging"),
        # ── Runtime sampling: thermal canary ──────────────────────────
        "rsThermal_sampleCount": rs_therm.get("sampleCount"),
        "rsThermal_sampleIntervalMs": rs_therm.get("sampleIntervalMs"),
        "rsThermal_avgDriftMs": rs_therm.get("avgDriftMs"),
        "rsThermal_p95DriftMs": rs_therm.get("p95DriftMs"),
        "rsThermal_maxDriftMs": rs_therm.get("maxDriftMs"),
        "rsThermal_throttlingEvents": rs_therm.get("throttlingEvents"),
        "rsThermal_throttlingThresholdMs": rs_therm.get(
            "throttlingEventThresholdMs"
        ),
        # ── Input stats ───────────────────────────────────────────────
        "inputStats_requiredCount": inp.get("requiredInputCount"),
        "inputStats_definedCount": inp.get("definedInputCount"),
        "inputStats_avgKeysPerFrame": inp.get("averageKeysPerFrame"),
        # ── Agent stats ───────────────────────────────────────────────
        "agentStats_minPerFrame": ags.get("minAgentsPerFrame"),
        "agentStats_maxPerFrame": ags.get("maxAgentsPerFrame"),
        "agentStats_avgPerFrame": ags.get("averageAgentsPerFrame"),
    }


def _coerce_numeric(df: pd.DataFrame) -> pd.DataFrame:
    """Convert expected-numeric columns to numeric dtype.

    ijson returns ``Decimal`` objects for numbers; pandas/matplotlib
    can't work with those, so we cast everything numeric to float/int.
    """
    # Attempt to convert every column — to_numeric will gracefully skip strings
    for col in df.columns:
        if col in (
            "suite", "status", "method", "renderMode",
            "wasmExecutionMode", "methodMemoryFootprintType",
        ):
            continue  # skip known string columns
        df[col] = pd.to_numeric(df[col], errors="coerce")
    return df


def load_runs_df(
    json_path: str | Path,
    suite_name: str = "",
) -> pd.DataFrame:
    """
    Stream a benchmark JSON and extract **run-level summary** rows.

    This is the recommended way to load data — it never materialises
    the ``frames[]`` arrays, so memory stays low even for 4 GB+ files.

    Parameters
    ----------
    json_path : path-like
        Path to a ``websimbench.benchmark.v1`` JSON file.
    suite_name : str, optional
        Label for the ``suite`` column.  Defaults to ``simulationName``
        from the JSON or the parent directory name.

    Returns
    -------
    pd.DataFrame
        One row per run with summary statistics.
    """
    path = Path(json_path)
    size = path.stat().st_size

    # For small files, just use json.load — it's faster
    if size < _SIZE_WARNING_BYTES:
        with open(path, "rb") as fh:
            data = json.load(fh)
        name = suite_name or data.get("simulationName", path.parent.name)
        rows = [_extract_run_row(r, name) for r in data.get("runs", [])]
        return _coerce_numeric(pd.DataFrame(rows))

    # Stream large files with ijson
    name = suite_name
    rows: list[dict] = []

    with open(path, "rb") as fh:
        # Try to grab simulationName from the top of the file
        if not name:
            parser = ijson.parse(fh)
            for prefix, event, value in parser:
                if prefix == "simulationName":
                    name = value
                    break
                # Stop once we reach runs to avoid scanning too far
                if prefix == "runs":
                    break
            if not name:
                name = path.parent.name
            fh.seek(0)

        # Stream each run object
        try:
            for run in ijson.items(fh, "runs.item"):
                # Only keep summary-level keys, discard the heavy trackingReport
                light_run = {
                    k: v for k, v in run.items()
                    if k != "trackingReport"
                }
                # But we need the summary from the trackingReport if not at top level
                tr = run.get("trackingReport", {})
                if "summary" not in light_run and "summary" in tr:
                    light_run["summary"] = tr["summary"]
                rows.append(_extract_run_row(light_run, name))
        except ijson.IncompleteJSONError:
            print(f"  ⚠ Warning: {path.name} truncated (premature EOF). Recovered {len(rows)} runs.")

    return _coerce_numeric(pd.DataFrame(rows))


# ── Streaming frame-level loader ─────────────────────────────────────────

def load_frames_df(
    json_path: str | Path,
    *,
    methods: list[str] | None = None,
    agent_counts: list[int] | None = None,
    max_frames: int | None = None,
    suite_name: str = "",
) -> pd.DataFrame:
    """
    Stream a benchmark JSON and extract **frame-level performance** rows.

    Optionally filter by method and/or agent count to avoid loading
    unnecessary data.

    Parameters
    ----------
    json_path : path-like
        Path to a ``websimbench.benchmark.v1`` JSON file.
    methods : list[str], optional
        Only include runs with these compute methods.
    agent_counts : list[int], optional
        Only include runs with these agent counts.
    max_frames : int, optional
        Cap the number of frames extracted per run.
    suite_name : str, optional
        Label for the ``suite`` column.

    Returns
    -------
    pd.DataFrame
        One row per frame with performance timings.
    """
    path = Path(json_path)
    name = suite_name or path.parent.name

    rows: list[dict] = []

    with open(path, "rb") as fh:
        # Grab simulation name
        if not suite_name:
            parser = ijson.parse(fh)
            for prefix, event, value in parser:
                if prefix == "simulationName":
                    name = value
                    break
                if prefix == "runs":
                    break
            fh.seek(0)

        try:
            for run in ijson.items(fh, "runs.item"):
                run_method = run.get("method")
                run_agents = run.get("agentCount")

                # Apply filters
                if methods and run_method not in methods:
                    continue
                if agent_counts and run_agents not in agent_counts:
                    continue

                base = {
                    "suite": name,
                    "method": run_method,
                    "renderMode": run.get("renderMode"),
                    "agentCount": run_agents,
                    "workerCount": run.get("workerCount"),
                    "wasmExecutionMode": run.get("wasmExecutionMode"),
                }

                tr = run.get("trackingReport", {})
                frames = tr.get("frames", [])
                if max_frames is not None:
                    frames = frames[:max_frames]

                for frame in frames:
                    perf = frame.get("performance", {})
                    row = {
                        **base,
                        "frameNumber": frame.get("frameNumber"),
                        "timestamp": frame.get("timestamp"),
                        "inputKeyCount": frame.get("inputKeyCount"),
                        "totalExecutionTime": perf.get("totalExecutionTime"),
                        "setupTime": perf.get("setupTime"),
                        "computeTime": perf.get("computeTime"),
                        "renderTime": perf.get("renderTime"),
                        "readbackTime": perf.get("readbackTime"),
                        "compileTime": perf.get("compileTime"),
                    }
                    # ── specificStats (method-dependent keys) ─────────────
                    for raw_key, val in perf.get("specificStats", {}).items():
                        col = "ss_" + _snake_case(raw_key)
                        row[col] = val
                    # ── bridgeTimings — all 12 sub-keys ───────────────────
                    bridge = perf.get("bridgeTimings", {})
                    if bridge:
                        row["hostToGpuTime"] = bridge.get("hostToGpuTime")
                        row["hostToGpuAgentUploadTime"] = bridge.get(
                            "hostToGpuAgentUploadTime"
                        )
                        row["hostToGpuInputUploadTime"] = bridge.get(
                            "hostToGpuInputUploadTime"
                        )
                        row["hostToGpuUniformUploadTime"] = bridge.get(
                            "hostToGpuUniformUploadTime"
                        )
                        row["hostToGpuTrailUploadTime"] = bridge.get(
                            "hostToGpuTrailUploadTime"
                        )
                        row["hostToGpuRandomUploadTime"] = bridge.get(
                            "hostToGpuRandomUploadTime"
                        )
                        row["hostToGpuObstacleUploadTime"] = bridge.get(
                            "hostToGpuObstacleUploadTime"
                        )
                        row["gpuToHostTime"] = bridge.get("gpuToHostTime")
                        row["gpuToHostAgentReadbackTime"] = bridge.get(
                            "gpuToHostAgentReadbackTime"
                        )
                        row["gpuToHostTrailReadbackTime"] = bridge.get(
                            "gpuToHostTrailReadbackTime"
                        )
                        row["gpuToHostLogReadbackTime"] = bridge.get(
                            "gpuToHostLogReadbackTime"
                        )
                        row["queueSubmitTime"] = bridge.get("queueSubmitTime")
                    # ── memoryStats — full ────────────────────────────────
                    mem = perf.get("memoryStats", {})
                    if mem:
                        row["methodMemoryFootprintBytes"] = mem.get(
                            "methodMemoryFootprintBytes"
                        )
                        row["methodMemoryFootprintType"] = mem.get(
                            "methodMemoryFootprintType"
                        )
                        row["jsHeapSizeLimitBytes"] = mem.get(
                            "jsHeapSizeLimitBytes"
                        )
                        row["totalJsHeapSizeBytes"] = mem.get(
                            "totalJsHeapSizeBytes"
                        )
                        row["usedJsHeapSizeBytes"] = mem.get(
                            "usedJsHeapSizeBytes"
                        )
                    rows.append(row)
        except ijson.IncompleteJSONError:
            print(f"  ⚠ Warning: {path.name} truncated. Recovered {len(rows)} frame rows.")

    return _coerce_numeric(pd.DataFrame(rows))


# ── Streaming runtime-samples loader ─────────────────────────────────────

def load_runtime_samples_df(
    json_path: str | Path,
    *,
    methods: list[str] | None = None,
    agent_counts: list[int] | None = None,
    suite_name: str = "",
) -> pd.DataFrame:
    """
    Stream a benchmark JSON and extract **runtime sample** rows.

    Each row represents one periodic sample of JS heap, battery, and
    thermal-canary telemetry.  Useful for time-series analysis of
    memory pressure, energy drain, and thermal throttling during
    long-running benchmarks.

    Parameters
    ----------
    json_path : path-like
        Path to a ``websimbench.benchmark.v1`` JSON file.
    methods : list[str], optional
        Only include runs with these compute methods.
    agent_counts : list[int], optional
        Only include runs with these agent counts.
    suite_name : str, optional
        Label for the ``suite`` column.

    Returns
    -------
    pd.DataFrame
        One row per runtime sample with JS heap, battery, and thermal
        canary columns.
    """
    path = Path(json_path)
    name = suite_name or path.parent.name

    rows: list[dict] = []

    with open(path, "rb") as fh:
        if not suite_name:
            parser = ijson.parse(fh)
            for prefix, event, value in parser:
                if prefix == "simulationName":
                    name = value
                    break
                if prefix == "runs":
                    break
            fh.seek(0)

        try:
            for run in ijson.items(fh, "runs.item"):
                run_method = run.get("method")
                run_agents = run.get("agentCount")

                if methods and run_method not in methods:
                    continue
                if agent_counts and run_agents not in agent_counts:
                    continue

                base = {
                    "suite": name,
                    "method": run_method,
                    "renderMode": run.get("renderMode"),
                    "agentCount": run_agents,
                    "workerCount": run.get("workerCount"),
                    "wasmExecutionMode": run.get("wasmExecutionMode"),
                }

                tr = run.get("trackingReport", {})
                for sample in tr.get("runtimeSamples", []):
                    heap = sample.get("jsHeap", {})
                    batt = sample.get("battery", {})
                    canary = sample.get("thermalCanary", {})
                    rows.append({
                        **base,
                        "timestamp": sample.get("timestamp"),
                        "elapsedMs": sample.get("elapsedMs"),
                        "frameNumber": sample.get("frameNumber"),
                        # JS heap
                        "jsHeap_limit": heap.get("jsHeapSizeLimit"),
                        "jsHeap_total": heap.get("totalJSHeapSize"),
                        "jsHeap_used": heap.get("usedJSHeapSize"),
                        # Battery
                        "battery_supported": batt.get("supported"),
                        "battery_level": batt.get("level"),
                        "battery_charging": batt.get("charging"),
                        "battery_chargingTime": batt.get("chargingTime"),
                        "battery_dischargingTime": batt.get("dischargingTime"),
                        # Thermal canary
                        "thermal_intervalMs": canary.get("intervalMs"),
                        "thermal_driftMs": canary.get("driftMs"),
                    })
        except ijson.IncompleteJSONError:
            print(f"  ⚠ Warning: {path.name} truncated. Recovered {len(rows)} runtime samples.")

    return _coerce_numeric(pd.DataFrame(rows))


# ── Multi-file loader ─────────────────────────────────────────────────────

def load_all_runs(raw_data_dir: str | Path) -> pd.DataFrame:
    """
    Walk *raw_data_dir*, stream every ``*.json`` benchmark file, and
    return a concatenated run-level DataFrame with ``suite`` and
    ``category`` columns.

    Uses ``load_runs_df`` internally so large files are streamed.
    """
    raw = Path(raw_data_dir)
    dfs: list[pd.DataFrame] = []
    json_files = sorted(raw.rglob("*.json"))

    if not json_files:
        raise FileNotFoundError(f"No benchmark JSON files found under {raw}")

    for i, json_path in enumerate(json_files, 1):
        rel = json_path.relative_to(raw)
        category = rel.parts[0] if len(rel.parts) > 1 else ""
        suite_name = json_path.parent.name
        print(
            f"  [{i}/{len(json_files)}] Loading {rel} "
            f"({_human_size(json_path.stat().st_size)})..."
        )
        df = load_runs_df(json_path, suite_name=suite_name)
        df["category"] = category
        dfs.append(df)

    return pd.concat(dfs, ignore_index=True)


# ── Agent-level DataFrame ────────────────────────────────────────────────


def stream_agent_positions_df(
    json_path: str | Path,
    *,
    methods: tuple[str, ...] | list[str] = ("JavaScript", "WebGPU"),
    agent_counts: tuple[int, ...] | list[int] = (100,),
    render_mode: str = "cpu",
    suite_name: str = "",
) -> pd.DataFrame:
    """
    Stream a (potentially multi-GB) benchmark JSON and extract **agent
    position** data for matching runs.

    Unlike ``agent_states_to_dataframe`` (which requires the full JSON in
    memory), this function uses ``ijson`` to iterate over runs one at a
    time, keeping memory usage constant regardless of file size.

    Returns one row per agent per frame with columns ``suite``, ``method``,
    ``agentCount``, ``frameNumber``, ``id``, ``x``, ``y``, ``vx``, ``vy``.
    """
    path = Path(json_path)
    name = suite_name or path.parent.name

    rows: list[dict] = []

    with open(path, "rb") as fh:
        if not suite_name:
            parser = ijson.parse(fh)
            for prefix, event, value in parser:
                if prefix == "simulationName":
                    name = value
                    break
                if prefix == "runs":
                    break
            if not name:
                name = path.parent.name
            fh.seek(0)

        try:
            for run in ijson.items(fh, "runs.item"):
                run_method = run.get("method")
                run_agents = run.get("agentCount")
                run_render = run.get("renderMode")

                if run_method not in methods:
                    continue
                if run_agents not in agent_counts:
                    continue
                if run_render != render_mode:
                    continue

                tr = run.get("trackingReport", {})
                for frame in tr.get("frames", []):
                    frame_num = frame.get("frameNumber")
                    agents = frame.get("agentPositions", [])
                    if not agents:
                        continue
                    for agent in agents:
                        rows.append({
                            "suite": name,
                            "method": run_method,
                            "agentCount": run_agents,
                            "frameNumber": frame_num,
                            "id": agent.get("id"),
                            "x": agent.get("x"),
                            "y": agent.get("y"),
                            "vx": agent.get("vx"),
                            "vy": agent.get("vy"),
                        })
        except ijson.IncompleteJSONError:
            print(f"  ⚠ Warning: {path.name} truncated. Recovered {len(rows)} agent positions.")

    return _coerce_numeric(pd.DataFrame(rows))


def agent_states_to_dataframe(
    suite: dict[str, Any],
    method: str,
    render_mode: str,
    agent_count: int,
) -> pd.DataFrame:
    """
    Extract per-agent state tracking data for a specific run.

    Requires a fully-loaded suite (via ``load_raw``).  The run must
    have been recorded with ``captureAgentStates=true``.

    Returns one row per agent per frame with ``frameNumber``, ``id``,
    ``x``, ``y``, ``vx``, ``vy``, ``species``.
    """
    target_run = None
    for run in suite.get("runs", []):
        if (
            run.get("method") == method
            and run.get("renderMode") == render_mode
            and run.get("agentCount") == agent_count
        ):
            target_run = run
            break

    if not target_run:
        raise ValueError(
            f"No run found matching {method=}, {render_mode=}, {agent_count=}"
        )

    rows: list[dict] = []
    tr = target_run.get("trackingReport", {})
    for frame in tr.get("frames", []):
        frame_num = frame.get("frameNumber")
        agents = frame.get("agentPositions", [])
        if not agents:
            continue
        for agent in agents:
            rows.append({
                "frameNumber": frame_num,
                "id": agent.get("id"),
                "x": agent.get("x"),
                "y": agent.get("y"),
                "vx": agent.get("vx"),
                "vy": agent.get("vy"),
                "species": agent.get("species"),
            })

    return pd.DataFrame(rows)


# ── Legacy aliases ────────────────────────────────────────────────────────
# Keep old names working so existing notebooks don't break immediately.

def load_benchmark_suite(json_path: str | Path) -> dict[str, Any]:
    """**Deprecated** — use ``load_raw()`` instead."""
    warnings.warn(
        "load_benchmark_suite() is deprecated, use load_raw() instead.",
        DeprecationWarning,
        stacklevel=2,
    )
    return load_raw(json_path)


def runs_to_dataframe(suite: dict[str, Any], suite_name: str = "") -> pd.DataFrame:
    """**Deprecated** — use ``load_runs_df()`` instead."""
    if not suite_name:
        suite_name = suite.get("simulationName", "unknown")
    rows = [_extract_run_row(r, suite_name) for r in suite.get("runs", [])]
    return _coerce_numeric(pd.DataFrame(rows))


def frames_to_dataframe(suite: dict[str, Any], suite_name: str = "") -> pd.DataFrame:
    """**Deprecated** — use ``load_frames_df()`` instead."""
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
            bridge = perf.get("bridgeTimings", {})
            if bridge:
                row["hostToGpuTime"] = bridge.get("hostToGpuTime")
                row["gpuToHostTime"] = bridge.get("gpuToHostTime")
            mem = perf.get("memoryStats", {})
            if mem:
                row["methodMemoryFootprintBytes"] = mem.get(
                    "methodMemoryFootprintBytes"
                )
            rows.append(row)
    return pd.DataFrame(rows)


def load_all_suites(raw_data_dir: str | Path) -> pd.DataFrame:
    """**Deprecated** — use ``load_all_runs()`` instead."""
    warnings.warn(
        "load_all_suites() is deprecated, use load_all_runs() instead.",
        DeprecationWarning,
        stacklevel=2,
    )
    return load_all_runs(raw_data_dir)
