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
    compare_methods, scaling_summary, crossover_point, interpolated_crossover_point,
    apply_style, get_method_color, save_figure,
    METHOD_ORDER, METHOD_LABELS,
)

apply_style()

# %% [markdown]
# ## Load pre-processed data

# %%
sweep_df = pd.read_parquet("../processed/basic_sweeps.parquet")
hi_df = pd.read_parquet("../processed/high_agents.parquet")

# Clamp sub-timer-resolution zeros to 1 microsecond to prevent omission on log-log plots
for df in [sweep_df, hi_df]:
    for col in ["avgComputeTime", "frameTime_min", "frameTime_p50", "frameTime_p95", "frameTime_max"]:
        if col in df.columns:
            df[col] = df[col].clip(lower=0.001)

print(f"Basic sweeps: {len(sweep_df)} runs | High agents: {len(hi_df)} runs")

# %% [markdown]
# ## Prepare main comparison DataFrame
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
# ## Mean compute time — all 8 simulations
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
fig.suptitle("Mean Compute Time vs Agent Count (Across all simulations)",
             fontsize=14, fontweight="bold")
plt.tight_layout()
save_figure(fig, "01_scaling_mean")
plt.show()

# %% [markdown]
# ## Min / Max / Percentile compute spread
#
# The summary-level `frameTime_*` stats capture total frame time.
# Here we show min, p50, p95, and max to visualise the spread
# of per-frame performance at each agent count for a representative simulation.

# %%
sim = "boids"
sim_df = main_df[main_df["suite"] == sim]

fig, axes = plt.subplots(1, 4, figsize=(18, 4.5), sharex=False, sharey=True)
axes = axes.flatten()

for ax, method in zip(axes, METHOD_ORDER):
    subset = sim_df[sim_df["method"] == method].sort_values("agentCount")
    if subset.empty:
        continue
    c = get_method_color(method)

    # p5–p95 band
    if "frameTime_min" in subset.columns and "frameTime_p95" in subset.columns:
        ax.fill_between(
            subset["agentCount"],
            subset["frameTime_min"],
            subset["frameTime_p95"],
            alpha=0.2, color=c, label="Min - P95"
        )
        
    # Median line
    ax.plot(
        subset["agentCount"], subset["frameTime_p50"],
        label="Median (P50)",
        color=c, marker="o", markersize=4, linewidth=2,
    )

    # Max as scatter
    if "frameTime_max" in subset.columns:
        ax.scatter(
            subset["agentCount"], subset["frameTime_max"],
            marker="^", color=c, s=25, alpha=0.7, zorder=5, label="Max"
        )

    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_title(METHOD_LABELS.get(method, method), fontsize=12, fontweight="bold")
    ax.set_xlabel("Agent Count")
    
axes[0].set_ylabel("Frame Time (ms)")
axes[0].legend(fontsize=9, loc="upper left")
fig.suptitle(f"Frame Time Spread per Method: {sim.capitalize()} (CPU Render)",
             fontsize=14, fontweight="bold", y=1.05)
plt.tight_layout()
save_figure(fig, "01_scaling_spread")
plt.show()

# %% [markdown]
# ## Crossover point analysis (Exact Interpolated)
#
# At what interpolated agent count does WebGPU become faster than other methods?
# We compare WebGPU against JavaScript, WebWorkers, and WebAssembly.

# %%
crossovers = []
compare_methods_list = [m for m in METHOD_ORDER if m != "WebGPU"]

for sim in sweep_sims:
    sim_df = main_df[main_df["suite"] == sim]
    crossover_data = {"simulation": sim}
    
    for method in compare_methods_list:
        xp = interpolated_crossover_point(sim_df, method, "WebGPU", metric="avgComputeTime")
        crossover_data[f"WebGPU vs {METHOD_LABELS.get(method, method)}"] = xp
        
    crossovers.append(crossover_data)

xp_df = pd.DataFrame(crossovers).set_index("simulation")

fig, ax = plt.subplots(figsize=(10, 6))

# Plot a grouped bar chart
methods_to_plot = [col for col in xp_df.columns if "WebGPU vs" in col]
x = np.arange(len(xp_df.index))
width = 0.8 / len(methods_to_plot)

for i, col in enumerate(methods_to_plot):
    # Extract the target method for color
    target_method = None
    for m in METHOD_ORDER:
        if METHOD_LABELS.get(m, m) in col:
            target_method = m
            break
    color = get_method_color(target_method) if target_method else "gray"
    
    values = xp_df[col].fillna(0)  # Use 0 for missing (no crossover)
    bars = ax.bar(x + i*width - width*(len(methods_to_plot)-1)/2, values, 
                  width, label=col, color=color, alpha=0.9)
    
    # Add labels
    for bar in bars:
        h = bar.get_height()
        if h > 0:
            ax.text(bar.get_x() + bar.get_width()/2., h * 1.05,
                    f'{int(h):,}', ha='center', va='bottom', 
                    rotation=0, fontsize=8, fontweight="bold")

ax.set_ylabel("Agent Count (Exact Crossover Point)")
ax.set_title("WebGPU Crossover Point vs All Methods", fontweight="bold")
ax.set_xticks(x)
ax.set_xticklabels([s.capitalize() for s in xp_df.index], rotation=45, ha='right')
ax.set_yscale("log")
ax.grid(axis='y', linestyle='--', alpha=0.4)
ax.legend(fontsize=9, loc="upper right")
# Extend y limits slightly to make room for text
ax.set_ylim(bottom=1, top=xp_df.max().max() * 5)

plt.tight_layout()
save_figure(fig, "01_crossover_points")
plt.show()

# %% [markdown]
# ## P95/P50 ratio — tail latency consistency
#
# A boxplot showing the distribution of P95/P50 ratios across all basic sweeps
# for each method. A ratio closer to 1.0 means highly consistent frame times,
# whereas a higher ratio indicates significant jitter and outliers.

# %%
ratio_data = []

for method in METHOD_ORDER:
    method_ratios = []
    for sim in sweep_sims:
        sim_df = main_df[main_df["suite"] == sim]
        subset = sim_df[sim_df["method"] == method]
        if subset.empty or "frameTime_p95" not in subset.columns:
            continue
        ratio = subset["frameTime_p95"] / subset["frameTime_p50"]
        ratio = ratio.replace([np.inf, -np.inf], np.nan).dropna()
        method_ratios.extend(ratio.values)
    
    if method_ratios:
        ratio_data.append(pd.DataFrame({"Method": METHOD_LABELS.get(method, method), "Ratio": method_ratios}))

if ratio_data:
    jitter_df = pd.concat(ratio_data)
    
    fig, ax = plt.subplots(figsize=(8, 6))
    
    labels = []
    methods_present = []
    for m in METHOD_ORDER:
        lbl = METHOD_LABELS.get(m, m)
        if lbl in jitter_df["Method"].values:
            labels.append(lbl)
            methods_present.append(m)
            
    data_to_plot = [jitter_df[jitter_df["Method"] == label]["Ratio"] for label in labels]
    
    bplot = ax.boxplot(data_to_plot, patch_artist=True, tick_labels=labels)
    
    for patch, method in zip(bplot['boxes'], methods_present):
        patch.set_facecolor(get_method_color(method))
        patch.set_alpha(0.7)
        
    ax.axhline(1.0, ls="--", color="gray", alpha=0.6)
    ax.set_ylabel("P95 / P50 Ratio")
    ax.set_title("Frame Time Consistency (Jitter) by Method", fontweight="bold")
    
    # Set a log Y scale
    ax.set_yscale("log")
    
    plt.tight_layout()
    save_figure(fig, "01_tail_latency")
    plt.show()
else:
    print("No P95/P50 data available for boxplot.")

# %% [markdown]
# ## High-agent extension (50k–1M)

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

    ax.set_yscale("log")

    def format_km(x, pos):
        if x >= 1e6:
            return f'{x*1e-6:.0f}M'
        elif x >= 1e3:
            return f'{x*1e-3:.0f}k'
        else:
            return f'{x:.0f}'

    ax.xaxis.set_major_formatter(ticker.FuncFormatter(format_km))
    ax.legend(loc="lower right", bbox_to_anchor=(1, 0.2))

fig.suptitle("High-Agent Scaling (50k–1M)", fontsize=14, fontweight="bold")
plt.tight_layout()
save_figure(fig, "01_high_agent_scaling")
plt.show()

# %% [markdown]
# ## 8. Continuous High-Agent Scaling (Overlapping Sims)
#
# Combining basic sweeps and high-agent datasets to produce continuous unbroken
# graphs from very small scales (1 agent) out to massive scales (1M agents)
# for all simulations present in both sets.

# %%
overlapping_sims = [sim for sim in sweep_sims if sim in hi_sims]

if overlapping_sims:
    for sim in overlapping_sims:
        sim_base = main_df[main_df["suite"] == sim].copy()
        sim_hi = hi_main[hi_main["suite"] == sim].copy()
        
        # Combine the data
        sim_continuous = pd.concat([sim_base, sim_hi], ignore_index=True)
        
        fig, ax = plt.subplots(figsize=(10, 6))
        for method in METHOD_ORDER:
            subset = sim_continuous[sim_continuous["method"] == method].sort_values("agentCount")
            if subset.empty:
                continue
            ax.plot(
                subset["agentCount"], subset["avgComputeTime"],
                label=METHOD_LABELS.get(method, method),
                color=get_method_color(method),
                marker="o", linewidth=2.5, markersize=5
            )
            
        ax.set_xscale("log")
        ax.set_yscale("log")
        ax.set_title(f"Continuous Compute Time: {sim.capitalize()} Simulation (1 to 1M Agents)", fontsize=14, fontweight="bold")
        ax.set_xlabel("Agent Count")
        ax.set_ylabel("Avg Compute Time (ms)")
        
        def format_km(x, pos):
            if x >= 1e6:
                return f'{x*1e-6:.0f}M'
            elif x >= 1e3:
                return f'{x*1e-3:.0f}k'
            else:
                return f'{x:.0f}'

        ax.xaxis.set_major_formatter(ticker.FuncFormatter(format_km))
        ax.legend(fontsize=10, loc="upper left")
        
        # Add a subtle vertical line where the dataset switches
        max_base = sim_base["agentCount"].max()
        if pd.notna(max_base):
            ax.axvline(max_base, color="gray", linestyle=":", alpha=0.5, zorder=0)

        plt.tight_layout()
        save_figure(fig, f"01_continuous_{sim}")
        plt.show()
else:
    print("No simulations found in both datasets for continuous high-agent scaling.")


# %% [markdown]
# ## Method comparison table

# %%
print("=== All sims combined — CPU render, best config ===")
print(compare_methods(main_df, "avgComputeTime").round(2))
