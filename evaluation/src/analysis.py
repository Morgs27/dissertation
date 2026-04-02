"""
Common analysis helpers for WebSimBench benchmark DataFrames.

These functions take the tidy DataFrames produced by ``data_loader``
and return filtered / pivoted views ready for plotting or tables.
"""

from __future__ import annotations

import pandas as pd

from .constants import METHOD_ORDER


def compare_methods(
    df: pd.DataFrame,
    metric: str = "avgExecutionMs",
    agent_count: int | None = None,
    render_mode: str | None = None,
) -> pd.DataFrame:
    """
    Pivot *df* so that each compute method is a column and each agent
    count is a row, for a quick side-by-side comparison.

    Parameters
    ----------
    df : pd.DataFrame
        Run-level DataFrame (from ``load_runs_df``).
    metric : str
        Column to compare (default ``avgExecutionMs``).
    agent_count : int, optional
        If given, filter to this single agent count.
    render_mode : str, optional
        Filter to this render mode (``none``, ``cpu``, ``gpu``).

    Returns
    -------
    pd.DataFrame
        Pivoted table with methods as columns, agent counts as rows.
    """
    view = df.copy()
    if agent_count is not None:
        view = view[view["agentCount"] == agent_count]
    if render_mode is not None:
        view = view[view["renderMode"] == render_mode]

    # Keep only methods that are present, in canonical order
    present = [m for m in METHOD_ORDER if m in view["method"].unique()]

    pivot = view.pivot_table(
        index="agentCount",
        columns="method",
        values=metric,
        aggfunc="mean",
    )
    # Reorder columns to canonical method order
    pivot = pivot[[m for m in present if m in pivot.columns]]
    pivot = pivot.sort_index()
    return pivot


def scaling_summary(
    df: pd.DataFrame,
    method: str | None = None,
    metric: str = "avgExecutionMs",
    render_mode: str | None = None,
) -> pd.DataFrame:
    """
    Return a summary showing how *metric* scales with agent count.

    Parameters
    ----------
    df : pd.DataFrame
        Run-level DataFrame.
    method : str, optional
        Filter to a single method.
    metric : str
        Column to summarise (default ``avgExecutionMs``).
    render_mode : str, optional
        Filter to a render mode.

    Returns
    -------
    pd.DataFrame
        Columns: ``agentCount``, ``method``, *metric* (mean),
        plus ``_std`` and ``_count`` variants.
    """
    view = df.copy()
    if method is not None:
        view = view[view["method"] == method]
    if render_mode is not None:
        view = view[view["renderMode"] == render_mode]

    grouped = (
        view
        .groupby(["agentCount", "method"])[metric]
        .agg(["mean", "std", "count"])
        .reset_index()
        .rename(columns={"mean": metric, "std": f"{metric}_std", "count": "n"})
    )
    return grouped.sort_values(["method", "agentCount"]).reset_index(drop=True)


def timing_breakdown(
    df: pd.DataFrame,
    methods: list[str] | None = None,
    agent_count: int | None = None,
    render_mode: str | None = None,
) -> pd.DataFrame:
    """
    Return a table of average timing components (setup, compute,
    readback, render) per method, suitable for a stacked bar chart.

    Parameters
    ----------
    df : pd.DataFrame
        Run-level DataFrame.
    methods : list[str], optional
        Methods to include (default: all).
    agent_count : int, optional
        Filter to a single agent count.
    render_mode : str, optional
        Filter to a render mode.

    Returns
    -------
    pd.DataFrame
        Index = method, columns = timing components.
    """
    timing_cols = ["avgSetupTime", "avgComputeTime", "avgReadbackTime", "avgRenderTime"]
    view = df.copy()
    if methods is not None:
        view = view[view["method"].isin(methods)]
    if agent_count is not None:
        view = view[view["agentCount"] == agent_count]
    if render_mode is not None:
        view = view[view["renderMode"] == render_mode]

    present_cols = [c for c in timing_cols if c in view.columns]
    grouped = view.groupby("method")[present_cols].mean()

    # Reorder to canonical order
    order = [m for m in METHOD_ORDER if m in grouped.index]
    return grouped.loc[order]


# ── Crossover analysis ────────────────────────────────────────────────────

def crossover_point(
    df: pd.DataFrame,
    method_a: str,
    method_b: str,
    metric: str = "avgExecutionMs",
    render_mode: str | None = None,
) -> int | None:
    """
    Find the lowest agent count where *method_b* becomes faster than
    *method_a* (i.e. ``metric_a > metric_b``).

    Returns ``None`` if *method_b* never beats *method_a* in the data.
    """
    pivot = compare_methods(df, metric, render_mode=render_mode)
    if method_a not in pivot.columns or method_b not in pivot.columns:
        return None
    diff = pivot[method_a] - pivot[method_b]
    faster = diff[diff > 0]
    if faster.empty:
        return None
    return int(faster.index.min())


def interpolated_crossover_point(
    df: pd.DataFrame,
    method_a: str,
    method_b: str,
    metric: str = "avgComputeTime",
    render_mode: str | None = None,
) -> float | None:
    """
    Find the exact interpolated agent count where *method_b* becomes faster than
    *method_a* (diff crosses zero). Uses log-linear interpolation.
    """
    import numpy as np
    pivot = compare_methods(df, metric, render_mode=render_mode)
    if method_a not in pivot.columns or method_b not in pivot.columns:
        return None
        
    pivot = pivot.dropna(subset=[method_a, method_b]).sort_index()
    if pivot.empty:
        return None
    
    diff = pivot[method_a] - pivot[method_b]
    
    for i in range(len(diff) - 1):
        if diff.iloc[i] <= 0 and diff.iloc[i+1] > 0:
            x0, y0 = diff.index[i], diff.iloc[i]
            x1, y1 = diff.index[i+1], diff.iloc[i+1]
            
            # log-linear interpolation on X axis
            log_x0, log_x1 = np.log10(x0), np.log10(x1)
            fraction = (0 - y0) / (y1 - y0)
            log_xc = log_x0 + fraction * (log_x1 - log_x0)
            return 10**log_xc
            
    if (diff > 0).all():
        return float(diff.index[0])

    return None


# ── Speedup ratios ────────────────────────────────────────────────────────

def speedup_vs_baseline(
    df: pd.DataFrame,
    baseline_col: str,
    baseline_val,
    group_cols: list[str],
    metric: str = "avgExecutionMs",
) -> pd.DataFrame:
    """
    Compute speedup ratios relative to a baseline subset.

    Parameters
    ----------
    df : pd.DataFrame
        Should contain columns *baseline_col*, *group_cols*, *metric*.
    baseline_col : str
        Column that identifies the baseline variant (e.g. ``workerCount``).
    baseline_val
        Value of *baseline_col* used as the denominator.
    group_cols : list[str]
        Columns that define equivalent groups (e.g. ``["agentCount", "suite"]``).
    metric : str
        Timing metric to compute speedup on.

    Returns
    -------
    pd.DataFrame
        Original DataFrame with an added ``speedup`` column.
    """
    base = (
        df[df[baseline_col] == baseline_val]
        .groupby(group_cols)[metric]
        .mean()
        .rename("_baseline")
    )
    merged = df.merge(base, on=group_cols, how="left")
    merged["speedup"] = merged["_baseline"] / merged[metric]
    return merged.drop(columns=["_baseline"])


# ── Rolling frame statistics ──────────────────────────────────────────────

def rolling_frame_stats(
    frames_df: pd.DataFrame,
    window: int = 50,
    metric: str = "totalExecutionTime",
) -> pd.DataFrame:
    """
    Add rolling mean and std columns for a frame-level metric.

    Parameters
    ----------
    frames_df : pd.DataFrame
        Frame-level DataFrame from ``load_frames_df``.
    window : int
        Rolling window size (in frames).
    metric : str
        Column to smooth.

    Returns
    -------
    pd.DataFrame
        Original DataFrame with ``{metric}_rolling_mean`` and
        ``{metric}_rolling_std`` columns.
    """
    out = frames_df.copy()
    out = out.sort_values(["method", "frameNumber"])
    out[f"{metric}_rolling_mean"] = (
        out.groupby("method")[metric]
        .transform(lambda s: s.rolling(window, min_periods=1).mean())
    )
    out[f"{metric}_rolling_std"] = (
        out.groupby("method")[metric]
        .transform(lambda s: s.rolling(window, min_periods=1).std())
    )
    return out


# ── Positional divergence (numerical accuracy) ───────────────────────────

def positional_divergence(
    frames_a: pd.DataFrame,
    frames_b: pd.DataFrame,
) -> pd.DataFrame:
    """
    Compute per-frame Euclidean distance between agent positions from
    two different methods / devices.

    Both DataFrames must have columns ``frameNumber``, ``id``, ``x``, ``y``
    (as produced by ``agent_states_to_dataframe`` or extracted from
    ``load_frames_df`` with agent positions).

    Returns
    -------
    pd.DataFrame
        Columns: ``frameNumber``, ``id``, ``dx``, ``dy``, ``distance``,
        plus a per-frame ``mean_distance`` and ``max_distance``.
    """
    import numpy as np

    merged = frames_a.merge(
        frames_b,
        on=["frameNumber", "id"],
        suffixes=("_a", "_b"),
        how="inner",
    )
    merged["dx"] = merged["x_a"] - merged["x_b"]
    merged["dy"] = merged["y_a"] - merged["y_b"]
    merged["distance"] = np.sqrt(merged["dx"] ** 2 + merged["dy"] ** 2)

    # Per-frame aggregates
    per_frame = (
        merged.groupby("frameNumber")["distance"]
        .agg(["mean", "max"])
        .rename(columns={"mean": "mean_distance", "max": "max_distance"})
    )
    return merged, per_frame


# ── Compute time percentages ─────────────────────────────────────────────

def compute_time_percentages(
    df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Add percentage columns for each timing component relative to
    ``avgTotalTime``.

    Parameters
    ----------
    df : pd.DataFrame
        Run-level DataFrame with ``avgSetupTime``, ``avgComputeTime``,
        ``avgReadbackTime``, ``avgRenderTime``, and ``avgTotalTime``.

    Returns
    -------
    pd.DataFrame
        Copy of *df* with added ``setup_pct``, ``compute_pct``,
        ``readback_pct``, ``render_pct`` columns (0–100).
    """
    out = df.copy()
    total = out["avgTotalTime"].replace(0, float("nan"))
    for col, pct_col in [
        ("avgSetupTime", "setup_pct"),
        ("avgComputeTime", "compute_pct"),
        ("avgReadbackTime", "readback_pct"),
        ("avgRenderTime", "render_pct"),
    ]:
        if col in out.columns:
            out[pct_col] = (out[col] / total) * 100
    return out


# ── Variance / stability summary ─────────────────────────────────────────

def variance_summary(
    frames_df: pd.DataFrame,
    metric: str = "totalExecutionTime",
    groupby: list[str] | None = None,
) -> pd.DataFrame:
    """
    Compute variance, coefficient of variation (CV), IQR, and range for
    a frame-level metric, grouped by the given columns.

    Parameters
    ----------
    frames_df : pd.DataFrame
        Frame-level DataFrame (from ``load_frames_df``).
    metric : str
        Column to compute statistics for.
    groupby : list[str], optional
        Columns to group by.  Defaults to ``["method", "agentCount"]``.

    Returns
    -------
    pd.DataFrame
        Columns: groupby keys + ``mean``, ``std``, ``cv``, ``iqr``,
        ``range``, ``p5``, ``p25``, ``p50``, ``p75``, ``p95``, ``n``.
    """
    import numpy as np

    if groupby is None:
        groupby = ["method", "agentCount"]

    def _stats(s: pd.Series) -> pd.Series:
        return pd.Series({
            "mean": s.mean(),
            "std": s.std(),
            "cv": s.std() / s.mean() if s.mean() != 0 else float("nan"),
            "iqr": s.quantile(0.75) - s.quantile(0.25),
            "range": s.max() - s.min(),
            "p5": s.quantile(0.05),
            "p25": s.quantile(0.25),
            "p50": s.quantile(0.50),
            "p75": s.quantile(0.75),
            "p95": s.quantile(0.95),
            "n": len(s),
        })

    return (
        frames_df.groupby(groupby)[metric]
        .apply(_stats)
        .unstack()
        .reset_index()
    )


# ── Battery drain rate ───────────────────────────────────────────────────

def battery_drain_rate(
    df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Compute battery drain rate per second and per 1000 frames from
    run-level battery sampling columns.

    Parameters
    ----------
    df : pd.DataFrame
        Run-level DataFrame with ``rsBattery_deltaLevel``,
        ``durationMs``, and ``executedFrames``.

    Returns
    -------
    pd.DataFrame
        Copy of *df* with ``battery_drain_per_sec`` (level units / s)
        and ``battery_drain_per_1k_frames`` columns.  Rows where battery
        data is absent will have NaN.
    """
    out = df.copy()
    delta = out["rsBattery_deltaLevel"].abs()  # delta is negative (drain)
    duration_s = out["durationMs"] / 1000.0
    out["battery_drain_per_sec"] = delta / duration_s.replace(0, float("nan"))
    out["battery_drain_per_1k_frames"] = (
        delta / out["executedFrames"].replace(0, float("nan")) * 1000
    )
    return out


# ── Thermal throttling summary ───────────────────────────────────────────

def thermal_throttling_summary(
    df: pd.DataFrame,
    groupby: list[str] | None = None,
) -> pd.DataFrame:
    """
    Pivot thermal canary metrics by method (and optionally other columns).

    Returns per-group mean drift, p95 drift, max drift, and total
    throttling events.

    Parameters
    ----------
    df : pd.DataFrame
        Run-level DataFrame with ``rsThermal_*`` columns.
    groupby : list[str], optional
        Columns to group by.  Defaults to ``["method"]``.

    Returns
    -------
    pd.DataFrame
        Aggregated thermal metrics.
    """
    if groupby is None:
        groupby = ["method"]

    thermal_cols = {
        "rsThermal_avgDriftMs": "mean",
        "rsThermal_p95DriftMs": "mean",
        "rsThermal_maxDriftMs": "max",
        "rsThermal_throttlingEvents": "sum",
        "rsThermal_sampleCount": "sum",
    }
    present = {c: a for c, a in thermal_cols.items() if c in df.columns}
    if not present:
        return pd.DataFrame()

    return df.groupby(groupby).agg(present).reset_index()


# ── Memory pressure ──────────────────────────────────────────────────────

def memory_pressure(
    df: pd.DataFrame,
) -> pd.DataFrame:
    """
    Compute memory-pressure derived metrics from run-level data.

    Adds:
    - ``jsHeap_delta_pct``: JS heap growth as % of heap limit.
    - ``methodMem_pct_of_heap``: Method memory footprint as % of used
      JS heap.

    Parameters
    ----------
    df : pd.DataFrame
        Run-level DataFrame with ``rsJsHeap_*`` and ``avgMemoryBytes``
        columns.

    Returns
    -------
    pd.DataFrame
        Copy of *df* with derived columns.
    """
    out = df.copy()
    if "rsJsHeap_deltaBytes" in out.columns and "rsJsHeap_startBytes" in out.columns:
        limit = out.get("rsJsHeap_maxBytes", out.get("rsJsHeap_startBytes"))
        out["jsHeap_delta_pct"] = (
            out["rsJsHeap_deltaBytes"] / limit.replace(0, float("nan")) * 100
        )
    if "avgMemoryBytes" in out.columns and "rsJsHeap_avgBytes" in out.columns:
        out["methodMem_pct_of_heap"] = (
            out["avgMemoryBytes"]
            / out["rsJsHeap_avgBytes"].replace(0, float("nan"))
            * 100
        )
    return out
