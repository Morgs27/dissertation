# Benchmark Analysis

Analysis pipeline for [WebSimBench](https://websimbench.dev) benchmark data.  
Compares JavaScript, Web Workers, WebAssembly, and WebGPU performance across agent-based simulations.

## Setup

```bash
python -m venv .venv && source .venv/bin/activate
pip install -r requirements.txt
```

## Quick Start

```python
import sys, os
sys.path.insert(0, os.path.abspath("."))
from src import discover_files, load_runs_df, apply_style, compare_methods

# 1. See what data is available
discover_files("raw-data")

# 2. Load run summaries (streams large files — safe for 4 GB+)
df = load_runs_df("raw-data/basic-sweeps/boids/boids_benchmark_1772656417289.json")

# 3. Compare methods
compare_methods(df, "avgExecutionMs", render_mode="cpu")

# 4. Plot
apply_style()
df.pivot_table("avgExecutionMs", "agentCount", "method").plot()
```

## Directory Layout

```
benchmark-analysis/
├── raw-data/           # Benchmark JSON exports (up to 4 GB each)
├── src/                # Python toolkit (import into notebooks)
│   ├── data_loader.py  # Streaming loaders (ijson)
│   ├── analysis.py     # Comparison / scaling helpers
│   ├── constants.py    # Colours, method order, labels
│   └── plot_style.py   # Academic matplotlib theme
├── notebooks/          # Jupyter analysis notebooks
├── outputs/figures/    # Auto-saved 300 DPI figures
└── requirements.txt
```

## API Reference

### Data Loading

| Function | Description |
|---|---|
| `discover_files(dir)` | List all JSON files with sizes — pick before loading |
| `load_runs_df(path)` | **Primary loader.** Streams JSON, returns run-level summary DataFrame. Safe for 4 GB+ files |
| `load_frames_df(path, *, methods, agent_counts, max_frames)` | Stream frame-level performance data with optional filters |
| `load_all_runs(dir)` | Load every JSON under a directory into one DataFrame |
| `load_raw(path)` | Full `json.load()` — **small files only** (< 500 MB) |

### Analysis

| Function | Description |
|---|---|
| `compare_methods(df, metric, agent_count, render_mode)` | Pivot table: methods as columns, agent counts as rows |
| `scaling_summary(df, method, metric, render_mode)` | How a metric scales with agent count (mean, std, n) |
| `timing_breakdown(df, methods, agent_count, render_mode)` | Setup / compute / readback / render breakdown per method |

### Plotting

| Function | Description |
|---|---|
| `apply_style(palette=0)` | Set global matplotlib theme. Call once per notebook |
| `get_method_color(method)` | Get the palette colour for a method |
| `save_figure(fig, name)` | Save to `outputs/figures/` at 300 DPI (PNG + PDF) |

## Handling Large Files

Most files in `basic-sweeps/` are **~4 GB**. Key rules:

- ✅ Use `load_runs_df()` — streams the JSON, extracts only summaries  
- ✅ Use `load_frames_df(methods=["WebGPU"], agent_counts=[5000])` — filter to avoid loading everything  
- ❌ Don't use `load_raw()` on 4 GB files — it will consume ~16 GB RAM
