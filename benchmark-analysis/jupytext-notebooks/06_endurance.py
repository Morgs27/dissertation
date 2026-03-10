# ---
# jupyter:
#   jupytext:
#     text_representation:
#       format_name: percent
# ---

# %% [markdown]
# # 06 — Endurance & Thermal Stability
#
# **Research question:** How does performance change over 1000 seconds
# of sustained load? Is there evidence of thermal throttling?
#
# **Data:** endurance (4 sims) — sustained load over 1000s per run
#
# > Run `00_build_dataset.py` first to generate the parquet files.

# %%
import sys, os
sys.path.insert(0, os.path.abspath(".."))

import matplotlib.pyplot as plt
import numpy as np
import pandas as pd

from src import (
    apply_style, get_method_color, save_figure,
    METHOD_LABELS,
)

apply_style()

# %% [markdown]
# ## 1. Load pre-processed data

# %%
summary_df = pd.read_parquet("../processed/endurance_runs.parquet")
frames_df = pd.read_parquet("../processed/endurance_frames.parquet")
try:
    samples_df = pd.read_parquet("../processed/endurance_runtime_samples.parquet")
except FileNotFoundError:
    samples_df = pd.DataFrame()
    print("Warning: endurance_runtime_samples.parquet not found (needs rebuild).")
    
print(f"Runs: {len(summary_df)} | Frames: {len(frames_df)} | Samples: {len(samples_df)}")

print("\n=== Endurance Run Summaries ===")
print(summary_df[["suite", "method", "renderMode", "agentCount",
                   "executedFrames", "durationMs", "avgComputeTime"]].to_string(index=False))

# %% [markdown]
# ## 2. Frame-level time-series — compute time over 1000s

# %%
endurance_sims = sorted(frames_df["suite"].unique())

if len(endurance_sims) > 0:
    n_sims = len(endurance_sims)
    cols = min(n_sims, 2)
    rows = (n_sims + cols - 1) // cols

    # Linear scale plot
    fig_lin, axes_lin = plt.subplots(rows, cols, figsize=(8 * cols, 5 * rows))
    if n_sims == 1:
        axes_lin = [axes_lin]
    else:
        axes_lin = axes_lin.flatten()
        
    # Log scale plot
    fig_log, axes_log = plt.subplots(rows, cols, figsize=(8 * cols, 5 * rows))
    if n_sims == 1:
        axes_log = [axes_log]
    else:
        axes_log = axes_log.flatten()

    for i, sim in enumerate(endurance_sims):
        ax_lin = axes_lin[i]
        ax_log = axes_log[i]
        
        fdf = frames_df[frames_df["suite"] == sim]
        if fdf.empty:
            ax_lin.set_title(f"{sim} — no data")
            ax_log.set_title(f"{sim} — no data")
            continue

        valid_runs = fdf[["method", "renderMode"]].drop_duplicates().values
        
        
        valid_runs = [run for run in valid_runs if run[1] != "gpu"]

        for ax in [ax_lin, ax_log]:
            for method, render_mode in valid_runs:
                subset = fdf[(fdf["method"] == method) & (fdf["renderMode"] == render_mode)].sort_values("frameNumber")
                if subset.empty:
                    continue

                # Convert frame number to approximate seconds
                run_info = summary_df[
                    (summary_df["suite"] == sim) & (summary_df["method"] == method) & (summary_df["renderMode"] == render_mode)
                ]
                if not run_info.empty:
                    total_frames = run_info.iloc[0]["executedFrames"]
                    duration_s = run_info.iloc[0]["durationMs"] / 1000
                    subset = subset.copy()
                    subset["time_s"] = subset["frameNumber"] / total_frames * duration_s
                else:
                    subset = subset.copy()
                    subset["time_s"] = subset["frameNumber"]

                window = max(50, len(subset) // 100)
                rolling = subset["computeTime"].rolling(window, min_periods=1).mean()

                label_text = f"{METHOD_LABELS.get(method, method)} ({render_mode.upper()})" if method == "WebGPU" else METHOD_LABELS.get(method, method)
                ls = "--" if method == "WebGPU" and render_mode == "gpu" else "-"
                
                ax.plot(
                    subset["time_s"], rolling,
                    label=label_text,
                    color=get_method_color(method),
                    ls=ls,
                    alpha=0.8, linewidth=1,
                )

            ax.set_xlabel("Time (seconds)")
            ax.set_ylabel("Compute Time — Rolling Avg (ms)")
            ax.set_title(f"{sim}", fontweight="bold")
            ax.legend(fontsize=8, loc="upper right")
            
        ax_log.set_yscale("log")

    # Hide unused axes
    for ax in axes_lin[n_sims:]:
        ax.set_visible(False)
    for ax in axes_log[n_sims:]:
        ax.set_visible(False)

    # fig_lin.suptitle("Endurance: Compute Time", fontsize=14, fontweight="bold")
    # fig_lin.tight_layout()
    # save_figure(fig_lin, "06_endurance_timeseries_linear")
    # plt.show()
    
    fig_log.suptitle("Endurance Test - Compute Time - 1000 Seconds", fontsize=14, fontweight="bold")
    fig_log.tight_layout()
    save_figure(fig_log, "06_endurance_timeseries_log")
    plt.show()

# %% [markdown]
# ## 2b. Battery level over time
# 
# How does each method drain the device battery over 1000s?

# %%
if not samples_df.empty and "battery_level" in samples_df.columns:
    battery_usage = []
    
    for sim in endurance_sims:
        sdf = samples_df[samples_df["suite"] == sim]
        if sdf.empty:
            continue

        for method, render_mode in sdf[["method", "renderMode"]].drop_duplicates().values:
            subset = sdf[(sdf["method"] == method) & (sdf["renderMode"] == render_mode)].sort_values("timestamp")
            if subset.empty or subset["battery_level"].isna().all():
                continue

            start_level = subset["battery_level"].iloc[0] * 100
            end_level = subset["battery_level"].iloc[-1] * 100
            used_pct = start_level - end_level
            
            battery_usage.append({
                "simulation": sim,
                "method": method,
                "renderMode": render_mode,
                "display_name": f"{method}\n({render_mode.upper()})" if method == "WebGPU" else method,
                "used_pct": used_pct
            })
            
    if battery_usage:
        bat_df = pd.DataFrame(battery_usage)
        
        fig, ax = plt.subplots(figsize=(10, 5))
        
        x = np.arange(len(bat_df))
        ax.bar(x, bat_df["used_pct"], 
               color=[get_method_color(m) for m in bat_df["method"]],
               hatch=["//" if m == "WebGPU" and r == "gpu" else "" for m, r in zip(bat_df["method"], bat_df["renderMode"])],
               alpha=0.8, edgecolor="white")
               
        labels = [f"{r['simulation']}\n{r['display_name']}" for _, r in bat_df.iterrows()]
        ax.set_xticks(x)
        ax.set_xticklabels(labels, fontsize=8)
        ax.set_ylabel("Battery Depleted (%)")
        ax.set_title("Battery Drain Over 1000 Seconds Simulation Run")
        
        # Add value labels on top of bars
        for i, pct in enumerate(bat_df["used_pct"]):
            ax.text(i, pct + 0.2, f"{pct:.1f}%", ha='center', fontsize=9, fontweight='bold')
            
        plt.tight_layout()
        save_figure(fig, "06_endurance_battery_bar")
        plt.show()
    else:
        print("No valid battery drain data found after filtering.")

# %% [markdown]
# ## 3. Thermal throttling & System Stability detection
#
# Compare performance in the first 10% vs last 10% of frames.
# Also look at P99 frame latency (spikes) and Event Loop Canary Drift,
# which are better indicators of background hardware throttling than average frame times.

# %%
stability = []
for sim in endurance_sims:
    fdf = frames_df[frames_df["suite"] == sim]
    if fdf.empty:
        continue

    for method, render_mode in fdf[["method", "renderMode"]].drop_duplicates().values:
        subset = fdf[(fdf["method"] == method) & (fdf["renderMode"] == render_mode)].sort_values("frameNumber")
        if len(subset) < 100:
            continue

        run_info = summary_df[
            (summary_df["suite"] == sim) & (summary_df["method"] == method)
        ]
        if run_info.empty:
            continue

        total_frames = int(run_info.iloc[0]["executedFrames"])
        duration_s = run_info.iloc[0]["durationMs"] / 1000

        n_window = max(100, total_frames // 10)
        first = subset.head(n_window)["computeTime"]
        last = subset.tail(n_window)["computeTime"]

        stability.append({
            "simulation": sim,
            "method": method,
            "renderMode": render_mode,
            "display_name": f"{method}\n({render_mode.upper()})" if method == "WebGPU" else method,
            "first_mean_ms": first.mean(),
            "last_mean_ms": last.mean(),
            "first_p99_ms": first.quantile(0.99),
            "last_p99_ms": last.quantile(0.99),
            "slowdown_pct": ((last.mean() - first.mean()) / first.mean()) * 100,
            "p99_increase_pct": ((last.quantile(0.99) - first.quantile(0.99)) / first.quantile(0.99)) * 100,
            "total_frames": total_frames,
            "duration_s": duration_s,
        })

stab_df = pd.DataFrame(stability)
print("=== Thermal Stability: First 10% vs Last 10% ===")
print(stab_df[["simulation", "display_name", "slowdown_pct", "p99_increase_pct"]].round(2).to_string(index=False))

# %%
fig, (ax1, ax2) = plt.subplots(2, 1, figsize=(10, 10))

x = np.arange(len(stab_df))
width = 0.35

# Plot 1: Mean impact
ax1.bar(x - width/2, stab_df["first_mean_ms"], width,
       label="First 10%", color=[get_method_color(m) for m in stab_df["method"]],
       hatch=["//" if m == "WebGPU" and r == "gpu" else "" for m, r in zip(stab_df["method"], stab_df["renderMode"])],
       alpha=0.5, edgecolor="white")
ax1.bar(x + width/2, stab_df["last_mean_ms"], width,
       label="Last 10%", color=[get_method_color(m) for m in stab_df["method"]],
       hatch=["//" if m == "WebGPU" and r == "gpu" else "" for m, r in zip(stab_df["method"], stab_df["renderMode"])],
       alpha=1.0, edgecolor="white")

labels = [f"{r['simulation']}\n{r['display_name']}" for _, r in stab_df.iterrows()]
ax1.set_xticks(x)
ax1.set_xticklabels(labels, fontsize=8)
ax1.set_ylabel("Avg Compute Time (ms)")
ax1.set_title("First 10% vs Last 10% of Frames — Mean Compute Time")
ax1.legend()

for i, (_, row) in enumerate(stab_df.iterrows()):
    pct = row["slowdown_pct"]
    color = "#EE6677" if pct > 5 else "#228833"
    ax1.annotate(f"{pct:+.1f}%", (i, max(row["first_mean_ms"], row["last_mean_ms"]) * 1.05),
                ha="center", fontsize=8, fontweight="bold", color=color)

# Plot 2: P99 impact (Latency Spikes)
ax2.bar(x - width/2, stab_df["first_p99_ms"], width,
       label="First 10%", color=[get_method_color(m) for m in stab_df["method"]],
       hatch=["//" if m == "WebGPU" and r == "gpu" else "" for m, r in zip(stab_df["method"], stab_df["renderMode"])],
       alpha=0.5, edgecolor="white")
ax2.bar(x + width/2, stab_df["last_p99_ms"], width,
       label="Last 10%", color=[get_method_color(m) for m in stab_df["method"]],
       hatch=["//" if m == "WebGPU" and r == "gpu" else "" for m, r in zip(stab_df["method"], stab_df["renderMode"])],
       alpha=1.0, edgecolor="white")

ax2.set_xticks(x)
ax2.set_xticklabels(labels, fontsize=8)
ax2.set_ylabel("99th Percentile Compute Time (ms)")
ax2.set_title("First 10% vs Last 10% of Frames — Latency Spikes (P99)")
ax2.set_yscale("log") # P99 can be huge compared to mean
ax2.legend()

for i, (_, row) in enumerate(stab_df.iterrows()):
    pct = row["p99_increase_pct"]
    color = "#EE6677" if pct > 10 else "#228833"
    # For log scale annotation placement requires care, simple heuristic:
    y_pos = max(row["first_p99_ms"], row["last_p99_ms"]) * 1.2
    ax2.annotate(f"{pct:+.0f}%", (i, y_pos),
                ha="center", fontsize=8, fontweight="bold", color=color)

plt.tight_layout()
save_figure(fig, "06_thermal_stability_mean_and_p99")
plt.show()

# %%

# 1. Initialize a single plot instead of two
fig, ax2 = plt.subplots(1, 1, figsize=(10, 6)) # Adjusted height for a single plot

x = np.arange(len(stab_df))
width = 0.35
labels = [f"{r['simulation']}\n{r['display_name']}" for _, r in stab_df.iterrows()]

# Plot: P99 impact (Latency Spikes)
ax2.bar(x - width/2, stab_df["first_p99_ms"], width,
       label="First 10%", color=[get_method_color(m) for m in stab_df["method"]],
       hatch=["//" if m == "WebGPU" and r == "gpu" else "" for m, r in zip(stab_df["method"], stab_df["renderMode"])],
       alpha=0.5, edgecolor="white")

ax2.bar(x + width/2, stab_df["last_p99_ms"], width,
       label="Last 10%", color=[get_method_color(m) for m in stab_df["method"]],
       hatch=["//" if m == "WebGPU" and r == "gpu" else "" for m, r in zip(stab_df["method"], stab_df["renderMode"])],
       alpha=1.0, edgecolor="white")

ax2.set_xticks(x)
ax2.set_xticklabels(labels, fontsize=8)
ax2.set_ylabel("99th Percentile Compute Time (ms)")
ax2.set_title("First 10% vs Last 10% of Frames — Latency Spikes (P99)")
ax2.set_yscale("log") 
ax2.legend()

# --- Padding Logic ---
# Find the highest value in the P99 columns to set a custom limit
max_val = max(stab_df["first_p99_ms"].max(), stab_df["last_p99_ms"].max())
# Increase by 300% (4x) for log scale headroom, or 50% (1.5x) for linear
ax2.set_ylim(top=max_val * 4) 

for i, (_, row) in enumerate(stab_df.iterrows()):
    pct = row["p99_increase_pct"]
    color = "#EE6677" if pct > 0 else "#228833"
    # Position annotation slightly above the tallest bar
    y_pos = max(row["first_p99_ms"], row["last_p99_ms"]) * 1.2
    ax2.annotate(f"{pct:+.0f}%", (i, y_pos),
                ha="center", fontsize=12, fontweight="bold", color=color)

plt.tight_layout()
save_figure(fig, "06_thermal_stability_p99_only")
plt.show()

# %% [markdown]
# ## 3b. Event Loop Canary Drift
#
# Drift represents CPU scheduler starvation -> a key sign of background thermal throttling.

# %%
if not samples_df.empty and "thermalCanary_driftMs" in samples_df.columns:
    # We'll plot max drift over rolling windows to show if the system "struggled to breathe"
    fig, axes = plt.subplots(rows, cols, figsize=(8 * cols, 5 * rows))
    if n_sims == 1:
        axes = [axes]
    else:
        axes = axes.flatten()

    for ax, sim in zip(axes, endurance_sims):
        sdf = samples_df[samples_df["suite"] == sim]
        if sdf.empty:
             continue
             
        for method, render_mode in sdf[["method", "renderMode"]].drop_duplicates().values:
            subset = sdf[(sdf["method"] == method) & (sdf["renderMode"] == render_mode)].sort_values("timestamp")
            if subset.empty or subset["thermalCanary_driftMs"].isna().all():
                continue

            time_s = subset["elapsedMs"] / 1000.0
            label_text = f"{METHOD_LABELS.get(method, method)} ({render_mode.upper()})" if method == "WebGPU" else METHOD_LABELS.get(method, method)
            ls = "--" if method == "WebGPU" and render_mode == "gpu" else "-"
            ax.plot(
                time_s, subset["thermalCanary_driftMs"],
                label=label_text,
                color=get_method_color(method), alpha=0.8, ls=ls, linewidth=1,
            )

        ax.set_xlabel("Time (seconds)")
        ax.set_ylabel("Canary Drift (ms)")
        ax.set_title(f"{sim} Canary Drift", fontweight="bold")
        ax.legend(fontsize=8)
        
    for ax in axes[n_sims:]:
        ax.set_visible(False)

    fig.suptitle("Event Loop Canary Drift (Thermal Throttling Indicator)", fontsize=14, fontweight="bold")
    plt.tight_layout()
    save_figure(fig, "06_thermal_canary_drift")
    plt.show()

# %% [markdown]
# ## 4. Frame-time variance over time

# %%
def plot_rolling_metric(metric_name, ylabel, title, y_scale='linear', 
                        sims_to_plot=endurance_sims, methods_to_plot=None):
    n_sims = len(sims_to_plot)
    cols = min(n_sims, 2)
    rows = (n_sims + cols - 1) // cols
    
    fig, axes = plt.subplots(rows, cols, figsize=(8 * cols, 5 * rows))
    if n_sims == 1:
        axes = [axes]
    else:
        axes = axes.flatten()

    for ax, sim in zip(axes, sims_to_plot):
        fdf = frames_df[frames_df["suite"] == sim]
        if fdf.empty:
            continue

        valid_runs = fdf[["method", "renderMode"]].drop_duplicates().values
        
        valid_runs = [run for run in valid_runs if run[1] != "gpu"]

        for method, render_mode in valid_runs:
            if methods_to_plot and method not in methods_to_plot:
                continue
            subset = fdf[(fdf["method"] == method) & (fdf["renderMode"] == render_mode)].sort_values("frameNumber").copy()
            if len(subset) < 100:
                continue

            window = max(100, len(subset) // 20)
            
            if metric_name == "std":
                metric_vals = subset["computeTime"].rolling(window, min_periods=50).std()
            elif metric_name == "cv":
                rolling_mean = subset["computeTime"].rolling(window, min_periods=50).mean()
                rolling_std = subset["computeTime"].rolling(window, min_periods=50).std()
                metric_vals = rolling_std / rolling_mean
            elif metric_name == "p99":
                metric_vals = subset["computeTime"].rolling(window, min_periods=50).quantile(0.99)
            elif metric_name == "fps":
                rolling_mean_ms = subset["computeTime"].rolling(window, min_periods=50).mean()
                metric_vals = 1000.0 / rolling_mean_ms

            run_info = summary_df[
                (summary_df["suite"] == sim) & (summary_df["method"] == method)
            ]
            if not run_info.empty:
                total_frames = int(run_info.iloc[0]["executedFrames"])
                duration_s = run_info.iloc[0]["durationMs"] / 1000
                time_s = subset["frameNumber"].values / total_frames * duration_s
            else:
                time_s = subset["frameNumber"].values

            label_text = f"{METHOD_LABELS.get(method, method)} ({render_mode.upper()})" if method == "WebGPU" else METHOD_LABELS.get(method, method)
            ls = "--" if method == "WebGPU" and render_mode == "gpu" else "-"
            ax.plot(time_s, metric_vals,
                    label=label_text,
                    color=get_method_color(method), ls=ls, alpha=0.8)

        ax.set_xlabel("Time (seconds)")
        ax.set_ylabel(ylabel)
        ax.set_title(f"{sim}", fontweight="bold")
        ax.set_yscale(y_scale)
        if metric_name == "cv":
            ax.axhline(0.1, ls="--", color="gray", alpha=0.3)
        ax.legend(fontsize=8, loc="center right", bbox_to_anchor=(1.0, 0.7))

    for ax in axes[n_sims:]:
        ax.set_visible(False)

    fig.suptitle(title, fontsize=14, fontweight="bold")
    plt.tight_layout()
    return fig

# All sims variance (linear)
fig_var_linear = plot_rolling_metric("std", "Compute Time Std Dev (ms)", 
                                   "Compute Time Variability Over Time (rolling σ)")
save_figure(fig_var_linear, "06_variance_over_time_linear")
plt.show()

# All sims variance (log)
fig_var_log = plot_rolling_metric("std", "Compute Time Std Dev (ms) - Log", 
                                        "Compute Time Variability Over Time (rolling σ)", 
                                        y_scale='log')
save_figure(fig_var_log, "06_variance_over_time_log")
plt.show()


# %% [markdown]
# ## 4b. Frame-time stability (Coefficient of Variation) over time
#
# Coefficient of Variation (CV = σ / μ) normalizes variance by the mean compute time,
# allowing fair stability comparison between fast and slow methods.

# %%
# All sims stability (linear)
fig_cv_linear = plot_rolling_metric("cv", "Compute Time CV (σ/μ)", 
                                  "Relative Stability Over Time (Coefficient of Variation)")
save_figure(fig_cv_linear, "06_cv_over_time_linear")
plt.show()

# All sims stability (log)
fig_cv_log = plot_rolling_metric("cv", "Compute Time CV (σ/μ) - Log", 
                                       "Relative Stability Over Time (Coefficient of Variation)", 
                                       y_scale='log')
save_figure(fig_cv_log, "06_cv_over_time_log")
plt.show()


# %% [markdown]
# ## 4c. P99 Latency (Jitter/Stutter) over time

# %%
fig_p99 = plot_rolling_metric("p99", "99th Percentile Compute Time (ms)", 
                             "P99 Frame Latency Over Time (Jitter)")
save_figure(fig_p99, "06_p99_over_time")
plt.show()

# %% [markdown]
# ## 5. Throughput comparison

# %%
fig, ax = plt.subplots(figsize=(9, 5))

throughput = summary_df[["suite", "method", "renderMode", "executedFrames"]].copy()
throughput["display_name"] = throughput.apply(lambda r: f"{r['method']} ({r['renderMode'].upper()})" if r['method'] == 'WebGPU' else r['method'], axis=1)
throughput["fps"] = throughput["executedFrames"] / 1000

pivot = throughput.pivot_table(index="suite", columns="display_name", values="fps")
colors = [get_method_color(m.split(" ")[0]) for m in pivot.columns]
hatches = ["//" if "(GPU)" in m else "" for m in pivot.columns]

pivot.plot.bar(ax=ax, color=colors, edgecolor="white")
for i, bar in enumerate(ax.patches):
    col_idx = i // len(pivot.index)
    if col_idx < len(hatches):
        bar.set_hatch(hatches[col_idx])
ax.set_ylabel("Average FPS (frames / second)")
ax.set_title("Sustained Throughput Over 1000 Seconds")
ax.set_xticklabels(pivot.index, rotation=0)
ax.legend(title="Method", **({"fontsize": 8} if len(pivot.columns) > 3 else {}))
save_figure(fig, "06_endurance_throughput")
plt.show()

# %% [markdown]
# ## 5b. Frame Throughput (FPS) over time

# %%
fig_fps = plot_rolling_metric("fps", "Throughput (FPS)", 
                             "Frame Throughput (FPS) Over Time")
save_figure(fig_fps, "06_fps_over_time")
plt.show()
