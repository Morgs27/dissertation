# ---
# jupyter:
#   jupytext:
#     text_representation:
#       format_name: percent
# ---

# %% [markdown]
# # 02 — Timing Breakdown & WebGPU Bridge Analysis 
#
# **Research question:** Where is time actually spent per method?
# What are the PCIe transfer overheads for WebGPU?
#
# **Data:** basic-sweeps, high-agents
#
# > Run `00_build_dataset.py` first to generate the parquet files.

# %%
import sys, os
sys.path.insert(0, os.path.abspath(".."))

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from src import (
    timing_breakdown,
    apply_style, get_method_color, save_figure,
    METHOD_ORDER, METHOD_LABELS,
)

apply_style()

# %% [markdown]
# ## Load pre-processed data

# %%
sweep_df = pd.read_parquet("../processed/basic_sweeps.parquet")
hi_df = pd.read_parquet("../processed/high_agents.parquet")
print(f"Loaded {len(sweep_df)} sweep runs, {len(hi_df)} high-agent runs")

# %%
def best_per_method(df):
    """Reduce variants to best config per method × sim × agentCount."""
    out = df[df["renderMode"] == "cpu"].copy()
    ww = out[out["method"] == "WebWorkers"]
    if not ww.empty:
        best_ww = ww.loc[ww.groupby(["suite", "agentCount"])["avgComputeTime"].idxmin()]
        out = pd.concat([out[out["method"] != "WebWorkers"], best_ww])
    wa = out[out["method"] == "WebAssembly"]
    if not wa.empty:
        best_wa = wa.loc[wa.groupby(["suite", "agentCount"])["avgComputeTime"].idxmin()]
        out = pd.concat([out[out["method"] != "WebAssembly"], best_wa])
    return out.reset_index(drop=True)

main_df = best_per_method(sweep_df)

# %% [markdown]
# ## Stacked timing breakdown at selected agent counts

# %%
agent_counts = [100, 1000, 5000, 20000]
fig, axes = plt.subplots(1, len(agent_counts), figsize=(18, 5), sharey=False)

timing_labels = {
    "avgSetupTime": "Setup",
    "avgComputeTime": "Compute",
    "avgReadbackTime": "Readback",
    "avgRenderTime": "Render",
}

rep_sim = "boids"
rep_df = main_df[main_df["suite"] == rep_sim]

for ax, n in zip(axes, agent_counts):
    bd = timing_breakdown(rep_df, agent_count=n, render_mode="cpu")
    bd = bd.rename(columns=timing_labels)
    colors = ["#A8D8EA", "#6DA49D", "#EE6677", "#BBBBBB"]
    bd.plot.barh(stacked=True, ax=ax, color=colors, edgecolor="white", linewidth=0.5)
    ax.set_title(f"N = {n:,}", fontweight="bold")
    ax.set_xlabel("Time (ms)")
    ax.set_ylabel("")
    ax.legend(fontsize=8, loc="upper right")

fig.suptitle(f"Timing Breakdown — {rep_sim.capitalize()}",
             fontsize=14, fontweight="bold")
plt.tight_layout()
save_figure(fig, "02_timing_breakdown_boids")
plt.show()

# %% [markdown]
# ## Timing breakdown across all simulations at N=5000

# %%
sweep_sims = sorted(main_df["suite"].unique())

fig, axes = plt.subplots(2, 4, figsize=(18, 9))
axes = axes.flatten()

for ax, sim in zip(axes, sweep_sims):
    sim_df = main_df[main_df["suite"] == sim]
    bd = timing_breakdown(sim_df, agent_count=5000, render_mode="cpu")
    bd = bd.rename(columns=timing_labels)
    colors = ["#A8D8EA", "#6DA49D", "#EE6677", "#BBBBBB"]
    bd.plot.barh(stacked=True, ax=ax, color=colors, edgecolor="white", linewidth=0.5)
    ax.set_title(sim.capitalize(), fontweight="bold")
    ax.set_xlabel("Time (ms)")
    ax.set_ylabel("")
    ax.legend(fontsize=7, loc="upper right")

fig.suptitle("Timing Breakdown at N=5,000 — All Simulations",
             fontsize=14, fontweight="bold")
plt.tight_layout()
save_figure(fig, "02_timing_breakdown_all_sims")
plt.show()



# %%
sweep_sims = sorted(main_df["suite"].unique())

fig, axes = plt.subplots(2, 4, figsize=(18, 9))
axes = axes.flatten()

for ax, sim in zip(axes, sweep_sims):
    sim_df = main_df[main_df["suite"] == sim]
    bd = timing_breakdown(sim_df, agent_count=20000, render_mode="cpu")
    bd = bd.rename(columns=timing_labels)
    colors = ["#A8D8EA", "#6DA49D", "#EE6677", "#BBBBBB"]
    bd.plot.barh(stacked=True, ax=ax, color=colors, edgecolor="white", linewidth=0.5)
    ax.set_title(sim.capitalize(), fontweight="bold")
    ax.set_xlabel("Time (ms)")
    ax.set_ylabel("")
    ax.legend(fontsize=7, loc="upper right")

fig.suptitle("Timing Breakdown at N=20,000 — All Simulations",
             fontsize=14, fontweight="bold")
plt.tight_layout()
save_figure(fig, "02_timing_breakdown_all_sims_20k")
plt.show()

# %%

sweep_sims = sorted(main_df["suite"].unique())

fig, axes = plt.subplots(2, 4, figsize=(18, 9))
axes = axes.flatten()

for ax, sim in zip(axes, sweep_sims):
    sim_df = main_df[main_df["suite"] == sim]
    bd = timing_breakdown(sim_df, agent_count=1, render_mode="cpu")
    bd = bd.rename(columns=timing_labels)
    colors = ["#A8D8EA", "#6DA49D", "#EE6677", "#BBBBBB"]
    bd.plot.barh(stacked=True, ax=ax, color=colors, edgecolor="white", linewidth=0.5)
    ax.set_title(sim.capitalize(), fontweight="bold")
    ax.set_xlabel("Time (ms)")
    ax.set_ylabel("")
    ax.legend(fontsize=7, loc="upper right")

fig.suptitle("Timing Breakdown at N=1 — All Simulations",
             fontsize=14, fontweight="bold")
plt.tight_layout()
save_figure(fig, "02_timing_breakdown_all_sims_1")
plt.show()


# %% [markdown]
# ## WebGPU bridge timing analysis
#
# How does host→GPU and GPU→host transfer time scale with agent count?

# %%
gpu_df = sweep_df[
    (sweep_df["method"] == "WebGPU") &
    (sweep_df["renderMode"] == "cpu")
].copy()

bridge = gpu_df.groupby("agentCount").agg({
    "avgHostToGpuTime": "mean",
    "avgComputeTime": "mean",
    "avgGpuToHostTime": "mean",
    "avgExecutionMs": "mean",
}).reset_index()

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))

ax1.plot(bridge["agentCount"], bridge["avgHostToGpuTime"],
         "o-", label="Host → GPU", color="#4477AA")
ax1.plot(bridge["agentCount"], bridge["avgComputeTime"],
         "D-", label="GPU Compute", color="#228833")
ax1.plot(bridge["agentCount"], bridge["avgGpuToHostTime"],
         "s-", label="GPU → Host", color="#EE6677")
ax1.set_xscale("log")
ax1.set_yscale("log")
ax1.set_xlabel("Agent Count")
ax1.set_ylabel("Time (ms)")
ax1.set_title("WebGPU: Bridge Timing Components")
ax1.legend()

bridge["bridge_pct"] = (
    (bridge["avgHostToGpuTime"].fillna(0) + bridge["avgGpuToHostTime"].fillna(0))
    / bridge["avgExecutionMs"] * 100
)
ax2.plot(bridge["agentCount"], bridge["bridge_pct"], "o-", color="#AA3377")
ax2.set_xscale("log")
ax2.set_xlabel("Agent Count")
ax2.set_ylabel("Bridge Overhead (% of total)")
ax2.set_title("PCIe Transfer as % of Total Frame Time")
ax2.axhline(50, ls="--", color="gray", alpha=0.5, label="50%")
ax2.legend()

fig.suptitle("WebGPU Bridge Analysis (averaged across 8 simulations)",
             fontsize=14, fontweight="bold")
plt.tight_layout()
save_figure(fig, "02_webgpu_bridge")
plt.show()

# %% [markdown]
# ## 5. Memory footprint comparison

# %%
mem_df = main_df[main_df["avgMemoryBytes"].notna()].copy()
mem_df["memoryMB"] = mem_df["avgMemoryBytes"] / (1024 * 1024)

fig, ax = plt.subplots(figsize=(9, 5))
for method in METHOD_ORDER:
    subset = mem_df[mem_df["method"] == method]
    if subset.empty:
        continue
    avg = subset.groupby("agentCount")["memoryMB"].mean().reset_index()
    ax.plot(avg["agentCount"], avg["memoryMB"],
            label=METHOD_LABELS.get(method, method),
            color=get_method_color(method), marker="o")

ax.set_xscale("log")
ax.set_xlabel("Agent Count")
ax.set_ylabel("Memory Footprint (MB)")
ax.set_title("Method Memory Footprint vs Agent Count")
ax.legend()
save_figure(fig, "02_memory_footprint")
plt.show()

# %% [markdown]
# ### JS Heap Growth (if available)

# %%
if "rsJsHeap_avgBytes" in main_df.columns:
    heap_df = main_df[main_df["rsJsHeap_avgBytes"].notna()].copy()
    heap_df["heapMB"] = heap_df["rsJsHeap_avgBytes"] / (1024 * 1024)

    fig, ax = plt.subplots(figsize=(9, 5))
    for method in METHOD_ORDER:
        subset = heap_df[heap_df["method"] == method]
        if subset.empty:
            continue
        avg = subset.groupby("agentCount")["heapMB"].mean().reset_index()
        ax.plot(avg["agentCount"], avg["heapMB"],
                label=METHOD_LABELS.get(method, method),
                color=get_method_color(method), marker="o")

    ax.set_xscale("log")
    ax.set_xlabel("Agent Count")
    ax.set_ylabel("JS Heap Used (MB)")
    ax.set_title("JS Heap Usage vs Agent Count")
    ax.legend()
    save_figure(fig, "02_js_heap_footprint")
    plt.show()
