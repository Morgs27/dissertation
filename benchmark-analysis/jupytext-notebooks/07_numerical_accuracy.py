# ---
# jupyter:
#   jupytext:
#     text_representation:
#       format_name: percent
# ---

# %% [markdown]
# # 07 — Numerical Accuracy (Trig Tests)
#
# **Research question:** Do JavaScript and WebGPU produce the same agent positions?
# How does floating-point divergence grow over 1000 frames? Is it consistent
# across devices?
#
# **Data:** trig (3 devices × 2 methods × 100 agents × 1000 frames, with agent positions)

# %%
import sys, os
sys.path.insert(0, os.path.abspath(".."))

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from src import (
    load_raw, positional_divergence,
    apply_style, get_method_color, save_figure,
)
from src.data_loader import agent_states_to_dataframe

apply_style()

# %% [markdown]
# ## 1. Load trig test data
#
# The trig files are ~24 MB each, so `load_raw` is fine here.
# We need agent positions, which requires the full JSON.

# %%
from pathlib import Path

devices = {
    "macbook": "MacBook (M4 Pro)",
    "chromebook": "Chromebook",
    "mobile": "Pixel 9 Pro",
}

trig_data = {}
for folder, label in devices.items():
    path = next(Path(f"../raw-data/trig/{folder}").rglob("*.json"))
    print(f"Loading {label}: {path.name}")
    suite = load_raw(path)
    trig_data[label] = suite

# %% [markdown]
# ## 2. Extract agent positions for JS and WebGPU from each device

# %%
agent_dfs = {}
for label, suite in trig_data.items():
    for method in ["JavaScript", "WebGPU"]:
        try:
            adf = agent_states_to_dataframe(suite, method, "cpu", 100)
            agent_dfs[(label, method)] = adf
            print(f"  {label} × {method}: {len(adf)} agent-frame records")
        except ValueError as e:
            print(f"  {label} × {method}: {e}")

# %% [markdown]
# ## 3. Per-frame positional divergence: JS vs WebGPU per device

# %%
divergence_by_device = {}
for label in devices.values():
    key_js = (label, "JavaScript")
    key_gpu = (label, "WebGPU")
    if key_js not in agent_dfs or key_gpu not in agent_dfs:
        print(f"Skipping {label} — missing method data")
        continue

    merged, per_frame = positional_divergence(agent_dfs[key_js], agent_dfs[key_gpu])
    divergence_by_device[label] = (merged, per_frame)
    print(f"{label}: {len(per_frame)} frames compared")

# %% [markdown]
# ## 4. Divergence growth over time

# %%
fig, ax = plt.subplots(figsize=(10, 6))

colors = plt.cm.Set1(np.linspace(0, 0.6, len(divergence_by_device)))
for (label, (merged, per_frame)), color in zip(divergence_by_device.items(), colors):
    ax.plot(
        per_frame.index, per_frame["mean_distance"],
        label=f"{label} (mean)", color=color, alpha=0.8,
    )
    ax.plot(
        per_frame.index, per_frame["max_distance"],
        label=f"{label} (max)", color=color, alpha=0.4, linestyle="--",
    )

ax.set_xlabel("Frame Number")
ax.set_ylabel("Position Divergence (pixels)")
ax.set_title("JS vs WebGPU: Agent Position Divergence Over 1000 Frames")
ax.legend(fontsize=8)
save_figure(fig, "07_divergence_over_time")
plt.show()

# %% [markdown]
# ## 5. Distribution of per-agent divergence at selected frames

# %%
sample_frames = [0, 100, 500, 999]

fig, axes = plt.subplots(1, len(sample_frames), figsize=(16, 4), sharey=True)

# Use first device with data
first_label = list(divergence_by_device.keys())[0]
merged_df, _ = divergence_by_device[first_label]

for ax, fn in zip(axes, sample_frames):
    frame_data = merged_df[merged_df["frameNumber"] == fn]
    if frame_data.empty:
        ax.set_title(f"Frame {fn}\n(no data)")
        continue
    ax.hist(frame_data["distance"], bins=20, color="#6DA49D", edgecolor="white", alpha=0.8)
    ax.set_xlabel("Distance (px)")
    ax.set_title(f"Frame {fn}\nμ={frame_data['distance'].mean():.4f}")

axes[0].set_ylabel("Agent Count")
fig.suptitle(f"Agent-Level Divergence Distribution — {first_label}",
             fontsize=13, fontweight="bold")
plt.tight_layout()
save_figure(fig, "07_divergence_distribution")
plt.show()

# %% [markdown]
# ## 6. Cross-device divergence comparison

# %%
comparison = []
for label, (merged, per_frame) in divergence_by_device.items():
    comparison.append({
        "device": label,
        "mean_divergence": per_frame["mean_distance"].mean(),
        "max_divergence": per_frame["max_distance"].max(),
        "final_frame_mean": per_frame.iloc[-1]["mean_distance"] if len(per_frame) > 0 else np.nan,
        "divergence_growth_rate": (
            (per_frame.iloc[-1]["mean_distance"] - per_frame.iloc[0]["mean_distance"])
            / len(per_frame)
        ) if len(per_frame) > 1 else np.nan,
    })

comp_df = pd.DataFrame(comparison)
print("=== Cross-Device Divergence Summary ===")
print(comp_df.to_string(index=False))

# %%
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(12, 5))

# Mean divergence
ax1.bar(comp_df["device"], comp_df["mean_divergence"],
        color=["#4477AA", "#228833", "#EE6677"][:len(comp_df)], edgecolor="white")
ax1.set_ylabel("Mean Divergence (px)")
ax1.set_title("Average Position Divergence by Device")

# Growth rate
ax2.bar(comp_df["device"], comp_df["divergence_growth_rate"] * 1000,  # per 1000 frames
        color=["#4477AA", "#228833", "#EE6677"][:len(comp_df)], edgecolor="white")
ax2.set_ylabel("Divergence Growth (px / 1000 frames)")
ax2.set_title("Divergence Growth Rate by Device")

fig.suptitle("JS vs WebGPU Numerical Accuracy Across Devices",
             fontsize=14, fontweight="bold")
plt.tight_layout()
save_figure(fig, "07_cross_device_divergence")
plt.show()

# %% [markdown]
# ## 7. Final-frame agent position overlay

# %%
fig, axes = plt.subplots(1, len(divergence_by_device), figsize=(6 * len(divergence_by_device), 5))
if len(divergence_by_device) == 1:
    axes = [axes]

for ax, (label, (merged, _)) in zip(axes, divergence_by_device.items()):
    last_frame = merged["frameNumber"].max()
    final = merged[merged["frameNumber"] == last_frame]

    ax.scatter(final["x_a"], final["y_a"], s=15, alpha=0.6,
               color=get_method_color("JavaScript"), label="JavaScript", marker="o")
    ax.scatter(final["x_b"], final["y_b"], s=15, alpha=0.6,
               color=get_method_color("WebGPU"), label="WebGPU", marker="x")
    ax.set_xlabel("X")
    ax.set_ylabel("Y")
    ax.set_title(f"{label} — Final Frame Positions")
    ax.legend(fontsize=8)
    ax.set_aspect("equal")

fig.suptitle("Agent Positions at Frame 999 — JS vs WebGPU",
             fontsize=14, fontweight="bold")
plt.tight_layout()
save_figure(fig, "07_final_positions_overlay")
plt.show()
