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
