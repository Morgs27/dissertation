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
# across devices? Which agents diverge most, and does error correlate with
# trig-function geometry?
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
    METHOD_LABELS,
)
from src.data_loader import agent_states_to_dataframe

apply_style()

# Standard device colour mapping
DEVICE_COLORS = {
    "MacBook (M4 Pro)": "#4477AA",
    "Chromebook": "#228833",
    "Pixel 9 Pro": "#EE6677",
}

# %% [markdown]
# ## 1. Load trig test data

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

for label, (merged, per_frame) in divergence_by_device.items():
    c = DEVICE_COLORS.get(label, "gray")
    ax.plot(per_frame.index, per_frame["mean_distance"],
            label=f"{label} (mean)", color=c, alpha=0.8)
    ax.plot(per_frame.index, per_frame["max_distance"],
            label=f"{label} (max)", color=c, alpha=0.4, linestyle="--")

ax.set_xlabel("Frame Number")
ax.set_ylabel("Position Divergence (pixels)")
ax.set_title("JS vs WebGPU: Agent Position Divergence Over 1000 Frames")
ax.legend(fontsize=8)
save_figure(fig, "07_divergence_over_time")
plt.show()

# %% [markdown]
# ## 5. Worst-agent trajectory analysis
#
# The agent with the largest final-frame divergence.
# JS and WebGPU end up in completely different positions so we show
# side-by-side trajectories with a shared coordinate system.

# %%
first_label = list(divergence_by_device.keys())[0]
merged_df, _ = divergence_by_device[first_label]

# Find worst agent
last_frame = merged_df["frameNumber"].max()
final = merged_df[merged_df["frameNumber"] == last_frame]
worst_agent_id = final.loc[final["distance"].idxmax(), "id"]
worst_dist = final.loc[final["distance"].idxmax(), "distance"]
print(f"Worst diverging agent: id={worst_agent_id}, final distance={worst_dist:.2f} px")

worst = merged_df[merged_df["id"] == worst_agent_id].sort_values("frameNumber")

fig, axes = plt.subplots(1, 3, figsize=(18, 5))

# Panel 1: Both trajectories — shared axis with full canvas range
ax = axes[0]
ax.plot(worst["x_a"], worst["y_a"], "-", color=get_method_color("JavaScript"),
        label="JavaScript", linewidth=2, alpha=0.8)
ax.plot(worst["x_b"], worst["y_b"], "-", color=get_method_color("WebGPU"),
        label="WebGPU", linewidth=2, alpha=0.8)
ax.plot(worst["x_a"].iloc[0], worst["y_a"].iloc[0], "ko", markersize=8, zorder=5, label="Start")
ax.plot(worst["x_a"].iloc[-1], worst["y_a"].iloc[-1], "^",
        color=get_method_color("JavaScript"), markersize=10, zorder=5, label="JS End")
ax.plot(worst["x_b"].iloc[-1], worst["y_b"].iloc[-1], "s",
        color=get_method_color("WebGPU"), markersize=10, zorder=5, label="GPU End")
ax.set_xlabel("X (px)")
ax.set_ylabel("Y (px)")
ax.set_title("Full Canvas View")
ax.legend(fontsize=7)
ax.set_aspect("equal")

# Panel 2: JS trajectory zoomed
ax = axes[1]
ax.plot(worst["x_a"], worst["y_a"], "-", color=get_method_color("JavaScript"), linewidth=2)
ax.scatter([worst["x_a"].iloc[0]], [worst["y_a"].iloc[0]], c="k", s=50, zorder=5)
ax.scatter([worst["x_a"].iloc[-1]], [worst["y_a"].iloc[-1]], c=get_method_color("JavaScript"),
           s=80, marker="^", zorder=5)
# Colour-code by frame number
scatter = ax.scatter(worst["x_a"], worst["y_a"], c=worst["frameNumber"],
                     cmap="viridis", s=8, alpha=0.5, zorder=3)
plt.colorbar(scatter, ax=ax, label="Frame")
ax.set_xlabel("X (px)")
ax.set_ylabel("Y (px)")
ax.set_title("JavaScript Trajectory (zoomed)")
ax.set_aspect("equal")

# Panel 3: WebGPU trajectory zoomed
ax = axes[2]
ax.plot(worst["x_b"], worst["y_b"], "-", color=get_method_color("WebGPU"), linewidth=2)
ax.scatter([worst["x_b"].iloc[0]], [worst["y_b"].iloc[0]], c="k", s=50, zorder=5)
ax.scatter([worst["x_b"].iloc[-1]], [worst["y_b"].iloc[-1]], c=get_method_color("WebGPU"),
           s=80, marker="s", zorder=5)
scatter = ax.scatter(worst["x_b"], worst["y_b"], c=worst["frameNumber"],
                     cmap="viridis", s=8, alpha=0.5, zorder=3)
plt.colorbar(scatter, ax=ax, label="Frame")
ax.set_xlabel("X (px)")
ax.set_ylabel("Y (px)")
ax.set_title("WebGPU Trajectory (zoomed)")
ax.set_aspect("equal")

fig.suptitle(f"Worst Agent (id={worst_agent_id}) — Trajectory Comparison ({first_label})",
             fontsize=14, fontweight="bold")
save_figure(fig, "07_worst_agent_trajectory")
plt.show()

# %% [markdown]
# ## 5b. Per-agent final divergence ranking

# %%
agent_final = final.sort_values("distance", ascending=False).head(20)

fig, ax = plt.subplots(figsize=(10, 5))
ax.barh(
    [f"Agent {int(r['id'])}" for _, r in agent_final.iterrows()],
    agent_final["distance"],
    color="#AA3377", edgecolor="white"
)
ax.set_xlabel("Final-Frame Divergence (px)")
ax.set_title(f"Top 20 Most-Divergent Agents — {first_label}")
ax.invert_yaxis()
save_figure(fig, "07_agent_ranking")
plt.show()

# %% [markdown]
# ## 6. Agent velocity magnitude comparison

# %%
js_df = agent_dfs[(first_label, "JavaScript")].copy()
gpu_df = agent_dfs[(first_label, "WebGPU")].copy()

js_df["speed"] = np.sqrt(js_df["vx"]**2 + js_df["vy"]**2)
gpu_df["speed"] = np.sqrt(gpu_df["vx"]**2 + gpu_df["vy"]**2)

sample_frames = [0, 100, 500, 999]

fig, axes = plt.subplots(1, len(sample_frames), figsize=(16, 4), sharey=True)

for ax, fn in zip(axes, sample_frames):
    js_frame = js_df[js_df["frameNumber"] == fn]["speed"]
    gpu_frame = gpu_df[gpu_df["frameNumber"] == fn]["speed"]

    lo = min(js_frame.min(), gpu_frame.min()) if not js_frame.empty else 0
    hi = max(js_frame.max(), gpu_frame.max()) if not js_frame.empty else 1
    bins = np.linspace(lo, hi, 25)
    ax.hist(js_frame, bins=bins, alpha=0.6, color=get_method_color("JavaScript"),
            label="JavaScript", edgecolor="white")
    ax.hist(gpu_frame, bins=bins, alpha=0.6, color=get_method_color("WebGPU"),
            label="WebGPU", edgecolor="white")
    ax.set_xlabel("Speed (px/frame)")
    ax.set_title(f"Frame {fn}")

axes[0].set_ylabel("Agent Count")
axes[0].legend(fontsize=8)
fig.suptitle(f"Velocity Magnitude Distribution: JS vs WebGPU — {first_label}",
             fontsize=13, fontweight="bold")
plt.tight_layout()
save_figure(fig, "07_velocity_distribution")
plt.show()

# %% [markdown]
# ## 7. Velocity error over time

# %%
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
ax1.set_title("Mean Velocity Component Error Over Time")
ax1.legend(fontsize=8)

ax2.plot(vel_per_frame["frameNumber"], vel_per_frame["speed_err_mean"],
         label="Mean", color="#228833")
ax2.plot(vel_per_frame["frameNumber"], vel_per_frame["speed_err_max"],
         label="Max", color="#228833", alpha=0.4, linestyle="--")
ax2.set_xlabel("Frame Number")
ax2.set_ylabel("Speed Error (px/frame)")
ax2.set_title("Speed Magnitude Error Over Time")
ax2.legend(fontsize=8)

fig.suptitle(f"Velocity Error: JS vs WebGPU — {first_label}",
             fontsize=14, fontweight="bold")
plt.tight_layout()
save_figure(fig, "07_velocity_error")
plt.show()

# %% [markdown]
# ## 8. Trig error ↔ sine/cosine correlation
#
# The trig simulation drives agent motion via sin/cos.
# We bin the speed error by the JS-computed agent angle to check whether
# divergence peaks at high-gradient regions of the trig functions.

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

ax1.bar(range(len(angle_stats)), angle_stats["speed_err"],
        color="#AA3377", alpha=0.7, edgecolor="white")
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
plt.tight_layout()
save_figure(fig, "07_trig_error_correlation")
plt.show()

# %% [markdown]
# ## 9. Distribution of per-agent divergence at selected frames

# %%
fig, axes = plt.subplots(1, len(sample_frames), figsize=(16, 4), sharey=True)

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
# ## 10. Divergence growth rate comparison across all devices

# %%
fig, ax = plt.subplots(figsize=(10, 6))

for label, (merged, per_frame) in divergence_by_device.items():
    c = DEVICE_COLORS.get(label, "gray")
    growth = per_frame["mean_distance"].diff().rolling(20, min_periods=1).mean()
    ax.plot(per_frame.index, growth, label=label, color=c, linewidth=1.5)

ax.set_xlabel("Frame Number")
ax.set_ylabel("Divergence Growth Rate (px/frame)")
ax.set_title("Divergence Growth Rate: JS vs WebGPU Across Devices")
ax.legend(fontsize=9)
save_figure(fig, "07_divergence_growth_rate")
plt.show()

# %% [markdown]
# ## 11. Cross-device divergence summary

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
fig, axes = plt.subplots(1, 3, figsize=(16, 5))
bar_colors = [DEVICE_COLORS.get(d, "gray") for d in comp_df["device"]]

axes[0].bar(comp_df["device"], comp_df["mean_divergence"],
        color=bar_colors, edgecolor="white")
axes[0].set_ylabel("Mean Divergence (px)")
axes[0].set_title("Average")

axes[1].bar(comp_df["device"], comp_df["max_divergence"],
        color=bar_colors, edgecolor="white")
axes[1].set_ylabel("Max Divergence (px)")
axes[1].set_title("Maximum")

axes[2].bar(comp_df["device"], comp_df["final_frame_mean"],
        color=bar_colors, edgecolor="white")
axes[2].set_ylabel("Divergence (px)")
axes[2].set_title("Final Frame (mean)")

fig.suptitle("JS vs WebGPU Numerical Accuracy — Summary by Device",
             fontsize=14, fontweight="bold")
plt.tight_layout()
save_figure(fig, "07_cross_device_divergence")
plt.show()

# %% [markdown]
# ## 12. Final-frame agent position overlay

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

# %% [markdown]
# ---
# # Cross-Simulation Numerical Accuracy
#
# Since agent positions are only captured in trig tests, we use
# **frame-time variability** and **timing component divergence** across the
# 8 basic-sweep simulations to compare *computational consistency*
# between methods.  Higher variance → more floating-point sensitivity.

# %% [markdown]
# ## 13. Per-simulation frame-time coefficient of variation

# %%
sweep_df = pd.read_parquet("../processed/basic_sweeps.parquet")

# Keep CPU render, best config per method
from src import METHOD_ORDER

def best_per_method(df):
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

# CV = stdDev / avg  — available in summary stats
main_df["frameTime_cv"] = main_df["frameTime_stdDev"] / main_df["frameTime_avg"]

# Average CV across all agent counts, per sim × method
cv_by_sim = main_df.groupby(["suite", "method"])["frameTime_cv"].mean().reset_index()

fig, ax = plt.subplots(figsize=(12, 6))

sims = sorted(cv_by_sim["suite"].unique())
x = np.arange(len(sims))
n_methods = len(METHOD_ORDER)
width = 0.8 / n_methods

for i, method in enumerate(METHOD_ORDER):
    subset = cv_by_sim[cv_by_sim["method"] == method]
    vals = [subset[subset["suite"] == s]["frameTime_cv"].values[0]
            if s in subset["suite"].values else 0 for s in sims]
    ax.bar(x + i*width - width*(n_methods-1)/2, vals, width,
           label=METHOD_LABELS.get(method, method),
           color=get_method_color(method), edgecolor="white")

ax.set_xticks(x)
ax.set_xticklabels([s.capitalize() for s in sims], rotation=0)
ax.set_ylabel("Frame-Time CV (σ / μ)")
ax.set_title("Frame-Time Coefficient of Variation by Simulation × Method",
             fontweight="bold")
ax.legend(fontsize=9)
save_figure(fig, "07_cv_by_simulation")
plt.show()

# %% [markdown]
# ## 14. Which simulations have the highest compute-time variability?
#
# Averaged across all methods and agent counts.

# %%
sim_cv = main_df.groupby("suite")["frameTime_cv"].agg(["mean", "std"]).reset_index()
sim_cv = sim_cv.sort_values("mean", ascending=True)

fig, ax = plt.subplots(figsize=(9, 5))
colors = plt.cm.viridis(np.linspace(0.2, 0.8, len(sim_cv)))
ax.barh(
    sim_cv["suite"].str.capitalize(), sim_cv["mean"],
    xerr=sim_cv["std"], color=colors, edgecolor="white", capsize=3,
)
ax.set_xlabel("Mean Frame-Time CV (σ / μ)")
ax.set_title("Simulation Complexity → Compute Variability Ranking", fontweight="bold")
save_figure(fig, "07_sim_variability_ranking")
plt.show()

# %% [markdown]
# ## 15. P95/P50 ratio heatmap — per simulation × method
#
# The ratio P95/P50 captures tail-latency jitter.  Higher values
# indicate more extreme outlier frames — often correlated with
# floating-point edge cases in the simulation logic.

# %%
main_df["p95_p50_ratio"] = main_df["frameTime_p95"] / main_df["frameTime_p50"]

# Pick a representative agent count
rep_n = 5000
rep = main_df[main_df["agentCount"] == rep_n]

pivot = rep.pivot_table(index="suite", columns="method", values="p95_p50_ratio")
# Reorder columns to METHOD_ORDER
pivot = pivot[[m for m in METHOD_ORDER if m in pivot.columns]]

fig, ax = plt.subplots(figsize=(10, 6))
im = ax.imshow(pivot.values, aspect="auto", cmap="YlOrRd")

ax.set_xticks(range(len(pivot.columns)))
ax.set_xticklabels([METHOD_LABELS.get(m, m) for m in pivot.columns])
ax.set_yticks(range(len(pivot.index)))
ax.set_yticklabels([s.capitalize() for s in pivot.index])

for i in range(len(pivot.index)):
    for j in range(len(pivot.columns)):
        val = pivot.values[i, j]
        if not np.isnan(val):
            ax.text(j, i, f"{val:.2f}", ha="center", va="center",
                    fontsize=9, fontweight="bold",
                    color="white" if val > 1.5 else "black")

plt.colorbar(im, ax=ax, label="P95 / P50 Ratio")
ax.set_title(f"Tail Latency Ratio by Simulation × Method (N={rep_n:,})", fontweight="bold")
save_figure(fig, "07_p95_p50_heatmap")
plt.show()

# %% [markdown]
# ## 16. Compute time consistency: method deviation across simulations
#
# For each method, how much does its compute time vary across the
# 8 different simulation types?  This reveals which methods are
# most sensitive to simulation-specific float operations.

# %%
# Normalise compute time within each agent count to remove scale effects
norm_data = []
for ac in sorted(main_df["agentCount"].unique()):
    ac_df = main_df[main_df["agentCount"] == ac].copy()
    if ac_df.empty:
        continue
    # Normalise by mean across all methods for this agent count
    overall_mean = ac_df["avgComputeTime"].mean()
    if overall_mean > 0:
        ac_df["norm_compute"] = ac_df["avgComputeTime"] / overall_mean
        norm_data.append(ac_df)

if norm_data:
    norm_df = pd.concat(norm_data)

    fig, ax = plt.subplots(figsize=(10, 6))

    data_to_plot = []
    labels = []
    method_colors = []
    for m in METHOD_ORDER:
        vals = norm_df[norm_df["method"] == m]["norm_compute"].dropna()
        if not vals.empty:
            data_to_plot.append(vals)
            labels.append(METHOD_LABELS.get(m, m))
            method_colors.append(get_method_color(m))

    bplot = ax.boxplot(data_to_plot, patch_artist=True, tick_labels=labels)
    for patch, c in zip(bplot["boxes"], method_colors):
        patch.set_facecolor(c)
        patch.set_alpha(0.7)

    ax.axhline(1.0, ls="--", color="gray", alpha=0.5)
    ax.set_ylabel("Normalised Compute Time (relative to cross-method mean)")
    ax.set_title("Compute Time Sensitivity to Simulation Type", fontweight="bold")
    save_figure(fig, "07_method_sensitivity")
    plt.show()

# %% [markdown]
# ## 17. Cross-simulation error proxy: stdDev scaling
#
# How does the absolute frame-time standard deviation scale with agent
# count for each simulation?  Simulations that exhibit super-linear
# growth in stdDev are more susceptible to floating-point instability.

# %%
fig, axes = plt.subplots(2, 4, figsize=(18, 9))
axes = axes.flatten()

for ax, sim in zip(axes, sorted(main_df["suite"].unique())):
    sim_df = main_df[main_df["suite"] == sim]
    for method in METHOD_ORDER:
        subset = sim_df[sim_df["method"] == method].sort_values("agentCount")
        if subset.empty or "frameTime_stdDev" not in subset.columns:
            continue
        ax.plot(subset["agentCount"], subset["frameTime_stdDev"],
                "o-", label=METHOD_LABELS.get(method, method),
                color=get_method_color(method), markersize=4)

    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_title(sim.capitalize(), fontweight="bold")
    ax.set_xlabel("Agent Count")
    ax.set_ylabel("Frame Time σ (ms)")

axes[0].legend(fontsize=7, loc="upper left")
fig.suptitle("Frame-Time Standard Deviation Scaling by Simulation",
             fontsize=14, fontweight="bold")
plt.tight_layout()
save_figure(fig, "07_stddev_scaling")
plt.show()

# %% [markdown]
# ## 18. Aggregated error summary table

# %%
# Compute per-sim stats
summary_rows = []
for sim in sorted(main_df["suite"].unique()):
    sim_df = main_df[main_df["suite"] == sim]
    for method in METHOD_ORDER:
        subset = sim_df[sim_df["method"] == method]
        if subset.empty:
            continue
        summary_rows.append({
            "Simulation": sim.capitalize(),
            "Method": METHOD_LABELS.get(method, method),
            "Mean CV": subset["frameTime_cv"].mean(),
            "Mean StdDev (ms)": subset["frameTime_stdDev"].mean(),
            "Mean P95/P50": (subset["frameTime_p95"] / subset["frameTime_p50"]).mean(),
        })

summary_table = pd.DataFrame(summary_rows)
print("=== Cross-Simulation Numerical Stability Summary ===")
print(summary_table.round(4).to_string(index=False))
