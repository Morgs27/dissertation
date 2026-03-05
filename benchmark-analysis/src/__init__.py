# benchmark-analysis shared modules
"""
``src`` — WebSimBench analysis toolkit.

Quick start::

    from src import load_runs_df, apply_style, get_method_color

    apply_style()
    df = load_runs_df("raw-data/basic-sweeps/boids/boids_benchmark_*.json")
"""

# ── Data loading (streaming-safe for 4 GB+ files) ────────────────────────
from .data_loader import (
    discover_files,
    load_all_runs,
    load_frames_df,
    load_raw,
    load_runs_df,
)

# ── Analysis helpers ──────────────────────────────────────────────────────
from .analysis import (
    compare_methods,
    crossover_point,
    positional_divergence,
    rolling_frame_stats,
    scaling_summary,
    speedup_vs_baseline,
    timing_breakdown,
)

# ── Plotting ──────────────────────────────────────────────────────────────
from .plot_style import apply_style, get_method_color, save_figure

# ── Constants ─────────────────────────────────────────────────────────────
from .constants import METHOD_COLORS, METHOD_LABELS, METHOD_ORDER

__all__ = [
    # data
    "discover_files",
    "load_all_runs",
    "load_frames_df",
    "load_raw",
    "load_runs_df",
    # analysis
    "compare_methods",
    "scaling_summary",
    "timing_breakdown",
    # plot
    "apply_style",
    "get_method_color",
    "save_figure",
    # constants
    "METHOD_COLORS",
    "METHOD_LABELS",
    "METHOD_ORDER",
]
