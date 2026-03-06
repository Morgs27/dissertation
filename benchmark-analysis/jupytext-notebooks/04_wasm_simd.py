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
# ## 3. SIMD speedup summary per simulation
#
# How does the SIMD speedup vary across simulations at different scales?

# %%
# Select representative agent counts
selected_ac = [ac for ac in [1000, 5000, 20000] if ac in speedup["agentCount"].unique()]
if not selected_ac:
    selected_ac = speedup["agentCount"].unique()[:3]

fig, ax = plt.subplots(figsize=(12, 6))

pivot = speedup[speedup["agentCount"].isin(selected_ac)].pivot(
    index="suite", columns="agentCount", values="simd_speedup"
).fillna(0)

# Plot grouped bar chart
x = np.arange(len(pivot.index))
width = 0.8 / len(selected_ac)
cmap = plt.cm.viridis(np.linspace(0.15, 0.85, len(selected_ac)))

for i, (ac, color) in enumerate(zip(selected_ac, cmap)):
    values = pivot[ac]
    bars = ax.bar(x + i*width - width*(len(selected_ac)-1)/2, values, 
                  width, label=f"N={ac:,}", color=color, edgecolor="white")
    
    # Add values on top of bars
    for bar in bars:
        h = bar.get_height()
        if h > 0:
            ax.text(bar.get_x() + bar.get_width()/2., h + 0.05,
                    f'{h:.2f}×', ha='center', va='bottom', 
                    rotation=90, fontsize=8)

ax.axhline(1.0, ls="--", color="gray", alpha=0.5, label="No speedup (1.0×)")
ax.set_ylabel("SIMD Speedup (scalar / simd)")
ax.set_title("WASM SIMD Speedup per Simulation at Selected Agent Counts", fontweight="bold")
ax.set_xticks(x)
ax.set_xticklabels([s.capitalize() for s in pivot.index], rotation=0)
ax.legend(fontsize=9, loc="upper right")

# Make room for text labels
ax.set_ylim(bottom=0, top=pivot.max().max() * 1.25)

plt.tight_layout()
save_figure(fig, "04_simd_speedup_summary")
plt.show()

# %% [markdown]
# ## 4. Summary table

# %%
print("=== SIMD Speedup Summary ===")
summary = speedup.pivot_table(
    index="suite", columns="agentCount", values="simd_speedup"
).round(3)
print(summary.to_string())
