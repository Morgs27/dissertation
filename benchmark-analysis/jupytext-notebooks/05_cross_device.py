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
from matplotlib.offsetbox import OffsetImage, AnnotationBbox
import numpy as np
import pandas as pd
import io
import cairosvg

from src import (
    compare_methods,
    timing_breakdown,
    apply_style, get_method_color, save_figure,
    METHOD_ORDER, METHOD_LABELS, METHOD_COLORS,
)

from matplotlib.legend_handler import HandlerBase
from matplotlib.image import BboxImage
from matplotlib.transforms import Bbox, TransformedBbox

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
    "Linux Desktop (RTX 4060)": {"source": gpu_df,   "cls": "Desktop (dGPU)", "short": "Linux Desktop"},
    "Chromebook (Pixelbook Go)":         {"source": cb_df,    "cls": "Low-end",      "short": "Chromebook"},
    "Mobile (Pixel 9 Pro)":        {"source": mob_df,   "cls": "Mobile",       "short": "Pixel Phone"},
}


DEVICE_ORDER = list(DEVICES.keys())
DEVICE_SHORT = {k: v["short"] for k, v in DEVICES.items()}
DEVICE_COLORS = {
    "MacBook (M4 Pro)":        "#4477AA",
    "Linux Desktop (RTX 4060)":  "#228833",
    "Chromebook (Pixelbook Go)":              "#EE6677",
    "Mobile (Pixel 9 Pro)":             "#AA3377",
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
    # Replace inf with NaN (happens when MacBook compute time is exactly 0.0 at low agent counts)
    merged["slowdown"] = merged["slowdown"].replace(np.inf, np.nan)
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
            color = "white" if val > 14 else "black"
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

# Load downloaded icons, converting SVG to PNG data if necessary
def _load_icon(filename):
    path = os.path.join("..", "assets", "icons", filename)
    if os.path.exists(path):
        if filename.endswith(".svg"):
            png_data = cairosvg.svg2png(url=path)
            # Imread accepts a file-like object
            return plt.imread(io.BytesIO(png_data), format='png')
        return plt.imread(path)
    return None

DEVICE_ICONS = {
    "MacBook (M4 Pro)": _load_icon("apple.svg"),
    "Linux Desktop (RTX 4060)": _load_icon("linux.svg"),
    "Chromebook (Pixelbook Go)": _load_icon("chrome.svg"),
    "Mobile (Pixel 9 Pro)": _load_icon("mobile.svg"),
}

for sim in sims_to_compare:
    fig, ax = plt.subplots(figsize=(12, 6))
    x_labels = []
    x_pos = []
    
    bar_data = []
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
            
            total = 0
            components = []
            for col in timing_cols:
                val = row[col].values[0] if col in row.columns else 0
                if pd.isna(val) or val <= 0:
                    val = 0
                components.append(val)
                total += val
                
            if total > 0:
                bar_data.append({
                    "device": device,
                    "method": method,
                    "total": total,
                    "components": components
                })
                
    # Sort bars by total execution time (fastest first)
    bar_data.sort(key=lambda x: x["total"])

    for i, item in enumerate(bar_data):
        bottom = 0
        for j, val in enumerate(item["components"]):
            if val > 0:
                ax.bar(i, val, bottom=bottom, color=timing_colors[j],
                       label=timing_labels[j], edgecolor="white", width=0.7)
                bottom += val
                
        # Add device icon at the top of the bar using AnnotationBbox
        icon_img = DEVICE_ICONS.get(item["device"])
        if icon_img is not None:
            # SVGs might have a larger native resolution, adjust zoom as needed
            imagebox = OffsetImage(icon_img, zoom=0.04)
            ab = AnnotationBbox(imagebox, (i, item["total"]), frameon=False, pad=0,
                                box_alignment=(0.5, -0.3))
            ax.add_artist(ab)
        
        x_labels.append(METHOD_LABELS.get(item["method"], item["method"]))
        x_pos.append(i)

    if bar_data:
        max_total = max(b["total"] for b in bar_data)
        ax.set_ylim(0, max_total * 1.35)  # Add ample 35% headroom for icons

    ax.set_xticks(x_pos)
    ax.set_xticklabels(x_labels, fontsize=10, rotation=45, ha="right")
    ax.set_ylabel("Frame Time (ms)")
    ax.set_title(f"{sim.capitalize()} — Timing Breakdown at {representative_count} Agents", fontweight="bold")
    
    # De-duplicate legend
    handles, labels = ax.get_legend_handles_labels()
    by_label = dict(zip(labels, handles))
    
    # Ensure standard order for the legend
    ordered_handles = [by_label[lbl] for lbl in timing_labels if lbl in by_label]
    ordered_labels = [lbl for lbl in timing_labels if lbl in by_label]
    
    ax.legend(ordered_handles, ordered_labels, fontsize=9, loc="upper left")
    plt.tight_layout()
    save_figure(fig, f"05_timing_breakdown_{sim}")
    plt.show()

# %%
# Define the agent counts we want to visualize
representative_counts = [20000, 1000, 1]

# Setup for the single metric
timing_col = "avgComputeTime"
timing_color = "#fc8d62"

def _load_icon(filename):
    path = os.path.join("..", "assets", "icons", filename)
    if os.path.exists(path):
        if filename.endswith(".svg"):
            png_data = cairosvg.svg2png(url=path)
            return plt.imread(io.BytesIO(png_data), format='png')
        return plt.imread(path)
    return None

DEVICE_ICONS = {
    "MacBook (M4 Pro)": _load_icon("apple.svg"),
    "Linux Desktop (RTX 4060)": _load_icon("linux.svg"),
    "Chromebook (Pixelbook Go)": _load_icon("chrome.svg"),
    "Mobile (Pixel 9 Pro)": _load_icon("mobile.svg"),
}

# The fix: A HandlerBase using BboxImage to reliably render images inside the legend
class ImageHandler(HandlerBase):
    def __init__(self, image):
        self.image = image
        super().__init__()

    def create_artists(self, legend, orig_handle,
                       xdescent, ydescent, width, height, fontsize, trans):
        
        # Make the image slightly larger than the text height for readability
        img_size = height * 1.5 
        
        # Create a bounding box centered on the legend key area
        bbox = Bbox.from_bounds(xdescent, ydescent - (img_size - height) / 2, img_size, img_size)
        tbb = TransformedBbox(bbox, trans)
        
        # Bind the image to the box
        image_box = BboxImage(tbb)
        image_box.set_data(self.image)
        return [image_box]

for count in representative_counts:
    for sim in sims_to_compare:
        fig, ax = plt.subplots(figsize=(12, 6))
        
        bar_data = []
        for device in DEVICE_ORDER:
            dev_data = combined[
                (combined["device"] == device)
                & (combined["suite"] == sim)
                & (combined["agentCount"] == count)
            ]
            methods_here = [m for m in METHOD_ORDER if m in dev_data["method"].unique()]

            for method in methods_here:
                row = dev_data[dev_data["method"] == method]
                if row.empty:
                    continue
                
                val = row[timing_col].values[0] if timing_col in row.columns else 0
                if pd.isna(val) or val < 0:
                    val = 0
                    
                bar_data.append({
                    "device": device,
                    "method": method,
                    "compute_time": val
                })
                    
        # Sort bars by compute time (fastest first)
        bar_data.sort(key=lambda x: x["compute_time"])

        x_labels = []
        x_pos = []
        
        # Track which devices are actually in this specific plot
        devices_in_plot = set()

        for i, item in enumerate(bar_data):
            val = item["compute_time"]
            ax.bar(i, val, color=timing_color, edgecolor="white", width=0.7)
            devices_in_plot.add(item["device"])
                    
            icon_img = DEVICE_ICONS.get(item["device"])
            if icon_img is not None:
                imagebox = OffsetImage(icon_img, zoom=0.035)
                ab = AnnotationBbox(imagebox, (i, val), frameon=False, pad=0,
                                    box_alignment=(0.5, -0.2))
                ax.add_artist(ab)
            
            x_labels.append(METHOD_LABELS.get(item["method"], item["method"]))
            x_pos.append(i)

        # Create the legend with ACTUAL icons
        legend_handles = []
        legend_labels = []
        handler_map = {}

        for dev_name in DEVICE_ORDER:
            if dev_name in devices_in_plot and DEVICE_ICONS.get(dev_name) is not None:
                # Create a proxy patch to anchor the legend entry
                patch = plt.Rectangle((0, 0), 1, 1, facecolor="none", edgecolor="none")
                legend_handles.append(patch)
                legend_labels.append(dev_name)
                # Map the proxy patch to our new BboxImage handler
                handler_map[patch] = ImageHandler(DEVICE_ICONS[dev_name])

        if bar_data:
            max_val = max(b["compute_time"] for b in bar_data)
            ax.set_ylim(0, max(max_val * 1.4, 0.05))

        ax.set_xticks(x_pos)
        ax.set_xticklabels(x_labels, fontsize=10, rotation=45, ha="right")
        ax.set_ylabel("Compute Time (ms)")
        ax.set_title(f"{sim.capitalize()} — Avg Compute Time Across Devices ({count} Agents)", fontweight="bold")
        
        ax.yaxis.grid(True, linestyle='--', alpha=0.4)
        ax.set_axisbelow(True)

       # Add the icon-based legend
        if legend_handles:
            ax.legend(legend_handles, legend_labels, 
                      handler_map=handler_map,
                      loc="upper left", 
                      fontsize=11,
                      handlelength=1.0,    # Shrinks the invisible box reserved for the icon
                      handletextpad=0.5,   # Reduces the padding between the box and the text
                      labelspacing=0.8)

        plt.tight_layout()
        save_figure(fig, f"05_compute_time_{sim}_count_{count}")
        plt.show()

# %%

# Define the agent counts we want to visualize
representative_counts = [20000, 1000, 1]

# Define a color palette for your devices
DEVICE_COLORS = {
    "MacBook (M4 Pro)": "#66c2a5",
    "Linux Desktop (RTX 4060)": "#8da0cb",
    "Chromebook (Pixelbook Go)": "#e78ac3",
    "Mobile (Pixel 9 Pro)": "#a6d854",
}

for count in representative_counts:
    for sim in sims_to_compare:
        fig, ax = plt.subplots(figsize=(12, 6))
        
        bar_data = []
        for device in DEVICE_ORDER:
            dev_data = combined[
                (combined["device"] == device)
                & (combined["suite"] == sim)
                & (combined["agentCount"] == count)
            ]
            methods_here = [m for m in METHOD_ORDER if m in dev_data["method"].unique()]

            for method in methods_here:
                row = dev_data[dev_data["method"] == method]
                if row.empty:
                    continue
                
                val = row[timing_col].values[0] if timing_col in row.columns else 0
                if pd.isna(val) or val < 0:
                    val = 0
                    
                bar_data.append({
                    "device": device,
                    "method": method,
                    "compute_time": val
                })

        bar_data.sort(key=lambda x: x["compute_time"])

        # Track devices for the legend
        seen_devices = {}

        for i, item in enumerate(bar_data):
            device_name = item["device"]
            val = item["compute_time"]
            color = DEVICE_COLORS.get(device_name, "#cccccc")
            
            # 1. Color the bars by device
            ax.bar(i, val, color=color, edgecolor="white", width=0.7)
            
            # 2. Keep icons on top of bars
            icon_img = DEVICE_ICONS.get(device_name)
            if icon_img is not None:
                imagebox = OffsetImage(icon_img, zoom=0.035)
                ab = AnnotationBbox(imagebox, (i, val), frameon=False, 
                                    box_alignment=(0.5, -0.2))
                ax.add_artist(ab)
            
            # Store color for the legend
            if device_name not in seen_devices:
                seen_devices[device_name] = color

        # 3. Simple Legend (No icons, just colored squares)
        legend_handles = [plt.Rectangle((0,0),1,1, color=c) for c in seen_devices.values()]
        ax.legend(legend_handles, seen_devices.keys(), loc="upper left", frameon=True)

        # Formatting
        ax.set_xticks(range(len(bar_data)))
        ax.set_xticklabels([METHOD_LABELS.get(x["method"], x["method"]) for x in bar_data], 
                           rotation=45, ha="right")
        ax.set_ylabel("Compute Time (ms)")
        ax.set_title(f"{sim.capitalize()} — Compute Time ({count} Agents)", fontweight="bold")
        
        if bar_data:
            ax.set_ylim(0, max(b["compute_time"] for b in bar_data) * 1.4)

        plt.tight_layout()
        save_figure(fig, f"05_compute_time_{sim}_count_{count}")
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
# ## 9b. Alternate Overlay: Device Performance by Method
# 
# Averaging over all simulations to clearly show how each device scales for a specific compute method.
# This isolates hardware capability when running a given tech stack.

# %%
fig, axes = plt.subplots(1, len(METHOD_ORDER), figsize=(16, 4), sharey=True)
if len(METHOD_ORDER) == 1:
    axes = [axes]

for ax, method in zip(axes, METHOD_ORDER):
    subset = combined[combined["method"] == method]
    if subset.empty:
        continue
    
    # Average across all simulations
    agg_df = subset.groupby(["device", "agentCount"])["avgComputeTime"].mean().reset_index()
    
    for dev in DEVICE_ORDER:
        dev_data = agg_df[agg_df["device"] == dev].sort_values("agentCount")
        if not dev_data.empty:
            ax.plot(
                dev_data["agentCount"], dev_data["avgComputeTime"],
                label=DEVICE_SHORT.get(dev, dev), color=DEVICE_COLORS[dev],
                marker="o", markersize=4, linewidth=2, alpha=0.8
            )
            
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_title(METHOD_LABELS.get(method, method), fontweight="bold")
    ax.set_xlabel("Agent Count")
    if ax == axes[0]:
        ax.set_ylabel("Avg Compute Time (ms)")
        ax.legend(fontsize=9, title="Device")

fig.suptitle("Alternate 1: Device Scaling Averaged Across Simulations (by Method)", fontsize=14, fontweight="bold", y=1.05)
plt.tight_layout()
save_figure(fig, "05_alternate_overlay_1")
plt.show()

# %% [markdown]
# ## 9c. Alternate Overlay: Method Performance by Device
#
# Averaging over all simulations to clearly show the relative performance of methods on each specific device.
# This reveals the optimal tech stack for a given hardware tier.

# %%
fig, axes = plt.subplots(1, len(DEVICE_ORDER), figsize=(16, 4), sharey=True)
if len(DEVICE_ORDER) == 1:
    axes = [axes]

for ax, dev in zip(axes, DEVICE_ORDER):
    subset = combined[combined["device"] == dev]
    if subset.empty:
        continue
        
    # Average across all simulations
    agg_df = subset.groupby(["method", "agentCount"])["avgComputeTime"].mean().reset_index()
    
    for method in METHOD_ORDER:
        method_data = agg_df[agg_df["method"] == method].sort_values("agentCount")
        if not method_data.empty:
            ax.plot(
                method_data["agentCount"], method_data["avgComputeTime"],
                label=METHOD_LABELS.get(method, method), color=get_method_color(method),
                marker="s", markersize=4, linewidth=2, alpha=0.8
            )
            
    ax.set_xscale("log")
    ax.set_yscale("log")
    ax.set_title(DEVICE_SHORT.get(dev, dev), fontweight="bold")
    ax.set_xlabel("Agent Count")
    if ax == axes[0]:
        ax.set_ylabel("Avg Compute Time (ms)")
        ax.legend(fontsize=9, title="Method")

fig.suptitle("Alternate 2: Method Scaling Averaged Across Simulations (by Device)", fontsize=14, fontweight="bold", y=1.05)
plt.tight_layout()
save_figure(fig, "05_alternate_overlay_2")
plt.show()

# %% [markdown]
# ## 10. GPU Render Mode: CPU vs GPU Render Path
#
# Where available, compare CPU vs GPU render modes for WebGPU on each device.

# %%
render_devices = {
    "Mobile (Pixel 9 Pro)": mob_df,
    "Chromebook (Pixelbook Go)": cb_df,
    "Linux Desktop (RTX 4060)": gpu_df,
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
