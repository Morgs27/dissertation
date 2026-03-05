# ---
# jupyter:
#   jupytext:
#     text_representation:
#       format_name: percent
# ---

# %% [markdown]
# # 06 — Endurance & Thermal Stability
#
# **Research question:** How does performance change over 1000 seconds
# of sustained load? Is there evidence of thermal throttling?
#
# **Data:** endurance (4 sims) — sustained load over 1000s per run
#
# > Run `00_build_dataset.py` first to generate the parquet files.

# %%
import sys, os
sys.path.insert(0, os.path.abspath(".."))

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from src import (
    apply_style, get_method_color, save_figure,
    METHOD_LABELS,
)

apply_style()

# %% [markdown]
# ## 1. Load pre-processed data

# %%
summary_df = pd.read_parquet("../processed/endurance_runs.parquet")
frames_df = pd.read_parquet("../processed/endurance_frames.parquet")
print(f"Runs: {len(summary_df)} | Frames: {len(frames_df)}")

print("\n=== Endurance Run Summaries ===")
print(summary_df[["suite", "method", "renderMode", "agentCount",
                   "executedFrames", "durationMs", "avgComputeTime"]].to_string(index=False))

# %% [markdown]
# ## 2. Frame-level time-series — compute time over 1000s

# %%
endurance_sims = sorted(frames_df["suite"].unique())
n_sims = len(endurance_sims)
cols = min(n_sims, 2)
rows = (n_sims + cols - 1) // cols

fig, axes = plt.subplots(rows, cols, figsize=(8 * cols, 5 * rows))
if n_sims == 1:
    axes = [axes]
else:
    axes = axes.flatten()

for ax, sim in zip(axes, endurance_sims):
    fdf = frames_df[frames_df["suite"] == sim]
    if fdf.empty:
        ax.set_title(f"{sim} — no data")
        continue

    for method in fdf["method"].unique():
        subset = fdf[fdf["method"] == method].sort_values("frameNumber")
        if subset.empty:
            continue

        # Convert frame number to approximate seconds
        run_info = summary_df[
            (summary_df["suite"] == sim) & (summary_df["method"] == method)
        ]
        if not run_info.empty:
            total_frames = run_info.iloc[0]["executedFrames"]
            duration_s = run_info.iloc[0]["durationMs"] / 1000
            subset = subset.copy()
            subset["time_s"] = subset["frameNumber"] / total_frames * duration_s
        else:
            subset = subset.copy()
            subset["time_s"] = subset["frameNumber"]

        window = max(50, len(subset) // 100)
        rolling = subset["computeTime"].rolling(window, min_periods=1).mean()

        ax.plot(
            subset["time_s"], rolling,
            label=METHOD_LABELS.get(method, method),
            color=get_method_color(method),
            alpha=0.8, linewidth=1,
        )

    ax.set_xlabel("Time (seconds)")
    ax.set_ylabel("Compute Time — Rolling Avg (ms)")
    ax.set_title(f"{sim}", fontweight="bold")
    ax.legend(fontsize=8)

# Hide unused axes
for ax in axes[n_sims:]:
    ax.set_visible(False)

fig.suptitle("Endurance: Compute Time Over 1000 Seconds", fontsize=14, fontweight="bold")
plt.tight_layout()
save_figure(fig, "06_endurance_timeseries")
plt.show()

# %% [markdown]
# ## 3. Thermal throttling detection
#
# Compare performance in the first 10% vs last 10% of frames.

# %%
stability = []
for sim in endurance_sims:
    fdf = frames_df[frames_df["suite"] == sim]
    if fdf.empty:
        continue

    for method in fdf["method"].unique():
        subset = fdf[fdf["method"] == method].sort_values("frameNumber")
        if len(subset) < 100:
            continue

        run_info = summary_df[
            (summary_df["suite"] == sim) & (summary_df["method"] == method)
        ]
        if run_info.empty:
            continue

        total_frames = int(run_info.iloc[0]["executedFrames"])
        duration_s = run_info.iloc[0]["durationMs"] / 1000

        n_window = max(100, total_frames // 10)
        first = subset.head(n_window)["computeTime"]
        last = subset.tail(n_window)["computeTime"]

        stability.append({
            "simulation": sim,
            "method": method,
            "first_mean_ms": first.mean(),
            "last_mean_ms": last.mean(),
            "first_std_ms": first.std(),
            "last_std_ms": last.std(),
            "slowdown_pct": ((last.mean() - first.mean()) / first.mean()) * 100,
            "total_frames": total_frames,
            "duration_s": duration_s,
        })

stab_df = pd.DataFrame(stability)
print("=== Thermal Stability: First 10% vs Last 10% ===")
print(stab_df.round(2).to_string(index=False))

# %%
fig, ax = plt.subplots(figsize=(10, 5))

x = np.arange(len(stab_df))
width = 0.35

ax.bar(x - width/2, stab_df["first_mean_ms"], width,
       label="First 10%", color=[get_method_color(m) for m in stab_df["method"]],
       alpha=0.7, edgecolor="white")
ax.bar(x + width/2, stab_df["last_mean_ms"], width,
       label="Last 10%", color=[get_method_color(m) for m in stab_df["method"]],
       alpha=1.0, edgecolor="white")

labels = [f"{r['simulation']}\n{r['method']}" for _, r in stab_df.iterrows()]
ax.set_xticks(x)
ax.set_xticklabels(labels, fontsize=8)
ax.set_ylabel("Avg Compute Time (ms)")
ax.set_title("First 10% vs Last 10% of Frames — Thermal Throttling Check")
ax.legend()

for i, (_, row) in enumerate(stab_df.iterrows()):
    pct = row["slowdown_pct"]
    color = "#EE6677" if pct > 5 else "#228833"
    ax.annotate(f"{pct:+.1f}%", (i, max(row["first_mean_ms"], row["last_mean_ms"]) + 1),
                ha="center", fontsize=8, fontweight="bold", color=color)

save_figure(fig, "06_thermal_stability")
plt.show()

# %% [markdown]
# ## 4. Frame-time variance over time

# %%
fig, axes = plt.subplots(rows, cols, figsize=(8 * cols, 5 * rows))
if n_sims == 1:
    axes = [axes]
else:
    axes = axes.flatten()

for ax, sim in zip(axes, endurance_sims):
    fdf = frames_df[frames_df["suite"] == sim]
    if fdf.empty:
        continue

    for method in fdf["method"].unique():
        subset = fdf[fdf["method"] == method].sort_values("frameNumber").copy()
        if len(subset) < 100:
            continue

        window = max(100, len(subset) // 20)
        rolling_std = subset["computeTime"].rolling(window, min_periods=50).std()

        run_info = summary_df[
            (summary_df["suite"] == sim) & (summary_df["method"] == method)
        ]
        if not run_info.empty:
            total_frames = int(run_info.iloc[0]["executedFrames"])
            duration_s = run_info.iloc[0]["durationMs"] / 1000
            time_s = subset["frameNumber"].values / total_frames * duration_s
        else:
            time_s = subset["frameNumber"].values

        ax.plot(time_s, rolling_std,
                label=METHOD_LABELS.get(method, method),
                color=get_method_color(method), alpha=0.8)

    ax.set_xlabel("Time (seconds)")
    ax.set_ylabel("Compute Time Std Dev (ms)")
    ax.set_title(f"{sim}", fontweight="bold")
    ax.legend(fontsize=8)

for ax in axes[n_sims:]:
    ax.set_visible(False)

fig.suptitle("Compute Time Variability Over Time (rolling σ)",
             fontsize=14, fontweight="bold")
plt.tight_layout()
save_figure(fig, "06_variance_over_time")
plt.show()

# %% [markdown]
# ## 5. Throughput comparison

# %%
fig, ax = plt.subplots(figsize=(9, 5))

throughput = summary_df[["suite", "method", "executedFrames"]].copy()
throughput["fps"] = throughput["executedFrames"] / 1000

pivot = throughput.pivot_table(index="suite", columns="method", values="fps")
pivot.plot.bar(ax=ax, color=[get_method_color(m) for m in pivot.columns],
               edgecolor="white")
ax.set_ylabel("Average FPS (frames / second)")
ax.set_title("Sustained Throughput Over 1000 Seconds")
ax.set_xticklabels(pivot.index, rotation=0)
ax.legend(title="Method")
save_figure(fig, "06_endurance_throughput")
plt.show()
