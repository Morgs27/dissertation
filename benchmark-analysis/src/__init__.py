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
    load_runtime_samples_df,
    stream_agent_positions_df,
)

# ── Analysis helpers ──────────────────────────────────────────────────────
from .analysis import (
    battery_drain_rate,
    compare_methods,
    compute_time_percentages,
    crossover_point,
    interpolated_crossover_point,
    memory_pressure,
    positional_divergence,
    rolling_frame_stats,
    scaling_summary,
    speedup_vs_baseline,
    thermal_throttling_summary,
    timing_breakdown,
    variance_summary,
)

# ── Plotting ──────────────────────────────────────────────────────────────
from .plot_style import apply_style, get_method_color, save_figure

# ── Constants ─────────────────────────────────────────────────────────────
from .constants import METHOD_COLORS, METHOD_LABELS, METHOD_ORDER, WORKER_COUNT_COLORS

__all__ = [
    # data
    "discover_files",
    "load_all_runs",
    "load_frames_df",
    "load_raw",
    "stream_agent_positions_df",
    "load_runs_df",
    "load_runtime_samples_df",
    # analysis
    "battery_drain_rate",
    "compare_methods",
    "compute_time_percentages",
    "crossover_point",
    "interpolated_crossover_point",
    "memory_pressure",
    "scaling_summary",
    "thermal_throttling_summary",
    "timing_breakdown",
    "variance_summary",
    # plot
    "apply_style",
    "get_method_color",
    "save_figure",
    # constants
    "METHOD_COLORS",
    "METHOD_LABELS",
    "METHOD_ORDER",
    "WORKER_COUNT_COLORS",
]
