# ---
# jupyter:
#   jupytext:
#     text_representation:
#       format_name: percent
# ---

# %% [markdown]
# # 04 — WASM SIMD vs Scalar
#
# **Research question:** Does WASM SIMD provide measurable speedup over scalar?
# Which simulations benefit most?
#
# **Data:** basic-sweeps (all 8 sims have `wasmExecutionMode` = `scalar` / `simd`)
#
# > Run `00_build_dataset.py` first to generate the parquet files.

# %%
import sys, os
sys.path.insert(0, os.path.abspath(".."))

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from src import apply_style, save_figure

apply_style()

# %% [markdown]
# ## 1. Load WASM data

# %%
sweep_df = pd.read_parquet("../processed/basic_sweeps.parquet")

wasm_df = sweep_df[
    (sweep_df["method"] == "WebAssembly") &
    (sweep_df["renderMode"] == "cpu") &
    (sweep_df["wasmExecutionMode"].notna())
].copy()

print(f"WASM runs: {len(wasm_df)}")
print(f"Execution modes: {wasm_df['wasmExecutionMode'].unique()}")

# %% [markdown]
# ## 2. SIMD speedup ratio per simulation

# %%
# Filter out near-zero compute times where SIMD speedup is meaningless noise
MIN_COMPUTE_MS = 0.1
scalar = wasm_df[
    (wasm_df["wasmExecutionMode"] == "scalar") &
    (wasm_df["avgComputeTime"] > MIN_COMPUTE_MS)
].set_index(["suite", "agentCount"])
simd = wasm_df[
    (wasm_df["wasmExecutionMode"] == "simd") &
    (wasm_df["avgComputeTime"] > MIN_COMPUTE_MS)
].set_index(["suite", "agentCount"])

speedup = (scalar["avgComputeTime"] / simd["avgComputeTime"]).rename("simd_speedup").reset_index()
speedup = speedup.dropna()

# %% [markdown]
# ## 3. SIMD speedup curves by simulation

# %%
sweep_sims = sorted(speedup["suite"].unique())

fig, ax = plt.subplots(figsize=(10, 6))

cmap = plt.cm.Set2(np.linspace(0, 1, len(sweep_sims)))
for color, sim in zip(cmap, sweep_sims):
    subset = speedup[speedup["suite"] == sim].sort_values("agentCount")
    if subset.empty:
        continue
    ax.plot(
        subset["agentCount"], subset["simd_speedup"],
        "o-", color=color, label=sim.capitalize(), markersize=5,
    )

ax.axhline(1.0, ls="--", color="gray", alpha=0.5, label="No speedup (1.0×)")
ax.set_xscale("log")
ax.set_xlabel("Agent Count")
ax.set_ylabel("SIMD Speedup (scalar / simd)")
ax.set_title("WASM SIMD vs Scalar: Compute Time Speedup by Simulation")
ax.legend(fontsize=8, ncol=2)
save_figure(fig, "04_simd_speedup_per_sim")
plt.show()

# %% [markdown]
# ## 4. Average SIMD speedup across all simulations

# %%
avg_speedup = speedup.groupby("agentCount")["simd_speedup"].agg(["mean", "std"]).reset_index()

fig, ax = plt.subplots(figsize=(9, 5))
ax.plot(avg_speedup["agentCount"], avg_speedup["mean"], "o-", color="#228833", markersize=7)
ax.fill_between(
    avg_speedup["agentCount"],
    avg_speedup["mean"] - avg_speedup["std"],
    avg_speedup["mean"] + avg_speedup["std"],
    alpha=0.2, color="#228833",
)
ax.axhline(1.0, ls="--", color="gray", alpha=0.5)
ax.set_xscale("log")
ax.set_xlabel("Agent Count")
ax.set_ylabel("SIMD Speedup (×)")
ax.set_title("WASM SIMD Compute Speedup — Averaged Across 8 Simulations (mean ± 1σ)")
save_figure(fig, "04_simd_speedup_avg")
plt.show()

# %% [markdown]
# ## 5. Which simulations benefit most from SIMD?

# %%
sim_avg = speedup.groupby("suite")["simd_speedup"].agg(["mean", "std"]).reset_index()
sim_avg = sim_avg.sort_values("mean", ascending=True)

fig, ax = plt.subplots(figsize=(9, 5))
colors = ["#228833" if m > 1.0 else "#EE6677" for m in sim_avg["mean"]]
ax.barh(sim_avg["suite"].str.capitalize(), sim_avg["mean"], xerr=sim_avg["std"],
        color=colors, edgecolor="white", capsize=3)
ax.axvline(1.0, ls="--", color="gray", alpha=0.5)
ax.set_xlabel("Average SIMD Speedup (×)")
ax.set_title("Per-Simulation SIMD Benefit (averaged over all agent counts)")
save_figure(fig, "04_simd_benefit_by_sim")
plt.show()

# %% [markdown]
# ## 6. Timing component comparison: SIMD vs Scalar

# %%
timing_cols = ["avgSetupTime", "avgComputeTime", "avgReadbackTime", "avgRenderTime"]
present = [c for c in timing_cols if c in wasm_df.columns]

for n in [5000, 10000, 20000]:
    fig, ax = plt.subplots(figsize=(8, 4))
    for mode in ["scalar", "simd"]:
        subset = wasm_df[(wasm_df["wasmExecutionMode"] == mode) & (wasm_df["agentCount"] == n)]
        means = subset[present].mean()
        pos = np.arange(len(present))
        offset = -0.2 if mode == "scalar" else 0.2
        color = "#EE6677" if mode == "scalar" else "#228833"
        ax.bar(pos + offset, means, width=0.35, label=mode.capitalize(),
               color=color, edgecolor="white")

    ax.set_xticks(range(len(present)))
    ax.set_xticklabels([c.replace("avg", "").replace("Time", "") for c in present])
    ax.set_ylabel("Time (ms)")
    ax.set_title(f"WASM Timing Components — N={n:,} (mean across sims)")
    ax.legend()
    save_figure(fig, f"04_simd_timing_{n}")
    plt.show()

# %% [markdown]
# ## 7. Summary table

# %%
print("=== SIMD Speedup Summary ===")
summary = speedup.pivot_table(
    index="suite", columns="agentCount", values="simd_speedup"
).round(3)
print(summary.to_string())
