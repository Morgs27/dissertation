# ---
# jupyter:
#   jupytext:
#     text_representation:
#       format_name: percent
# ---

# %% [markdown]
# # 05 — Cross-Device: Mobile vs Desktop
#
# **Research question:** How do performance profiles differ between
# Apple M4 Pro MacBook and Google Pixel 9 Pro (Android)?
# Which methods degrade most on mobile?
#
# **Data:** mobile (boids, slime) vs basic-sweeps (boids, slime)
#
# > Run `00_build_dataset.py` first to generate the parquet files.

# %%
import sys, os
sys.path.insert(0, os.path.abspath(".."))

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from src import (
    compare_methods,
    apply_style, get_method_color, save_figure,
    METHOD_ORDER, METHOD_LABELS,
)

apply_style()

# %% [markdown]
# ## 1. Load data

# %%
sweep_df = pd.read_parquet("../processed/basic_sweeps.parquet")
mob_df = pd.read_parquet("../processed/mobile.parquet")

# Normalize suite names — mobile uses display names ("Boids", "Slime Mold")
# while desktop uses folder names ("boids", "slime")
SUITE_NORMALIZE = {
    "Boids": "boids",
    "Slime Mold": "slime",
    "slime_mold": "slime",
}

def normalize_suite(name):
    return SUITE_NORMALIZE.get(name, name.lower().replace(" ", "_"))

sweep_df["suite"] = sweep_df["suite"].map(normalize_suite)
mob_df["suite"] = mob_df["suite"].map(normalize_suite)

print(f"Desktop: {len(sweep_df)} runs | Mobile: {len(mob_df)} runs")
print(f"Desktop sims: {sorted(sweep_df['suite'].unique())}")
print(f"Mobile sims: {sorted(mob_df['suite'].unique())}")

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

sims_to_compare = sorted(set(sweep_df["suite"].unique()) & set(mob_df["suite"].unique()))
print(f"Shared simulations: {sims_to_compare}")

desktop = best_per_method(sweep_df[sweep_df["suite"].isin(sims_to_compare)])
desktop["device"] = "MacBook (M4 Pro)"
mobile = best_per_method(mob_df[mob_df["suite"].isin(sims_to_compare)])
mobile["device"] = "Pixel 9 Pro"
combined = pd.concat([desktop, mobile], ignore_index=True)

# %% [markdown]
# ## 2. Direct scaling comparison — same sim, both devices

# %%
for sim in sims_to_compare:
    fig, axes = plt.subplots(1, 2, figsize=(14, 5))

    for ax, device in zip(axes, ["MacBook (M4 Pro)", "Pixel 9 Pro"]):
        dev_df = combined[(combined["suite"] == sim) & (combined["device"] == device)]

        for method in METHOD_ORDER:
            subset = dev_df[dev_df["method"] == method].sort_values("agentCount")
            if subset.empty:
                continue
            ax.plot(
                subset["agentCount"], subset["avgComputeTime"],
                label=METHOD_LABELS.get(method, method),
                color=get_method_color(method),
                marker="o", markersize=5,
            )

        ax.set_xscale("log")
        ax.set_yscale("log")
        ax.set_xlabel("Agent Count")
        ax.set_ylabel("Avg Compute Time (ms)")
        ax.set_title(device)
        ax.legend(fontsize=8)

    fig.suptitle(f"{sim.capitalize()} — Scaling Comparison", fontsize=14, fontweight="bold")
    plt.tight_layout()
    save_figure(fig, f"05_cross_device_{sim}")
    plt.show()

# %% [markdown]
# ## 3. Performance ratio: Mobile / Desktop

# %%
ratio = desktop.merge(
    mobile,
    on=["suite", "method", "agentCount"],
    suffixes=("_desktop", "_mobile"),
    how="inner",
)
ratio["slowdown_ratio"] = ratio["avgComputeTime_mobile"] / ratio["avgComputeTime_desktop"]

fig, ax = plt.subplots(figsize=(10, 6))

for method in METHOD_ORDER:
    subset = ratio[ratio["method"] == method]
    if subset.empty:
        continue
    avg = subset.groupby("agentCount")["slowdown_ratio"].mean().reset_index()
    ax.plot(
        avg["agentCount"], avg["slowdown_ratio"],
        "o-", label=METHOD_LABELS.get(method, method),
        color=get_method_color(method),
    )

ax.axhline(1.0, ls="--", color="gray", alpha=0.5, label="Parity (1.0×)")
ax.set_xscale("log")
ax.set_xlabel("Agent Count")
ax.set_ylabel("Mobile / Desktop Compute Time Ratio")
ax.set_title("Performance Ratio: Pixel 9 Pro vs MacBook M4 Pro (mean across sims)")
ax.legend()
save_figure(fig, "05_mobile_desktop_ratio")
plt.show()

# %% [markdown]
# ## 4. Which method degrades most on mobile?

# %%
method_avg = ratio.groupby("method")["slowdown_ratio"].agg(["mean", "std"]).reset_index()
method_avg = method_avg.sort_values("mean", ascending=True)

fig, ax = plt.subplots(figsize=(8, 4))
colors = [get_method_color(m) for m in method_avg["method"]]
ax.barh(
    [METHOD_LABELS.get(m, m) for m in method_avg["method"]],
    method_avg["mean"],
    xerr=method_avg["std"],
    color=colors, edgecolor="white", capsize=3,
)
ax.axvline(1.0, ls="--", color="gray", alpha=0.5)
ax.set_xlabel("Mobile / Desktop Slowdown Ratio")
ax.set_title("Which Method Degrades Most on Mobile?")
save_figure(fig, "05_method_degradation")
plt.show()

# %% [markdown]
# ## 5. Render mode comparison: CPU vs GPU render on mobile

# %%
mob_gpu = mob_df[(mob_df["method"] == "WebGPU")].copy()
render_compare = mob_gpu.pivot_table(
    index=["suite", "agentCount"],
    columns="renderMode",
    values="avgComputeTime",
).reset_index()

if "cpu" in render_compare.columns and "gpu" in render_compare.columns:
    render_compare["gpu_speedup"] = render_compare["cpu"] / render_compare["gpu"]

    fig, ax = plt.subplots(figsize=(9, 5))
    for sim in sims_to_compare:
        subset = render_compare[render_compare["suite"] == sim].sort_values("agentCount")
        ax.plot(subset["agentCount"], subset["gpu_speedup"], "o-", label=sim.capitalize())

    ax.axhline(1.0, ls="--", color="gray", alpha=0.5)
    ax.set_xscale("log")
    ax.set_xlabel("Agent Count")
    ax.set_ylabel("GPU Render Speedup over CPU Render")
    ax.set_title("Mobile WebGPU: GPU vs CPU Render Mode")
    ax.legend()
    save_figure(fig, "05_mobile_render_mode")
    plt.show()

# %% [markdown]
# ## 6. Summary table

# %%
print("=== Average Slowdown by Method ===")
print(method_avg.round(2).to_string(index=False))
