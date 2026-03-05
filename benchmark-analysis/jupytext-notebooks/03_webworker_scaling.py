# ---
# jupyter:
#   jupytext:
#     text_representation:
#       format_name: percent
# ---

# %% [markdown]
# # 03 — Web Worker Parallelism
#
# **Research question:** How does the number of Web Workers affect performance?
# Does it follow Amdahl's Law? What is the optimal worker count?
#
# **Data:** basic-sweeps (all 8 sims, worker counts 1 / 2 / 4 / 8 / 14)
#
# > Run `00_build_dataset.py` first to generate the parquet files.

# %%
import sys, os
sys.path.insert(0, os.path.abspath(".."))

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from src import (
    speedup_vs_baseline,
    apply_style, get_method_color, save_figure,
    METHOD_LABELS,
)

apply_style()

# %% [markdown]
# ## 1. Load WebWorkers data

# %%
sweep_df = pd.read_parquet("../processed/basic_sweeps.parquet")

ww_df = sweep_df[
    (sweep_df["method"] == "WebWorkers") &
    (sweep_df["renderMode"] == "cpu") &
    (sweep_df["workerCount"].notna())
].copy()
ww_df["workerCount"] = ww_df["workerCount"].astype(int)

print(f"WebWorkers runs: {len(ww_df)}")
print(f"Worker counts: {sorted(ww_df['workerCount'].unique())}")
print(f"Agent counts: {sorted(ww_df['agentCount'].unique())}")

# %% [markdown]
# ## 2. Speedup vs 1-worker baseline

# %%
ww_speedup = speedup_vs_baseline(
    ww_df,
    baseline_col="workerCount",
    baseline_val=1,
    group_cols=["suite", "agentCount"],
    metric="avgComputeTime",
)

# %% [markdown]
# ## 3. Speedup curves by agent count (averaged across simulations)

# %%
fig, ax = plt.subplots(figsize=(9, 6))

agent_counts_to_plot = [500, 1000, 2000, 5000, 10000, 20000]
cmap = plt.cm.viridis(np.linspace(0.15, 0.85, len(agent_counts_to_plot)))

for color, n in zip(cmap, agent_counts_to_plot):
    subset = ww_speedup[ww_speedup["agentCount"] == n]
    avg = subset.groupby("workerCount")["speedup"].agg(["mean", "std"]).reset_index()
    ax.plot(avg["workerCount"], avg["mean"], "o-", color=color, label=f"N={n:,}")
    ax.fill_between(
        avg["workerCount"],
        avg["mean"] - avg["std"],
        avg["mean"] + avg["std"],
        alpha=0.1, color=color,
    )

workers = sorted(ww_df["workerCount"].unique())
ax.plot(workers, workers, "k--", alpha=0.3, label="Ideal (linear)")

ax.set_xlabel("Number of Web Workers")
ax.set_ylabel("Speedup (× single-worker)")
ax.set_title("Web Worker Speedup vs Worker Count (mean ± 1σ across 8 sims)")
ax.legend(ncol=2, fontsize=9)
ax.set_xticks(workers)
save_figure(fig, "03_webworker_speedup")
plt.show()

# %% [markdown]
# ## 4. Amdahl's Law fit
#
# Amdahl's Law: S(p) = 1 / ((1 - f) + f/p)
# where f = parallel fraction, p = number of workers.

# %%
from scipy.optimize import curve_fit

def amdahl(p, f):
    """Amdahl's law speedup."""
    return 1.0 / ((1.0 - f) + f / p)

fig, ax = plt.subplots(figsize=(9, 6))

f_estimates = []
for color, n in zip(cmap, agent_counts_to_plot):
    subset = ww_speedup[ww_speedup["agentCount"] == n]
    avg = subset.groupby("workerCount")["speedup"].mean().reset_index()

    try:
        popt, _ = curve_fit(amdahl, avg["workerCount"], avg["speedup"], p0=[0.8], bounds=(0, 1))
        f_val = popt[0]
    except Exception:
        f_val = np.nan

    f_estimates.append({"agentCount": n, "parallel_fraction": f_val})

    ax.plot(avg["workerCount"], avg["speedup"], "o", color=color, markersize=6)
    if not np.isnan(f_val):
        p_range = np.linspace(1, 14, 50)
        ax.plot(p_range, amdahl(p_range, f_val), "-", color=color,
                label=f"N={n:,} (f={f_val:.2f})")

ax.plot(workers, workers, "k--", alpha=0.3, label="Ideal")
ax.set_xlabel("Number of Web Workers")
ax.set_ylabel("Speedup")
ax.set_title("Amdahl's Law Fit: Parallel Fraction by Agent Count")
ax.legend(fontsize=8, ncol=2)
ax.set_xticks(workers)
save_figure(fig, "03_amdahls_law_fit")
plt.show()

f_df = pd.DataFrame(f_estimates)
print("\nEstimated parallel fraction (f) by agent count:")
print(f_df.to_string(index=False))

# %% [markdown]
# ## 5. Optimal worker count heatmap

# %%
optimal = (
    ww_df
    .loc[ww_df.groupby(["suite", "agentCount"])["avgComputeTime"].idxmin()]
    [["suite", "agentCount", "workerCount", "avgComputeTime"]]
)

pivot = optimal.pivot_table(
    index="suite", columns="agentCount", values="workerCount", aggfunc="first"
)

fig, ax = plt.subplots(figsize=(12, 5), constrained_layout=True)
im = ax.imshow(pivot.values, aspect="auto", cmap="YlGnBu")
ax.set_xticks(range(len(pivot.columns)))
ax.set_xticklabels([f"{c:,}" for c in pivot.columns], rotation=45, ha="right")
ax.set_yticks(range(len(pivot.index)))
ax.set_yticklabels(pivot.index)
ax.set_xlabel("Agent Count")
ax.set_title("Optimal Worker Count per Simulation")

for i in range(len(pivot.index)):
    for j in range(len(pivot.columns)):
        val = pivot.values[i, j]
        if not np.isnan(val):
            ax.text(j, i, f"{int(val)}", ha="center", va="center",
                    fontsize=9, fontweight="bold",
                    color="white" if val > 6 else "black")

plt.colorbar(im, ax=ax, label="Workers")
save_figure(fig, "03_optimal_workers_heatmap")
plt.show()

# %% [markdown]
# ## 6. Serialization overhead

# %%
fig, ax = plt.subplots(figsize=(9, 5))

for wc in sorted(ww_df["workerCount"].unique()):
    subset = ww_df[ww_df["workerCount"] == wc]
    avg = subset.groupby("agentCount")["avgSetupTime"].mean().reset_index()
    ax.plot(avg["agentCount"], avg["avgSetupTime"], "o-", label=f"{int(wc)} workers")

ax.set_xscale("log")
ax.set_xlabel("Agent Count")
ax.set_ylabel("Avg Setup Time (ms)")
ax.set_title("WebWorkers: Setup/Serialization Overhead vs Agent Count")
ax.legend()
save_figure(fig, "03_webworker_serialization")
plt.show()
