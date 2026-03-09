# ---
# jupyter:
#   jupytext:
#     text_representation:
#       format_name: percent
# ---

# %% [markdown]
# # 05 — Cross-Device Performance Analysis
#
# **Research question:** How do performance profiles differ across
# four distinct hardware classes? Which compute methods degrade most
# on constrained devices, and which benefit most from a discrete GPU?
#
# **Devices:**
# | Device | Class | Key Spec |
# |---|---|---|
# | MacBook Pro (M4 Pro) | Desktop (baseline) | Apple M4 Pro, 20-core GPU |
# | GPU Machine (RTX 4060) | Desktop (discrete GPU) | NVIDIA RTX 4060, i5-14500 |
# | Chromebook | Low-end laptop | TBD |
# | Pixel 9 Pro | Mobile | Android 16 |
#
# **Data:** boids & slime across all devices
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
    compare_methods,
    timing_breakdown,
    apply_style, get_method_color, save_figure,
    METHOD_ORDER, METHOD_LABELS, METHOD_COLORS,
)

apply_style()

# %% [markdown]
# ## 1. Load & Prepare Data

# %%
# ── Load all four device datasets ─────────────────────────────────────────
sweep_df = pd.read_parquet("../processed/basic_sweeps.parquet")
mob_df   = pd.read_parquet("../processed/mobile.parquet")
cb_df    = pd.read_parquet("../processed/chromebook.parquet")
gpu_df   = pd.read_parquet("../processed/gpu_machine.parquet")

# ── Normalise suite names across datasets ─────────────────────────────────
SUITE_NORMALIZE = {
    "Boids": "boids",
    "Slime Mold": "slime",
    "slime_mold": "slime",
    "slime-mold": "slime",
}

def normalize_suite(name):
    return SUITE_NORMALIZE.get(name, name.lower().replace(" ", "_").replace("-", "_"))

for df in [sweep_df, mob_df, cb_df, gpu_df]:
    df["suite"] = df["suite"].map(normalize_suite)

# ── Device metadata ───────────────────────────────────────────────────────
DEVICES = {
    "MacBook (M4 Pro)":   {"source": sweep_df, "cls": "Desktop",      "short": "MacBook"},
    "GPU Machine (RTX 4060)": {"source": gpu_df,   "cls": "Desktop (dGPU)", "short": "GPU PC"},
    "Chromebook":         {"source": cb_df,    "cls": "Low-end",      "short": "Chromebook"},
    "Pixel 9 Pro":        {"source": mob_df,   "cls": "Mobile",       "short": "Pixel"},
}

DEVICE_ORDER = list(DEVICES.keys())
DEVICE_SHORT = {k: v["short"] for k, v in DEVICES.items()}
DEVICE_COLORS = {
    "MacBook (M4 Pro)":        "#4477AA",
    "GPU Machine (RTX 4060)":  "#228833",
    "Chromebook":              "#EE6677",
    "Pixel 9 Pro":             "#AA3377",
}

# %%
def best_per_method(df):
    """Reduce variants to best config per method × sim × agentCount (CPU render only)."""
    out = df[df["renderMode"] == "cpu"].copy()
    # For WebWorkers: pick best worker count
    ww = out[out["method"] == "WebWorkers"]
    if not ww.empty:
        best_ww = ww.loc[ww.groupby(["suite", "agentCount"])["avgComputeTime"].idxmin()]
        out = pd.concat([out[out["method"] != "WebWorkers"], best_ww])
    # For WebAssembly: pick best SIMD/scalar variant
    wa = out[out["method"] == "WebAssembly"]
    if not wa.empty:
        best_wa = wa.loc[wa.groupby(["suite", "agentCount"])["avgComputeTime"].idxmin()]
        out = pd.concat([out[out["method"] != "WebAssembly"], best_wa])
    return out.reset_index(drop=True)

# ── Build combined dataset ────────────────────────────────────────────────
parts = []
for device_name, meta in DEVICES.items():
    src = meta["source"]
    sdf = best_per_method(src)
    sdf["device"] = device_name
    parts.append(sdf)

combined = pd.concat(parts, ignore_index=True)
sims_to_compare = sorted(set.intersection(*(set(d["source"]["suite"].unique()) for d in DEVICES.values())))

print(f"Shared simulations: {sims_to_compare}")
for dev in DEVICE_ORDER:
    n = len(combined[combined["device"] == dev])
    print(f"  {dev}: {n} runs")

# %% [markdown]
# ## 2. Multi-Device Scaling Comparison
#
# For each shared simulation, plot compute time vs agent count for all four
# devices side-by-side.

# %%
for sim in sims_to_compare:
    sim_data = combined[combined["suite"] == sim]
    methods_present = [m for m in METHOD_ORDER if m in sim_data["method"].unique()]

    fig, axes = plt.subplots(1, len(DEVICE_ORDER), figsize=(5 * len(DEVICE_ORDER), 5), sharey=True)
    if len(DEVICE_ORDER) == 1:
        axes = [axes]

    for ax, device in zip(axes, DEVICE_ORDER):
        dev_df = sim_data[sim_data["device"] == device]
        for method in methods_present:
            subset = dev_df[dev_df["method"] == method].sort_values("agentCount")
            if subset.empty:
                continue
            ax.plot(
                subset["agentCount"], subset["avgComputeTime"],
                label=METHOD_LABELS.get(method, method),
                color=get_method_color(method),
                marker="o", markersize=4, linewidth=1.5,
            )
        ax.set_xscale("log")
        ax.set_yscale("log")
        ax.set_xlabel("Agent Count")
        if ax == axes[0]:
            ax.set_ylabel("Avg Compute Time (ms)")
        ax.set_title(DEVICE_SHORT[device], fontweight="bold")
        ax.legend(fontsize=7, loc="upper left")

    fig.suptitle(f"{sim.capitalize()} — Scaling Across Devices", fontsize=14, fontweight="bold")
    plt.tight_layout()
    save_figure(fig, f"05_scaling_{sim}")
    plt.show()

# %% [markdown]
# ## 3. Performance Ratio: Every Device vs MacBook Baseline
#
# For each method and agent count, compute `device_time / macbook_time`.
# A ratio >1 means the device is slower than the MacBook.

# %%
baseline = combined[combined["device"] == "MacBook (M4 Pro)"]
other_devices = [d for d in DEVICE_ORDER if d != "MacBook (M4 Pro)"]

ratio_parts = []
for dev in other_devices:
    dev_data = combined[combined["device"] == dev]
    merged = baseline.merge(
        dev_data,
        on=["suite", "method", "agentCount"],
        suffixes=("_base", "_dev"),
        how="inner",
    )
    merged["slowdown"] = merged["avgComputeTime_dev"] / merged["avgComputeTime_base"]
    merged["device"] = dev
    ratio_parts.append(merged)

ratio_df = pd.concat(ratio_parts, ignore_index=True)

fig, axes = plt.subplots(1, len(other_devices), figsize=(6 * len(other_devices), 5), sharey=True)
if len(other_devices) == 1:
    axes = [axes]

for ax, dev in zip(axes, other_devices):
    dev_ratio = ratio_df[ratio_df["device"] == dev]
    for method in METHOD_ORDER:
        subset = dev_ratio[dev_ratio["method"] == method]
        if subset.empty:
            continue
        avg = subset.groupby("agentCount")["slowdown"].mean().reset_index()
        ax.plot(
            avg["agentCount"], avg["slowdown"],
            "o-", label=METHOD_LABELS.get(method, method),
            color=get_method_color(method), markersize=5,
        )
    ax.axhline(1.0, ls="--", color="gray", alpha=0.5)
    ax.set_xscale("log")
    ax.set_xlabel("Agent Count")
    if ax == axes[0]:
        ax.set_ylabel("Slowdown vs MacBook (×)")
    ax.set_title(DEVICE_SHORT[dev], fontweight="bold")
    ax.legend(fontsize=7)

fig.suptitle("Performance Ratio: Each Device vs MacBook M4 Pro", fontsize=14, fontweight="bold")
plt.tight_layout()
save_figure(fig, "05_performance_ratio")
plt.show()

# %% [markdown]
# ## 4. Slowdown Heatmap: Method × Device
#
# Mean slowdown ratio across all agent counts and simulations,
# displayed as a heatmap for quick comparison.

# %%
heat_data = ratio_df.groupby(["device", "method"])["slowdown"].mean().unstack()
# Reorder
heat_data = heat_data.reindex(
    index=[d for d in other_devices if d in heat_data.index],
    columns=[m for m in METHOD_ORDER if m in heat_data.columns],
)

fig, ax = plt.subplots(figsize=(8, 4))
im = ax.imshow(heat_data.values, cmap="RdYlGn_r", aspect="auto", vmin=0.5)
ax.set_xticks(range(len(heat_data.columns)))
ax.set_xticklabels([METHOD_LABELS.get(m, m) for m in heat_data.columns], fontsize=10)
ax.set_yticks(range(len(heat_data.index)))
ax.set_yticklabels([DEVICE_SHORT.get(d, d) for d in heat_data.index], fontsize=10)

# Annotate cells
for i in range(len(heat_data.index)):
    for j in range(len(heat_data.columns)):
        val = heat_data.values[i, j]
        if not np.isnan(val):
            color = "white" if val > 5 else "black"
            ax.text(j, i, f"{val:.1f}×", ha="center", va="center", fontsize=11, fontweight="bold", color=color)

cbar = fig.colorbar(im, ax=ax, label="Slowdown vs MacBook (×)")
ax.set_title("Mean Slowdown Heatmap (vs MacBook M4 Pro)", fontweight="bold", fontsize=13)
fig.subplots_adjust(left=0.15, right=0.95)
save_figure(fig, "05_slowdown_heatmap")
plt.show()

# %% [markdown]
# ## 5. Method Degradation Ranking
#
# Which compute method degrades the most on each non-baseline device?
# Horizontal bar charts with error bars.

# %%
fig, axes = plt.subplots(1, len(other_devices), figsize=(6 * len(other_devices), 4), sharey=True)
if len(other_devices) == 1:
    axes = [axes]

for ax, dev in zip(axes, other_devices):
    dev_ratio = ratio_df[ratio_df["device"] == dev]
    method_avg = dev_ratio.groupby("method")["slowdown"].agg(["mean", "std"]).reset_index()
    method_avg = method_avg.sort_values("mean", ascending=True)

    colors = [get_method_color(m) for m in method_avg["method"]]
    ax.barh(
        [METHOD_LABELS.get(m, m) for m in method_avg["method"]],
        method_avg["mean"],
        xerr=method_avg["std"],
        color=colors, edgecolor="white", capsize=3,
    )
    ax.axvline(1.0, ls="--", color="gray", alpha=0.5)
    ax.set_xlabel("Slowdown Ratio (×)")
    ax.set_title(DEVICE_SHORT[dev], fontweight="bold")

fig.suptitle("Method Degradation by Device (vs MacBook)", fontsize=14, fontweight="bold")
plt.tight_layout()
save_figure(fig, "05_method_degradation")
plt.show()

# %% [markdown]
# ## 6. Timing Breakdown by Device
#
# Stacked bar chart showing how each device spends its time
# (setup / compute / readback / render) at a representative agent count.

# %%
# Pick a representative agent count present on all devices
all_counts = combined.groupby("device")["agentCount"].apply(set)
shared_counts = sorted(set.intersection(*all_counts))
representative_count = shared_counts[len(shared_counts) // 2] if shared_counts else 1000
print(f"Using agent count = {representative_count} for timing breakdown")

timing_cols = ["avgSetupTime", "avgComputeTime", "avgReadbackTime", "avgRenderTime"]
timing_labels = ["Setup", "Compute", "Readback", "Render"]
timing_colors = ["#66c2a5", "#fc8d62", "#8da0cb", "#e78ac3"]

for sim in sims_to_compare:
    fig, ax = plt.subplots(figsize=(12, 5))
    x_labels = []
    x_pos = []
    pos = 0

    for device in DEVICE_ORDER:
        dev_data = combined[
            (combined["device"] == device)
            & (combined["suite"] == sim)
            & (combined["agentCount"] == representative_count)
        ]
        methods_here = [m for m in METHOD_ORDER if m in dev_data["method"].unique()]

        for method in methods_here:
            row = dev_data[dev_data["method"] == method]
            if row.empty:
                continue
            bottom = 0
            for col, label, color in zip(timing_cols, timing_labels, timing_colors):
                if col in row.columns:
                    val = row[col].values[0]
                    if pd.notna(val) and val > 0:
                        ax.bar(pos, val, bottom=bottom, color=color,
                               label=label if pos == 0 else "", edgecolor="white", width=0.7)
                        bottom += val
            x_labels.append(f"{DEVICE_SHORT[device]}\n{METHOD_LABELS.get(method, method)}")
            x_pos.append(pos)
            pos += 1
        pos += 0.5  # Gap between devices

    ax.set_xticks(x_pos)
    ax.set_xticklabels(x_labels, fontsize=7, rotation=45, ha="right")
    ax.set_ylabel("Time (ms)")
    ax.set_title(f"{sim.capitalize()} — Timing Breakdown at {representative_count} Agents", fontweight="bold")
    # De-duplicate legend
    handles, labels = ax.get_legend_handles_labels()
    by_label = dict(zip(labels, handles))
    ax.legend(by_label.values(), by_label.keys(), fontsize=8)
    plt.tight_layout()
    save_figure(fig, f"05_timing_breakdown_{sim}")
    plt.show()

# %% [markdown]
# ## 7. Method Ranking by Device
#
# At each agent count, which method is fastest? This table
# reveals whether the optimal backend changes depending on hardware.

# %%
for sim in sims_to_compare:
    sim_data = combined[combined["suite"] == sim]
    fastest = (
        sim_data.loc[sim_data.groupby(["device", "agentCount"])["avgComputeTime"].idxmin()]
        [["device", "agentCount", "method", "avgComputeTime"]]
    )
    pivot = fastest.pivot_table(index="agentCount", columns="device", values="method", aggfunc="first")
    # Reorder columns
    pivot = pivot[[d for d in DEVICE_ORDER if d in pivot.columns]]
    pivot.columns = [DEVICE_SHORT.get(c, c) for c in pivot.columns]
    print(f"\n{'='*60}")
    print(f"  {sim.capitalize()} — Fastest Method per Agent Count")
    print(f"{'='*60}")
    print(pivot.to_string())

# %% [markdown]
# ## 8. Cross-Device Variability
#
# How consistent is each method across devices? Low coefficient of
# variation (CV) means the method performs similarly everywhere.

# %%
cv_data = (
    combined.groupby(["suite", "method", "agentCount"])["avgComputeTime"]
    .agg(["mean", "std", "count"])
    .reset_index()
)
cv_data["cv"] = cv_data["std"] / cv_data["mean"]
# Only keep agent counts with data from all devices
cv_data = cv_data[cv_data["count"] >= len(DEVICE_ORDER)]

if not cv_data.empty:
    fig, ax = plt.subplots(figsize=(10, 5))
    for method in METHOD_ORDER:
        subset = cv_data[cv_data["method"] == method]
        if subset.empty:
            continue
        avg_cv = subset.groupby("agentCount")["cv"].mean().reset_index()
        ax.plot(
            avg_cv["agentCount"], avg_cv["cv"],
            "o-", label=METHOD_LABELS.get(method, method),
            color=get_method_color(method), markersize=5,
        )

    ax.set_xscale("log")
    ax.set_xlabel("Agent Count")
    ax.set_ylabel("Coefficient of Variation (across devices)")
    ax.set_title("Cross-Device Variability by Method", fontweight="bold", fontsize=13)
    ax.legend()
    save_figure(fig, "05_cross_device_cv")
    plt.show()
else:
    print("Not enough shared agent counts across all devices for CV analysis.")

# %% [markdown]
# ## 9. Per-Method Cross-Device Overlay
#
# For each method, overlay all four devices' scaling curves.

# %%
n_methods = len(METHOD_ORDER)
fig, axes = plt.subplots(2, 2, figsize=(14, 10), sharex=True)
axes = axes.flatten()

for ax, method in zip(axes, METHOD_ORDER):
    subset = combined[combined["method"] == method]
    if subset.empty:
        continue

    for sim, marker in zip(sims_to_compare, ["o", "s", "^", "D"]):
        for dev in DEVICE_ORDER:
            plot_data = subset[
                (subset["suite"] == sim) & (subset["device"] == dev)
            ].sort_values("agentCount")
            if not plot_data.empty:
                ax.plot(
                    plot_data["agentCount"], plot_data["avgComputeTime"],
                    label=f"{sim.capitalize()} ({DEVICE_SHORT[dev]})",
                    color=DEVICE_COLORS[dev], marker=marker,
                    linestyle="-", markersize=4, linewidth=1.2, alpha=0.85,
                )

    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_title(METHOD_LABELS.get(method, method), fontweight="bold")
    ax.set_ylabel("Avg Compute Time (ms)")

# Add x-labels to bottom row
for ax in axes[-2:]:
    ax.set_xlabel("Agent Count")

# Single legend
axes[0].legend(fontsize=6, loc="upper left", ncol=2)
fig.suptitle("Cross-Device Overlay by Method", fontsize=14, fontweight="bold")
plt.tight_layout()
save_figure(fig, "05_cross_device_overlay")
plt.show()

# %% [markdown]
# ## 10. GPU Render Mode: CPU vs GPU Render Path
#
# Where available, compare CPU vs GPU render modes for WebGPU on each device.

# %%
render_devices = {
    "Pixel 9 Pro": mob_df,
    "Chromebook": cb_df,
    "GPU Machine (RTX 4060)": gpu_df,
    "MacBook (M4 Pro)": sweep_df,
}

has_render_data = False
fig, ax = plt.subplots(figsize=(10, 6))

for dev_name, src_df in render_devices.items():
    gpu_data = src_df[(src_df["method"] == "WebGPU")].copy()
    gpu_data["suite"] = gpu_data["suite"].map(normalize_suite)
    render_pivot = gpu_data.pivot_table(
        index=["suite", "agentCount"],
        columns="renderMode",
        values="avgComputeTime",
    ).reset_index()

    if "cpu" in render_pivot.columns and "gpu" in render_pivot.columns:
        render_pivot["gpu_speedup"] = render_pivot["cpu"] / render_pivot["gpu"]
        for sim in sims_to_compare:
            sub = render_pivot[render_pivot["suite"] == sim].sort_values("agentCount")
            if not sub.empty:
                has_render_data = True
                ax.plot(
                    sub["agentCount"], sub["gpu_speedup"],
                    "o-", label=f"{sim.capitalize()} ({DEVICE_SHORT[dev_name]})",
                    color=DEVICE_COLORS[dev_name], markersize=4, alpha=0.8,
                )

if has_render_data:
    ax.axhline(1.0, ls="--", color="gray", alpha=0.5, label="Parity")
    ax.set_xscale("log")
    ax.set_xlabel("Agent Count")
    ax.set_ylabel("GPU Render Speedup over CPU Render")
    ax.set_title("WebGPU: GPU vs CPU Render Mode Across Devices", fontweight="bold")
    ax.legend(fontsize=8)
    save_figure(fig, "05_render_mode_comparison")
    plt.show()
else:
    plt.close(fig)
    print("No GPU vs CPU render mode data available for comparison.")

# %% [markdown]
# ## 11. Summary Tables

# %%
print("\n" + "=" * 70)
print("  CROSS-DEVICE SUMMARY")
print("=" * 70)

# ── Mean slowdown per device ──────────────────────────────────────────────
print("\n── Mean Slowdown vs MacBook (averaged across methods & sims) ──")
for dev in other_devices:
    dev_ratios = ratio_df[ratio_df["device"] == dev]["slowdown"]
    print(f"  {DEVICE_SHORT[dev]:12s}: {dev_ratios.mean():.2f}× (±{dev_ratios.std():.2f})")

# ── Mean slowdown per method per device ───────────────────────────────────
print("\n── Per-Method Mean Slowdown ──")
method_device_table = (
    ratio_df.groupby(["device", "method"])["slowdown"]
    .mean()
    .unstack()
)
method_device_table.index = [DEVICE_SHORT.get(d, d) for d in method_device_table.index]
method_device_table.columns = [METHOD_LABELS.get(m, m) for m in method_device_table.columns]
print(method_device_table.round(2).to_string())

# ── Fastest method per device (at max shared agent count) ─────────────────
if shared_counts:
    max_count = shared_counts[-1]
    print(f"\n── Fastest Method at {max_count} Agents ──")
    for dev in DEVICE_ORDER:
        for sim in sims_to_compare:
            row = combined[
                (combined["device"] == dev)
                & (combined["suite"] == sim)
                & (combined["agentCount"] == max_count)
            ]
            if not row.empty:
                fastest = row.loc[row["avgComputeTime"].idxmin()]
                print(f"  {DEVICE_SHORT[dev]:12s} | {sim:8s} | "
                      f"{METHOD_LABELS.get(fastest['method'], fastest['method']):15s} "
                      f"({fastest['avgComputeTime']:.2f} ms)")
