# ---
# jupyter:
#   jupytext:
#     text_representation:
#       format_name: percent
# ---

# %% [markdown]
# # 01 — Performance Scaling
#
# **Research question:** How does each compute backend scale with agent count?
# Where do crossover points occur? How variable is performance?
#
# **Data:** basic-sweeps (8 simulations), high-agents (3 simulations)
#
# > Run `00_build_dataset.py` first to generate the parquet files.

# %%
import sys, os
sys.path.insert(0, os.path.abspath(".."))

import matplotlib.pyplot as plt
import matplotlib.ticker as ticker
import numpy as np
import pandas as pd

from src import (
    compare_methods, scaling_summary, crossover_point,
    apply_style, get_method_color, save_figure,
    METHOD_ORDER, METHOD_LABELS,
)

apply_style()

# %% [markdown]
# ## 1. Load pre-processed data

# %%
sweep_df = pd.read_parquet("../processed/basic_sweeps.parquet")
hi_df = pd.read_parquet("../processed/high_agents.parquet")
print(f"Basic sweeps: {len(sweep_df)} runs | High agents: {len(hi_df)} runs")

# %% [markdown]
# ## 2. Prepare main comparison DataFrame
#
# For the main scaling comparisons we:
# - Use CPU render mode only (isolates compute from rendering)
# - For WebWorkers: keep only the **best** (fastest) worker count per agent count
# - For WebAssembly: keep only the **best** (fastest) WASM mode per agent count

# %%
def best_per_method(df):
    """Reduce variants to best config per method × sim × agentCount."""
    out = df[df["renderMode"] == "cpu"].copy()

    # WebWorkers: keep best worker count
    ww = out[out["method"] == "WebWorkers"]
    if not ww.empty:
        best_ww = ww.loc[ww.groupby(["suite", "agentCount"])["avgComputeTime"].idxmin()]
        out = pd.concat([out[out["method"] != "WebWorkers"], best_ww])

    # WebAssembly: keep best mode (SIMD or scalar or auto)
    wa = out[out["method"] == "WebAssembly"]
    if not wa.empty:
        best_wa = wa.loc[wa.groupby(["suite", "agentCount"])["avgComputeTime"].idxmin()]
        out = pd.concat([out[out["method"] != "WebAssembly"], best_wa])

    return out.reset_index(drop=True)

main_df = best_per_method(sweep_df)
print(f"Main comparison: {len(main_df)} rows (best config per method)")

# %% [markdown]
# ## 3. Mean compute time — all 8 simulations
#
# Log-log plots of average compute time vs agent count.

# %%
sweep_sims = sorted(main_df["suite"].unique())

fig, axes = plt.subplots(2, 4, figsize=(18, 9), sharex=False, sharey=False)
axes = axes.flatten()

for ax, sim in zip(axes, sweep_sims):
    sim_df = main_df[main_df["suite"] == sim]

    for method in METHOD_ORDER:
        subset = sim_df[sim_df["method"] == method].sort_values("agentCount")
        if subset.empty:
            continue
        ax.plot(
            subset["agentCount"], subset["avgComputeTime"],
            label=METHOD_LABELS.get(method, method),
            color=get_method_color(method),
            marker="o", markersize=4,
        )

    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_title(sim.capitalize(), fontsize=11, fontweight="bold")
    ax.set_xlabel("Agent Count")
    ax.set_ylabel("Avg Compute Time (ms)")

axes[0].legend(fontsize=8, loc="upper left")
fig.suptitle("Mean Compute Time vs Agent Count (CPU Render, Best Config)",
             fontsize=14, fontweight="bold")
plt.tight_layout()
save_figure(fig, "01_scaling_mean")
plt.show()

# %% [markdown]
# ## 4. Min / Max / Percentile compute spread
#
# The summary-level `frameTime_*` stats capture total frame time.
# Here we show min, p50, p95, and max to visualise the spread
# of per-frame performance at each agent count.

# %%
fig, axes = plt.subplots(2, 4, figsize=(18, 9), sharex=False, sharey=False)
axes = axes.flatten()

for ax, sim in zip(axes, sweep_sims):
    sim_df = main_df[main_df["suite"] == sim]

    for method in METHOD_ORDER:
        subset = sim_df[sim_df["method"] == method].sort_values("agentCount")
        if subset.empty:
            continue
        c = get_method_color(method)

        # Median line
        ax.plot(
            subset["agentCount"], subset["frameTime_p50"],
            label=METHOD_LABELS.get(method, method),
            color=c, marker="o", markersize=3, linewidth=1.5,
        )

        # p5–p95 band (use min as lower bound since we don't have p5)
        if "frameTime_min" in subset.columns and "frameTime_p95" in subset.columns:
            ax.fill_between(
                subset["agentCount"],
                subset["frameTime_min"],
                subset["frameTime_p95"],
                alpha=0.12, color=c,
            )

        # Max as scatter
        if "frameTime_max" in subset.columns:
            ax.scatter(
                subset["agentCount"], subset["frameTime_max"],
                marker="x", color=c, s=15, alpha=0.5, zorder=5,
            )

    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_title(sim.capitalize(), fontsize=11, fontweight="bold")
    ax.set_xlabel("Agent Count")
    ax.set_ylabel("Frame Time (ms)")

axes[0].legend(fontsize=7, loc="upper left")
fig.suptitle("Frame Time Spread: Median (line), Min–P95 (band), Max (×)",
             fontsize=13, fontweight="bold")
plt.tight_layout()
save_figure(fig, "01_scaling_spread")
plt.show()

# %% [markdown]
# ## 5. Violin / box plot of frame times at selected agent counts
#
# For a representative simulation, show the distribution of frame-level
# compute times across methods at key agent counts.

# %%
# Load frame-level data for one sim to do violin plots
from src import load_frames_df
from pathlib import Path

rep_sim = "boids"
rep_path = next(Path("../raw-data/basic-sweeps").rglob("*.json"), None)
for p in sorted(Path("../raw-data/basic-sweeps").rglob("*.json")):
    if rep_sim in p.parent.name:
        rep_path = p
        break

if rep_path and rep_path.exists():
    print(f"Loading frame-level data from {rep_path.name} for violin plots...")
    frames = load_frames_df(rep_path, suite_name=rep_sim)

    # Best per method for frames too
    frames_cpu = frames[frames["renderMode"] == "cpu"].copy()

    # WebWorkers: keep only workerCount that gave best average
    ww_best = main_df[
        (main_df["suite"] == rep_sim) & (main_df["method"] == "WebWorkers")
    ][["agentCount", "workerCount"]].drop_duplicates()

    if not ww_best.empty:
        frames_cpu = frames_cpu.merge(
            ww_best.rename(columns={"workerCount": "best_wc"}),
            on="agentCount", how="left",
        )
        ww_mask = frames_cpu["method"] == "WebWorkers"
        frames_cpu = frames_cpu[~ww_mask | (frames_cpu["workerCount"] == frames_cpu["best_wc"])]
        frames_cpu.drop(columns=["best_wc"], inplace=True, errors="ignore")

    violin_agents = [100, 1000, 5000, 10000]
    methods_present = [m for m in METHOD_ORDER if m in frames_cpu["method"].unique()]

    fig, axes = plt.subplots(1, len(violin_agents), figsize=(5 * len(violin_agents), 5))
    if len(violin_agents) == 1:
        axes = [axes]

    for ax, n in zip(axes, violin_agents):
        data_for_violin = []
        labels = []
        colors = []

        for method in methods_present:
            subset = frames_cpu[
                (frames_cpu["agentCount"] == n) & (frames_cpu["method"] == method)
            ]["computeTime"].dropna()
            if len(subset) > 5:
                data_for_violin.append(subset.values)
                labels.append(METHOD_LABELS.get(method, method))
                colors.append(get_method_color(method))

        if data_for_violin:
            parts = ax.violinplot(data_for_violin, showmedians=True, showextrema=True)
            for i, pc in enumerate(parts["bodies"]):
                pc.set_facecolor(colors[i])
                pc.set_alpha(0.6)
            for key in ["cmins", "cmaxes", "cmedians", "cbars"]:
                if key in parts:
                    parts[key].set_color("black")
            ax.set_xticks(range(1, len(labels) + 1))
            ax.set_xticklabels(labels, rotation=30, ha="right", fontsize=8)

        ax.set_ylabel("Compute Time (ms)")
        ax.set_title(f"N = {n:,}", fontweight="bold")

    fig.suptitle(f"Compute Time Distribution — {rep_sim.capitalize()} (CPU Render)",
                 fontsize=14, fontweight="bold")
    plt.tight_layout()
    save_figure(fig, "01_violin_compute")
    plt.show()
else:
    print("⚠ Raw boids data not found — skipping violin plots")

# %% [markdown]
# ## 6. Crossover point analysis
#
# At what agent count does WebGPU become faster than JavaScript?

# %%
crossovers = []
for sim in sweep_sims:
    sim_df = main_df[main_df["suite"] == sim]
    xp = crossover_point(sim_df, "JavaScript", "WebGPU", metric="avgComputeTime")
    crossovers.append({"simulation": sim, "JS→WebGPU crossover": xp})

xp_df = pd.DataFrame(crossovers)
print("Crossover points (agent count where WebGPU < JavaScript):")
print(xp_df.to_string(index=False))

# %% [markdown]
# ## 7. Aggregated scaling across all simulations
#
# Normalize each simulation's compute time to its value at the lowest
# meaningful agent count, then average across simulations.

# %%
fig, ax = plt.subplots(figsize=(9, 6))

for method in METHOD_ORDER:
    all_norm = []
    for sim in sweep_sims:
        sim_df = main_df[
            (main_df["suite"] == sim) &
            (main_df["method"] == method)
        ].sort_values("agentCount")

        # Use a meaningful baseline — skip agent counts where
        # compute time is sub-microsecond
        meaningful = sim_df[sim_df["avgComputeTime"] > 0.01].sort_values("agentCount")
        if len(meaningful) < 2:
            continue
        base = meaningful["avgComputeTime"].iloc[0]
        normed = meaningful[["agentCount"]].copy()
        normed["normalized"] = meaningful["avgComputeTime"].values / base
        all_norm.append(normed)

    if not all_norm:
        continue
    combined = pd.concat(all_norm)
    avg = combined.groupby("agentCount")["normalized"].agg(["mean", "std"]).reset_index()

    ax.plot(
        avg["agentCount"], avg["mean"],
        label=METHOD_LABELS.get(method, method),
        color=get_method_color(method),
        marker="o", markersize=5,
    )
    ax.fill_between(
        avg["agentCount"],
        avg["mean"] - avg["std"],
        avg["mean"] + avg["std"],
        alpha=0.15, color=get_method_color(method),
    )

ax.set_xscale("log")
ax.set_yscale("log")
ax.set_xlabel("Agent Count")
ax.set_ylabel("Normalized Compute Time (×baseline)")
ax.set_title("Aggregated Scaling Across All 8 Simulations (mean ± 1σ)")
ax.legend()
save_figure(fig, "01_aggregated_scaling")
plt.show()

# %% [markdown]
# ## 8. P95/P50 ratio — tail latency scaling
#
# How much worse is the worst-case vs typical frame?

# %%
fig, axes = plt.subplots(2, 4, figsize=(18, 9))
axes = axes.flatten()

for ax, sim in zip(axes, sweep_sims):
    sim_df = main_df[main_df["suite"] == sim]

    for method in METHOD_ORDER:
        subset = sim_df[sim_df["method"] == method].sort_values("agentCount")
        if subset.empty or "frameTime_p95" not in subset.columns:
            continue
        ratio = subset["frameTime_p95"] / subset["frameTime_p50"]
        ratio = ratio.replace([np.inf, -np.inf], np.nan).dropna()
        if ratio.empty:
            continue
        ax.plot(
            subset.loc[ratio.index, "agentCount"], ratio,
            label=METHOD_LABELS.get(method, method),
            color=get_method_color(method),
            marker="o", markersize=3,
        )

    ax.set_xscale("log")
    ax.axhline(1.0, ls="--", color="gray", alpha=0.4)
    ax.set_title(sim.capitalize(), fontsize=11, fontweight="bold")
    ax.set_xlabel("Agent Count")
    ax.set_ylabel("P95 / P50 Ratio")

axes[0].legend(fontsize=7, loc="upper left")
fig.suptitle("Tail Latency: P95/P50 Ratio vs Agent Count",
             fontsize=14, fontweight="bold")
plt.tight_layout()
save_figure(fig, "01_tail_latency")
plt.show()

# %% [markdown]
# ## 9. High-agent extension (50k–1M)

# %%
hi_main = best_per_method(hi_df)
hi_sims = sorted(hi_main["suite"].unique())

fig, axes = plt.subplots(1, len(hi_sims), figsize=(6 * len(hi_sims), 5))
if len(hi_sims) == 1:
    axes = [axes]

for ax, sim in zip(axes, hi_sims):
    sim_data = hi_main[hi_main["suite"] == sim]
    for method in METHOD_ORDER:
        subset = sim_data[sim_data["method"] == method].sort_values("agentCount")
        if subset.empty:
            continue
        ax.plot(
            subset["agentCount"], subset["avgComputeTime"],
            label=METHOD_LABELS.get(method, method),
            color=get_method_color(method),
            marker="o",
        )
    ax.set_xlabel("Agent Count")
    ax.set_ylabel("Avg Compute Time (ms)")
    ax.set_title(f"{sim.capitalize()} — High Agent Counts")
    ax.xaxis.set_major_formatter(ticker.FuncFormatter(lambda x, _: f"{x/1000:.0f}k"))

axes[0].legend()
fig.suptitle("High-Agent Scaling (50k–1M)", fontsize=14, fontweight="bold")
plt.tight_layout()
save_figure(fig, "01_high_agent_scaling")
plt.show()

# %% [markdown]
# ## 10. Method comparison table

# %%
print("=== All sims combined — CPU render, best config ===")
print(compare_methods(main_df, "avgComputeTime").round(2))
