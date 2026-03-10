# ---
# jupyter:
#   jupytext:
#     text_representation:
#       format_name: percent
# ---

# %% [markdown]
# # 08 — Error Analysis: CPU vs GPU Positional Divergence
#
# **Research question:** How do floating-point differences between
# JavaScript (CPU) and WebGPU (GPU) affect agent positions across
# simulations?  Agents start in identical positions, but differences in
# trig functions and float precision cause trajectories to diverge.
#
# **Data sources:**
# * `processed/agent_positions_{sim}.parquet` — 8 basic-sweep sims
#   (100 agents × 100 frames × 2 methods)
# * `raw-data/trig/` — 4 devices × 2 methods × 100 agents × 1000 frames

# %%
import sys, os
sys.path.insert(0, os.path.abspath(".."))

import matplotlib.pyplot as plt
import matplotlib.ticker as mticker
import numpy as np
import pandas as pd
from pathlib import Path

from src import (
    load_raw, positional_divergence,
    apply_style, get_method_color, save_figure,
    METHOD_LABELS,
)
from src.data_loader import agent_states_to_dataframe

apply_style()

SWEEP_SIMS = ["boids", "cosmic", "fire", "fluid", "predator", "rain", "slime", "traffic"]
SIM_COLORS = dict(zip(SWEEP_SIMS, plt.cm.Set2(np.linspace(0, 1, len(SWEEP_SIMS)))))

# %% [markdown]
# ---
# ## 1. Load data

# %% [markdown]
# ### 1a. Basic-sweep agent positions (from parquet)

# %%
sweep_positions = {}
sweep_divergence = {}

for sim in SWEEP_SIMS:
    path = Path(f"../processed/agent_positions_{sim}.parquet")
    if not path.exists():
        print(f"  ⚠ {path.name} not found — run 00_build_dataset.py first")
        continue
    df = pd.read_parquet(path)
    sweep_positions[sim] = df

    # Split by method and compute divergence
    js_df = df[df["method"] == "JavaScript"].copy()
    gpu_df = df[df["method"] == "WebGPU"].copy()
    if not js_df.empty and not gpu_df.empty:
        merged, per_frame = positional_divergence(js_df, gpu_df)
        sweep_divergence[sim] = (merged, per_frame)
        print(f"  ✓ {sim}: {len(df)} rows, {len(per_frame)} frames compared")

# %% [markdown]
# ### 1b. Trig test data (from raw JSON)

# %%
devices = {
    "macbook": "MacBook (M4 Pro)",
    "chromebook": "Chromebook (Pixelbook Go)",
    "mobile": "Mobile (Pixel 9 Pro)",
    "gpu-device": "Linux Desktop (RTX 4060)",
}
DEVICE_COLORS = {
    "MacBook (M4 Pro)": "#4477AA",
    "Chromebook (Pixelbook Go)": "#228833",
    "Mobile (Pixel 9 Pro)": "#EE6677",
    "Linux Desktop (RTX 4060)": "#AA3377",
}

trig_data = {}
trig_agent_dfs = {}
trig_divergence = {}

for folder, label in devices.items():
    path = next(Path(f"../raw-data/trig/{folder}").rglob("*.json"))
    print(f"Loading {label}: {path.name}")
    suite = load_raw(path)
    trig_data[label] = suite

    for method in ["JavaScript", "WebGPU"]:
        try:
            adf = agent_states_to_dataframe(suite, method, "cpu", 100)
            trig_agent_dfs[(label, method)] = adf
        except ValueError as e:
            print(f"  {label} × {method}: {e}")

    key_js = (label, "JavaScript")
    key_gpu = (label, "WebGPU")
    if key_js in trig_agent_dfs and key_gpu in trig_agent_dfs:
        merged, per_frame = positional_divergence(
            trig_agent_dfs[key_js], trig_agent_dfs[key_gpu]
        )
        trig_divergence[label] = (merged, per_frame)
        print(f"  ✓ {label}: {len(per_frame)} frames compared")

# %% [markdown]
# ---
# ## 2. Trajectory Analysis — Median-Worst Agent
#
# For each simulation we find the agent whose final-frame divergence is
# closest to the **median** of the per-agent max divergence (a
# representative "bad" agent, not the extreme outlier).

# %%
def find_worst_agent(merged_df):
    """Return the agent ID whose final-frame divergence is the maximum."""
    last_frame = merged_df["frameNumber"].max()
    final = merged_df[merged_df["frameNumber"] == last_frame]
    if final.empty:
        return None
    worst_idx = final["distance"].idxmax()
    return final.loc[worst_idx, "id"]


def plot_trajectory(ax, merged_df, agent_id, title, aspect="equal"):
    """Plot JS vs WebGPU trajectory for a single agent."""
    agt = merged_df[merged_df["id"] == agent_id].sort_values("frameNumber")
    ax.plot(agt["x_a"], agt["y_a"], "-", color=get_method_color("JavaScript"),
            label="JavaScript", linewidth=1.5, alpha=0.8)
    ax.plot(agt["x_b"], agt["y_b"], "-", color=get_method_color("WebGPU"),
            label="WebGPU", linewidth=1.5, alpha=0.8)
    ax.plot(agt["x_a"].iloc[0], agt["y_a"].iloc[0], "ko", markersize=6, zorder=5)
    ax.plot(agt["x_a"].iloc[-1], agt["y_a"].iloc[-1], "^",
            color=get_method_color("JavaScript"), markersize=8, zorder=5)
    ax.plot(agt["x_b"].iloc[-1], agt["y_b"].iloc[-1], "s",
            color=get_method_color("WebGPU"), markersize=8, zorder=5)
    ax.set_xlabel("X (px)")
    ax.set_ylabel("Y (px)")
    ax.set_title(title, fontsize=11)
    ax.set_aspect(aspect)

# %% [markdown]
# ### 2a. Trig, Slime — side by side


# %%

from matplotlib.lines import Line2D
highlight_sims = ["trig", "slime"]

fig, axes = plt.subplots(1, 2, figsize=(12, 6))

for ax, sim_name in zip(axes, highlight_sims):
    if sim_name == "trig":
        label = list(trig_divergence.keys())[3]
        merged_df, _ = trig_divergence[label]
        title_suffix = f"(trig)"
    else:
        if sim_name not in sweep_divergence:
            ax.set_title(f"{sim_name} — no data")
            continue
        merged_df, _ = sweep_divergence[sim_name]
        title_suffix = f"({sim_name})"

    agent_id = find_worst_agent(merged_df)
    if agent_id is None:
        ax.set_title(f"{sim_name} — no divergence data")
        continue

    last_frame = merged_df["frameNumber"].max()
    final = merged_df[merged_df["frameNumber"] == last_frame]
    dist = final[final["id"] == agent_id]["distance"].values[0]
    
    # Plotting the lines (this likely populates the standard legend handles)
    plot_trajectory(ax, merged_df, agent_id,
                    f"Agent {int(agent_id)} {title_suffix}\nfinal Δ = {dist:.2f} px")

# --- CUSTOM LEGEND LOGIC ---

# 1. Define the icons manually as Proxy Artists
# Note: 'w' color with a marker prevents a line from being drawn through the icon
custom_lines = [
    Line2D([0], [0], marker='o', color='w', label='Start',
           markerfacecolor='black', markersize=8),
    Line2D([0], [0], marker='^', color='w', label='JS End',
           markerfacecolor='tab:blue', markersize=8),
    Line2D([0], [0], marker='s', color='w', label='WebGPU End',
           markerfacecolor='palevioletred', markersize=8)
]

# 2. Grab existing handles (the JS and WebGPU trajectory lines)
handles, labels = axes[0].get_legend_handles_labels()

# 3. Combine and apply to the first axis (or both if you prefer)
axes[0].legend(handles=handles + custom_lines, loc='best', fontsize=8, framealpha=0.9)
axes[1].legend(handles=handles + custom_lines, loc='upper left', fontsize=8, framealpha=0.9)

# ---------------------------

fig.suptitle("Worst-Case Agent Trajectories",
             fontsize=14, fontweight="bold")

save_figure(fig, "08_trajectory_highlight")
plt.show()

# %% [markdown]
# ### 2b. Trajectory for every basic-sweep simulation

# %%
n_sims = len(sweep_divergence)
cols = 4
rows = (n_sims + cols - 1) // cols
fig, axes = plt.subplots(rows, cols, figsize=(5 * cols, 5 * rows))
axes = axes.flatten()

for i, (sim, (merged_df, _)) in enumerate(sorted(sweep_divergence.items())):
    agent_id = find_worst_agent(merged_df)
    if agent_id is None:
        axes[i].set_title(f"{sim.capitalize()} — no data")
        continue
    last_frame = merged_df["frameNumber"].max()
    final = merged_df[merged_df["frameNumber"] == last_frame]
    dist = final[final["id"] == agent_id]["distance"].values[0]
    plot_trajectory(axes[i], merged_df, agent_id,
                    f"{sim.capitalize()} — Agent {int(agent_id)}\nΔ = {dist:.2f} px", aspect="auto")

# Hide unused axes
for j in range(i + 1, len(axes)):
    axes[j].set_visible(False)

axes[0].legend(fontsize=7)
fig.suptitle("Worst-Case Agent Trajectories — All Simulations",
             fontsize=14, fontweight="bold")
fig.tight_layout(rect=[0, 0, 1, 0.96]) # Leave room for suptitle
save_figure(fig, "08_trajectory_all_sims")
plt.show()

# %% [markdown]
# ---
# ## 3. Scatter Plot — All Agent Positions at Time-Step Intervals
#
# At early frames the JS and WebGPU dots overlap almost perfectly;
# as time advances the "clouds" separate.

# %%
def scatter_positions(axes_row, merged_df, frames, title_prefix):
    """Scatter all agent positions for JS and WebGPU at selected frames."""
    for ax, fn in zip(axes_row, frames):
        fd = merged_df[merged_df["frameNumber"] == fn]
        if fd.empty:
            ax.set_title(f"Frame {fn}\n(no data)")
            continue
        ax.scatter(fd["x_a"], fd["y_a"], s=20, alpha=0.8,
                   color="#FF3333", label="JS", marker="o")
        ax.scatter(fd["x_b"], fd["y_b"], s=20, alpha=0.8,
                   color="#33AADD", label="GPU", marker="x")
        mean_d = fd["distance"].mean()
        ax.set_title(f"Frame {fn}\nμ err = {mean_d:.3f} px", fontsize=10)
        ax.set_xlabel("X")
        ax.set_ylabel("Y")
        ax.set_aspect("equal")

# %% [markdown]
# ### 3a. Trig simulation scatter (1000 frames)

# %%
trig_label = list(trig_divergence.keys())[0]
trig_merged, _ = trig_divergence[trig_label]
trig_frames = [0, 50, 100, 250, 500, 999]

fig, axes = plt.subplots(2, 3, figsize=(18, 10))
scatter_positions(axes.flatten(), trig_merged, trig_frames, "Trig")
axes[0, 0].legend(fontsize=8)
fig.suptitle(f"Trig Simulation — Agent Positions at Selected Frames ({trig_label})",
             fontsize=14, fontweight="bold")
save_figure(fig, "08_scatter_trig")
plt.show()

# %% [markdown]
# ### 3b. Boids & Slime scatter (100 frames)

# %%
sweep_frames = [0, 10, 25, 50, 75, 99]

for sim_name in ["boids", "slime"]:
    if sim_name not in sweep_divergence:
        print(f"  ⚠ No data for {sim_name}")
        continue
    merged_df, _ = sweep_divergence[sim_name]
    fig, axes = plt.subplots(2, 3, figsize=(18, 10))
    scatter_positions(axes.flatten(), merged_df, sweep_frames, sim_name)
    axes[0, 0].legend(fontsize=8)
    fig.suptitle(f"{sim_name.capitalize()} — Agent Positions at Selected Frames",
                 fontsize=14, fontweight="bold")
    save_figure(fig, f"08_scatter_{sim_name}")
    plt.show()

# %% [markdown]
# ### 3c. Scatter for all remaining simulations

# %%
remaining = [s for s in SWEEP_SIMS if s not in ["boids", "slime"]]
for sim_name in remaining:
    if sim_name not in sweep_divergence:
        continue
    merged_df, _ = sweep_divergence[sim_name]
    fig, axes = plt.subplots(2, 3, figsize=(18, 10))
    scatter_positions(axes.flatten(), merged_df, sweep_frames, sim_name)
    axes[0, 0].legend(fontsize=8)
    fig.suptitle(f"{sim_name.capitalize()} — Agent Positions at Selected Frames",
                 fontsize=14, fontweight="bold")
    save_figure(fig, f"08_scatter_{sim_name}")
    plt.show()

# %% [markdown]
# ### 3d. Trig simulation scatter with velocity annotations

# %%
trig_label = list(trig_divergence.keys())[0]
js_df = trig_agent_dfs[(trig_label, "JavaScript")]
gpu_df = trig_agent_dfs[(trig_label, "WebGPU")]
vel_merged = js_df.merge(
    gpu_df, on=["frameNumber", "id"], suffixes=("_js", "_gpu"), how="inner"
)

fig, axes = plt.subplots(2, 3, figsize=(18, 10))
axes_flat = axes.flatten()

for ax, fn in zip(axes_flat, trig_frames):
    fd = vel_merged[vel_merged["frameNumber"] == fn]
    if fd.empty:
        ax.set_title(f"Frame {fn}\n(no data)")
        continue
    # Plot JS
    ax.scatter(fd["x_js"], fd["y_js"], s=20, alpha=0.6,
               color="#FF3333", label="JS (Pos)", marker="o")
    ax.quiver(fd["x_js"], fd["y_js"], fd["vx_js"], fd["vy_js"], 
              color="#FF3333", alpha=0.5, scale=60, width=0.003)
              
    # Plot GPU
    ax.scatter(fd["x_gpu"], fd["y_gpu"], s=20, alpha=0.6,
               color="#33AADD", label="GPU (Pos)", marker="x")
    ax.quiver(fd["x_gpu"], fd["y_gpu"], fd["vx_gpu"], fd["vy_gpu"], 
              color="#33AADD", alpha=0.5, scale=60, width=0.003)
              
    ax.set_title(f"Frame {fn}", fontsize=10)
    ax.set_xlabel("X")
    ax.set_ylabel("Y")
    ax.set_aspect("equal")

axes_flat[0].legend(fontsize=8)
fig.suptitle(f"Trig Simulation — Positions & Velocities ({trig_label})",
             fontsize=14, fontweight="bold")
fig.tight_layout(rect=[0, 0, 1, 0.96])
save_figure(fig, "08_scatter_trig_velocity")
plt.show()

# %% [markdown]
# ---
# ## 4. Average Error Over Time — All Simulations
#
# One line per simulation showing mean Euclidean distance between JS and
# WebGPU agent positions across all agents, at every frame.

# %% [markdown]
# ### 4a. Combined line graph (all basic-sweep sims)

# %%
fig, ax = plt.subplots(figsize=(12, 6))

for sim, (merged, per_frame) in sorted(sweep_divergence.items()):
    ax.plot(per_frame.index, per_frame["mean_distance"],
            label=sim.capitalize(), color=SIM_COLORS[sim], linewidth=1.5)

ax.set_xlabel("Frame Number")
ax.set_ylabel("Mean Position Error (px)")
ax.set_title("Average JS → WebGPU Agent Position Error Over Time",
             fontweight="bold")
ax.legend(ncol=2, fontsize=9)
ax.set_yscale("log")
save_figure(fig, "08_avg_error_all_sims")
plt.show()

# %% [markdown]
# ### 4b. Max error per frame

# %%
fig, ax = plt.subplots(figsize=(12, 6))

for sim, (merged, per_frame) in sorted(sweep_divergence.items()):
    ax.plot(per_frame.index, per_frame["max_distance"],
            label=sim.capitalize(), color=SIM_COLORS[sim],
            linewidth=1.5, alpha=0.8)

ax.set_xlabel("Frame Number")
ax.set_ylabel("Max Position Error (px)")
ax.set_title("Maximum JS → WebGPU Agent Position Error Over Time",
             fontweight="bold")
ax.legend(ncol=2, fontsize=9)
ax.set_yscale("log")
save_figure(fig, "08_max_error_all_sims")
plt.show()

# %% [markdown]
# ### 4c. Faceted — one subplot per simulation

# %%
fig, axes = plt.subplots(2, 4, figsize=(20, 9))
axes = axes.flatten()

for i, sim in enumerate(SWEEP_SIMS):
    if sim not in sweep_divergence:
        axes[i].set_title(f"{sim.capitalize()} — no data")
        continue
    merged, per_frame = sweep_divergence[sim]
    ax = axes[i]
    ax.plot(per_frame.index, per_frame["mean_distance"],
            color=SIM_COLORS[sim], label="Mean")
    ax.plot(per_frame.index, per_frame["max_distance"],
            color=SIM_COLORS[sim], alpha=0.4, linestyle="--", label="Max")
    ax.set_title(sim.capitalize(), fontweight="bold")
    ax.set_xlabel("Frame")
    ax.set_ylabel("Error (px)")
    # ax.set_yscale("log")

axes[0].legend(fontsize=8)
fig.suptitle("Per-Simulation Error Growth: Mean and Max",
             fontsize=14, fontweight="bold")
save_figure(fig, "08_error_faceted")
plt.show()

# %% [markdown]
# ### 4d. Error growth rate (derivative)

# %%
fig, ax = plt.subplots(figsize=(12, 6))

for sim, (merged, per_frame) in sorted(sweep_divergence.items()):
    growth = per_frame["mean_distance"].diff().rolling(5, min_periods=1).mean()
    ax.plot(per_frame.index, growth,
            label=sim.capitalize(), color=SIM_COLORS[sim], linewidth=1.5)

ax.set_xlabel("Frame Number")
ax.set_ylabel("Error Growth Rate (px/frame)")
ax.set_title("Divergence Growth Rate — All Simulations", fontweight="bold")
ax.legend(ncol=2, fontsize=9)
save_figure(fig, "08_error_growth_rate")
plt.show()

# %% [markdown]
# ### 4e. Final-frame error ranking

# %%
final_errors = []
for sim, (merged, per_frame) in sweep_divergence.items():
    if len(per_frame) == 0:
        continue
    final_errors.append({
        "Simulation": sim.capitalize(),
        "Mean Error (px)": per_frame.iloc[-1]["mean_distance"],
        "Max Error (px)": per_frame.iloc[-1]["max_distance"],
        "Growth Rate (px/frame)": (
            (per_frame.iloc[-1]["mean_distance"] - per_frame.iloc[0]["mean_distance"])
            / len(per_frame)
        ),
    })

error_df = pd.DataFrame(final_errors).sort_values("Mean Error (px)", ascending=True)

fig, ax = plt.subplots(figsize=(10, 5))
colors = [SIM_COLORS.get(s.lower(), "gray") for s in error_df["Simulation"]]
ax.barh(error_df["Simulation"], error_df["Mean Error (px)"],
        color=colors, edgecolor="white")
ax.set_xlabel("Mean Position Error at Final Frame (px)")
ax.set_title("Simulation Ranking by Divergence - frame 100", fontweight="bold")
ax.set_xscale("log")
save_figure(fig, "08_error_ranking")
plt.show()

print(error_df.to_string(index=False))

# %% [markdown]
# ---
# ## 5. In-Depth Trig Simulation Analysis
#
# The trig simulation is a pure trigonometric test — agent motion is
# driven entirely by sin/cos.  This makes it the ideal probe for
# GPU vs CPU trig-function discrepancies.

# %% [markdown]
# ### 5a. Divergence growth across all devices

# %%
fig, ax = plt.subplots(figsize=(10, 6))

for label, (merged, per_frame) in trig_divergence.items():
    c = DEVICE_COLORS.get(label, "gray")
    ax.plot(per_frame.index, per_frame["mean_distance"],
            label=f"{label} (mean)", color=c, linewidth=1.5)
    ax.fill_between(per_frame.index, 0, per_frame["max_distance"],
                    color=c, alpha=0.1)
    ax.plot(per_frame.index, per_frame["max_distance"],
            color=c, alpha=0.3, linestyle="--", label=f"{label} (max)")

ax.set_xlabel("Frame Number")
ax.set_ylabel("Position Divergence (px)")
ax.set_title("Trig Simulation: JS vs WebGPU Divergence Over 1000 Frames",
             fontweight="bold")
ax.legend(fontsize=8)
save_figure(fig, "08_trig_divergence_devices")
plt.show()

# %% [markdown]
# ### 5b. Per-agent divergence heatmap

# %%
first_label = list(trig_divergence.keys())[0]
trig_merged, trig_per_frame = trig_divergence[first_label]

# Pivot: rows = agent, cols = frame
pivot = trig_merged.pivot_table(
    index="id", columns="frameNumber", values="distance", aggfunc="first"
)

fig, ax = plt.subplots(figsize=(14, 6))
im = ax.imshow(pivot.values, aspect="auto", cmap="hot", interpolation="nearest")
ax.set_xlabel("Frame Number")
ax.set_ylabel("Agent ID")
ax.set_title(f"Per-Agent Divergence Heatmap — Trig ({first_label})", fontweight="bold")

# Show every 100th frame on x axis
n_frames = pivot.shape[1]
tick_step = max(1, n_frames // 10)
ax.set_xticks(range(0, n_frames, tick_step))
ax.set_xticklabels(pivot.columns[::tick_step].astype(int))

plt.colorbar(im, ax=ax, label="Distance (px)")
save_figure(fig, "08_trig_heatmap")
plt.show()

# %% [markdown]
# ### 5c. Velocity error decomposition (vx, vy, speed)

# %%
js_df = trig_agent_dfs[(first_label, "JavaScript")].copy()
gpu_df = trig_agent_dfs[(first_label, "WebGPU")].copy()

js_df["speed"] = np.sqrt(js_df["vx"]**2 + js_df["vy"]**2)
gpu_df["speed"] = np.sqrt(gpu_df["vx"]**2 + gpu_df["vy"]**2)

vel_merged = js_df.merge(
    gpu_df, on=["frameNumber", "id"], suffixes=("_js", "_gpu"), how="inner"
)
vel_merged["vx_err"] = (vel_merged["vx_js"] - vel_merged["vx_gpu"]).abs()
vel_merged["vy_err"] = (vel_merged["vy_js"] - vel_merged["vy_gpu"]).abs()
vel_merged["speed_err"] = (vel_merged["speed_js"] - vel_merged["speed_gpu"]).abs()

vel_per_frame = vel_merged.groupby("frameNumber").agg({
    "vx_err": ["mean", "max"],
    "vy_err": ["mean", "max"],
    "speed_err": ["mean", "max"],
}).reset_index()
vel_per_frame.columns = ["frameNumber",
                          "vx_err_mean", "vx_err_max",
                          "vy_err_mean", "vy_err_max",
                          "speed_err_mean", "speed_err_max"]

fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(14, 5))

ax1.plot(vel_per_frame["frameNumber"], vel_per_frame["vx_err_mean"],
         label="vx error (mean)", color="#4477AA")
ax1.plot(vel_per_frame["frameNumber"], vel_per_frame["vy_err_mean"],
         label="vy error (mean)", color="#EE6677")
ax1.set_xlabel("Frame Number")
ax1.set_ylabel("Absolute Velocity Error (px/frame)")
ax1.set_title("Mean Velocity Component Error")
ax1.legend(fontsize=8)

ax2.plot(vel_per_frame["frameNumber"], vel_per_frame["speed_err_mean"],
         label="Mean", color="#228833")
ax2.plot(vel_per_frame["frameNumber"], vel_per_frame["speed_err_max"],
         label="Max", color="#228833", alpha=0.4, linestyle="--")
ax2.set_xlabel("Frame Number")
ax2.set_ylabel("Speed Error (px/frame)")
ax2.set_title("Speed Magnitude Error")
ax2.legend(fontsize=8)

fig.suptitle(f"Trig Simulation - Velocity Error of JS vs WebGPU — {first_label}",
             fontsize=14, fontweight="bold")
save_figure(fig, "08_trig_velocity_error")
plt.show()

# %% [markdown]
# ### 5d. Error by agent angle — trig correlation

# %%
vel_merged["theta_js"] = np.arctan2(vel_merged["vy_js"], vel_merged["vx_js"])
vel_merged["sin_theta"] = np.sin(vel_merged["theta_js"])
vel_merged["cos_theta"] = np.cos(vel_merged["theta_js"])

n_bins = 50
vel_merged["theta_bin"] = pd.cut(vel_merged["theta_js"], bins=n_bins)
angle_stats = vel_merged.groupby("theta_bin", observed=True).agg({
    "speed_err": "mean",
    "sin_theta": "mean",
    "cos_theta": "mean",
    "theta_js": "mean",
}).dropna()

fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 8), sharex=True)

ax1.plot(range(len(angle_stats)), angle_stats["speed_err"],
         color="#AA3377", linewidth=2, marker="o", markersize=4)
ax1.grid(True, alpha=0.3)
ax1.set_ylabel("Mean Speed Error (px/frame)")
ax1.set_title("Speed Error vs Agent Angle (θ)")

ax2.plot(range(len(angle_stats)), angle_stats["sin_theta"],
         label="sin(θ)", color="#4477AA", linewidth=2)
ax2.plot(range(len(angle_stats)), angle_stats["cos_theta"],
         label="cos(θ)", color="#EE6677", linewidth=2)
ax2.set_ylabel("Trig Function Value")
ax2.set_xlabel("Angle Bin (θ from −π to π)")
ax2.legend()

fig.suptitle("Trig Error Correlation: Does Error Align with sin/cos Gradients?",
             fontsize=14, fontweight="bold")
save_figure(fig, "08_trig_angle_correlation")
plt.show()


# %% [markdown]
# ### 5d. Error by agent angle — Tiled Overlay with Proper Phase & Labels

# %%
import numpy as np
import pandas as pd
import matplotlib.pyplot as plt
from scipy.signal import savgol_filter

# 1. Prep Data (1x cycle)
vel_merged["theta_js"] = np.arctan2(vel_merged["vy_js"], vel_merged["vx_js"])
n_bins = 50
vel_merged["theta_bin"] = pd.cut(vel_merged["theta_js"], bins=n_bins)

angle_stats = vel_merged.groupby("theta_bin", observed=True).agg({
    "speed_err": "mean",
    "theta_js": "mean",
}).dropna().reset_index(drop=True)

# 2. Smooth the trend
smooth_trend = savgol_filter(angle_stats["speed_err"], window_length=15, polyorder=3)

# 3. Find and Flip the best trig match
trig_options = {
    "sin(θ)": np.sin(angle_stats["theta_js"]),
    "cos(θ)": np.cos(angle_stats["theta_js"]),
    "sin(-θ)": np.sin(-angle_stats["theta_js"]),
    "cos(-θ)": np.cos(-angle_stats["theta_js"])
}

corrs = {name: np.corrcoef(angle_stats["speed_err"], val)[0, 1] for name, val in trig_options.items()}
best_name = max(corrs, key=lambda k: abs(corrs[k]))
best_corr_val = corrs[best_name]

final_trig_raw = trig_options[best_name]
display_name = best_name
if best_corr_val < 0:
    final_trig_raw = -final_trig_raw
    display_name = f"-{best_name}"

# 4. Rescale
err_min, err_max = smooth_trend.min(), smooth_trend.max()
trig_scaled = ((final_trig_raw - final_trig_raw.min()) / (final_trig_raw.max() - final_trig_raw.min())) * (err_max - err_min) + err_min

# 5. Tile
error_2x = np.tile(angle_stats["speed_err"], 2)
trend_2x = np.tile(smooth_trend, 2)
trig_2x = np.tile(trig_scaled, 2)
x_axis = np.arange(len(error_2x))

# 6. Plotting with Axis Labels
fig, ax = plt.subplots(figsize=(12, 6))

ax.plot(x_axis, error_2x, color="#AA3377", alpha=0.3, label="Mean Error", marker="o", markersize=3)
ax.plot(x_axis, trend_2x, color="black", linestyle="--", linewidth=2, label="Smooth Trend")
ax.plot(x_axis, trig_2x, color="#4477AA", linewidth=1, label=f"Aligned Match: {display_name}")

# --- AXIS LABELING LOGIC ---
# Define positions for -pi, 0, pi for two cycles
# Cycle 1: 0, 25, 50 | Cycle 2: 50, 75, 100
tick_pos = [0, 12.5, 25, 37.5, 50, 62.5, 75, 87.5, 100]
tick_labels = [r"$-\pi$", r"$-\pi/2$", "0", r"$\pi/2$", r"$\pi | -\pi$", r"$-\pi/2$", "0", r"$\pi/2$", r"$\pi$"]

ax.set_xticks(tick_pos)
ax.set_xticklabels(tick_labels)

ax.set_title("Speed Error vs Phase-Aligned Trig Match", fontsize=14, fontweight="bold")
ax.set_ylabel("Mean Speed Error (px/frame)")
ax.set_xlabel("Agent Angle (θ)")
ax.grid(True, alpha=0.2, linestyle=':')
ax.axvline(50, color='gray', linestyle='--', alpha=0.5) # Wrap point

ax.legend(loc="upper right")
plt.tight_layout()
plt.show()
# %% [markdown]
# ### 5e. Cross-device trig error growth rate comparison

# %%
fig, ax = plt.subplots(figsize=(10, 6))

for label, (merged, per_frame) in trig_divergence.items():
    c = DEVICE_COLORS.get(label, "gray")
    growth = per_frame["mean_distance"].diff().rolling(20, min_periods=1).mean()
    ax.plot(per_frame.index, growth, label=label, color=c, linewidth=1.5)

ax.set_xlabel("Frame Number")
ax.set_ylabel("Divergence Growth Rate (px/frame)")
ax.set_title("Trig Simulation - Divergence Growth Rate Across Devices", fontweight="bold")
ax.legend(fontsize=9, loc="upper left")
# ax.set_yscale("log")
save_figure(fig, "08_trig_growth_rate_devices")
plt.show()

# %% [markdown]
# ### 5f. Cross-device divergence bar summary

# %%
comparison = []
for label, (merged, per_frame) in trig_divergence.items():
    comparison.append({
        "Device": label,
        "Mean Divergence (px)": per_frame["mean_distance"].mean(),
        "Max Divergence (px)": per_frame["max_distance"].max(),
        "Final Frame Mean (px)": per_frame.iloc[-1]["mean_distance"],
        "Growth Rate (px/frame)": (
            (per_frame.iloc[-1]["mean_distance"] - per_frame.iloc[0]["mean_distance"])
            / len(per_frame)
        ),
    })

comp_df = pd.DataFrame(comparison)

fig, ax = plt.subplots(figsize=(8, 6))
bar_colors = [DEVICE_COLORS.get(d, "gray") for d in comp_df["Device"]]

ax.bar(comp_df["Device"], comp_df["Final Frame Mean (px)"],
       color=bar_colors, edgecolor="white")
ax.set_ylabel("Final Frame Divergence (px)")
ax.set_title("Trig Simulation - JS vs WebGPU Accuracy — Summary by Device",
             fontsize=14, fontweight="bold")

# log y
ax.set_yscale("log")

save_figure(fig, "08_trig_device_summary")
plt.show()

print(comp_df.to_string(index=False))

# %% [markdown]
# ### 5g. Error distribution evolution — trig

# %%
trig_hist_frames = [0, 100, 250, 500, 750, 999]

fig, axes = plt.subplots(2, 3, figsize=(18, 9))
axes = axes.flatten()

for ax, fn in zip(axes, trig_hist_frames):
    frame_data = trig_merged[trig_merged["frameNumber"] == fn]
    if frame_data.empty:
        ax.set_title(f"Frame {fn}\n(no data)")
        continue
    ax.hist(frame_data["distance"], bins=25, color="#6DA49D",
            edgecolor="white", alpha=0.8)
    ax.set_xlabel("Distance (px)")
    ax.set_ylabel("Agent Count")
    ax.set_title(f"Frame {fn}\nμ = {frame_data['distance'].mean():.4f}, "
                 f"max = {frame_data['distance'].max():.4f}")

fig.suptitle(f"Trig Simulation - Agent-Level Divergence Distribution",
             fontsize=13, fontweight="bold")
save_figure(fig, "08_trig_error_distribution")
plt.show()

# %% [markdown]
# ### 5h. Agent trajectory fan — trig worst 5 agents

# %%
# Find 5 most-divergent agents
last_frame = trig_merged["frameNumber"].max()
final_trig = trig_merged[trig_merged["frameNumber"] == last_frame]
top5 = final_trig.nlargest(5, "distance")["id"].values

fig, axes = plt.subplots(1, 5, figsize=(25, 5))

for ax, aid in zip(axes, top5):
    agt = trig_merged[trig_merged["id"] == aid].sort_values("frameNumber")
    dist = final_trig[final_trig["id"] == aid]["distance"].values[0]
    ax.plot(agt["x_a"], agt["y_a"], "-", color=get_method_color("JavaScript"),
            linewidth=1.5, label="JS")
    ax.plot(agt["x_b"], agt["y_b"], "-", color=get_method_color("WebGPU"),
            linewidth=1.5, label="GPU")
    ax.plot(agt["x_a"].iloc[0], agt["y_a"].iloc[0], "ko", markersize=5, zorder=5)
    ax.set_title(f"Agent {int(aid)}\nΔ = {dist:.1f} px", fontsize=10)
    ax.set_aspect("equal")

axes[0].legend(fontsize=7)
fig.suptitle("Trig — Top 5 Most-Divergent Agent Trajectories",
             fontsize=14, fontweight="bold")
save_figure(fig, "08_trig_top5_trajectories")
plt.show()

# %% [markdown]
# ### 5i. Cumulative position error (sum of per-frame distances)

# %%
fig, ax = plt.subplots(figsize=(10, 6))

for label, (merged, per_frame) in trig_divergence.items():
    c = DEVICE_COLORS.get(label, "gray")
    cumulative = per_frame["mean_distance"].cumsum()
    ax.plot(per_frame.index, cumulative, label=label, color=c, linewidth=1.5)

ax.set_xlabel("Frame Number")
ax.set_ylabel("Cumulative Mean Error (px)")
ax.set_title("Trig — Cumulative Position Error Over Time", fontweight="bold")
ax.legend(fontsize=9)
save_figure(fig, "08_trig_cumulative_error")
plt.show()

# %% [markdown]
# ---
# ## 6. Combined Summary

# %% [markdown]
# ### 6a. Summary statistics table

# %%
all_errors = []

# Basic sweep sims
for sim, (merged, per_frame) in sweep_divergence.items():
    if len(per_frame) == 0:
        continue
    all_errors.append({
        "Source": "Basic Sweep",
        "Simulation": sim.capitalize(),
        "Frames": len(per_frame),
        "Mean Error (px)": per_frame["mean_distance"].mean(),
        "Max Error (px)": per_frame["max_distance"].max(),
        "Final Mean (px)": per_frame.iloc[-1]["mean_distance"],
        "Growth Rate (px/frame)": (
            (per_frame.iloc[-1]["mean_distance"] - per_frame.iloc[0]["mean_distance"])
            / len(per_frame)
        ),
    })

# Trig (first device)
for label, (merged, per_frame) in trig_divergence.items():
    if len(per_frame) == 0:
        continue
    all_errors.append({
        "Source": f"Trig ({label})",
        "Simulation": "Trig",
        "Frames": len(per_frame),
        "Mean Error (px)": per_frame["mean_distance"].mean(),
        "Max Error (px)": per_frame["max_distance"].max(),
        "Final Mean (px)": per_frame.iloc[-1]["mean_distance"],
        "Growth Rate (px/frame)": (
            (per_frame.iloc[-1]["mean_distance"] - per_frame.iloc[0]["mean_distance"])
            / len(per_frame)
        ),
    })

summary_df = pd.DataFrame(all_errors).sort_values("Mean Error (px)", ascending=False)
print("=== Cross-Simulation Error Summary ===")
print(summary_df.round(4).to_string(index=False))

# %% [markdown]
# ### 6b. Combined bar chart — all data sources

# %%
fig, (ax1, ax2) = plt.subplots(1, 2, figsize=(16, 6))

labels = summary_df["Simulation"] + "\n" + summary_df["Source"].str.replace("Basic Sweep", "sweep")
colors_list = []
for _, row in summary_df.iterrows():
    sim_lower = row["Simulation"].lower()
    if sim_lower in SIM_COLORS:
        colors_list.append(SIM_COLORS[sim_lower])
    else:
        colors_list.append("#AA3377")

ax1.barh(labels, summary_df["Mean Error (px)"],
         color=colors_list, edgecolor="white")
ax1.set_xlabel("Mean Position Error (px)")
ax1.set_title("Mean Error (averaged across frames)", fontweight="bold")

ax2.barh(labels, summary_df["Max Error (px)"],
         color=colors_list, edgecolor="white")
ax2.set_xlabel("Max Position Error (px)")
ax2.set_title("Peak Error", fontweight="bold")

fig.suptitle("JS vs WebGPU Positional Error — All Simulations",
             fontsize=14, fontweight="bold")
save_figure(fig, "08_error_summary_bars")
plt.show()
