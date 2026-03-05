# ---
# jupyter:
#   jupytext:
#     text_representation:
#       format_name: percent
# ---

# %% [markdown]
# # 00 — Build Dataset
#
# **Run this notebook once** to stream all raw JSON files and save
# compressed parquet files. Every other notebook reads from parquet
# (loads in seconds instead of minutes).

# %%
import sys, os
sys.path.insert(0, os.path.abspath(".."))

import pandas as pd
from pathlib import Path
from src import load_runs_df, load_frames_df

OUT = Path("../processed")
OUT.mkdir(exist_ok=True)

# %% [markdown]
# ## 1. Basic sweeps — run-level summaries

# %%
sweep_sims = ["boids", "cosmic", "fire", "fluid", "predator", "rain", "slime", "traffic"]
dfs = []
for sim in sweep_sims:
    path = next(p for p in sorted(Path("../raw-data/basic-sweeps").rglob("*.json")) if sim in p.parent.name)
    print(f"Streaming {sim} ({path.stat().st_size / 1e9:.1f} GB)...")
    df = load_runs_df(path, suite_name=sim)
    df["category"] = "basic-sweep"
    dfs.append(df)

sweep_df = pd.concat(dfs, ignore_index=True)
sweep_df.to_parquet(OUT / "basic_sweeps.parquet", index=False)
print(f"✓ basic_sweeps.parquet — {len(sweep_df)} runs, {(OUT / 'basic_sweeps.parquet').stat().st_size / 1e6:.1f} MB")

# %% [markdown]
# ## 2. High agents — run-level summaries

# %%
hi_dfs = []
for path in sorted(Path("../raw-data/high-agents").rglob("*.json")):
    df = load_runs_df(path)
    df["category"] = "high-agents"
    hi_dfs.append(df)

hi_df = pd.concat(hi_dfs, ignore_index=True)
hi_df.to_parquet(OUT / "high_agents.parquet", index=False)
print(f"✓ high_agents.parquet — {len(hi_df)} runs")

# %% [markdown]
# ## 3. Mobile — run-level summaries

# %%
mob_dfs = []
for path in sorted(Path("../raw-data/mobile").rglob("*.json")):
    df = load_runs_df(path)
    df["category"] = "mobile"
    mob_dfs.append(df)

mob_df = pd.concat(mob_dfs, ignore_index=True)
mob_df.to_parquet(OUT / "mobile.parquet", index=False)
print(f"✓ mobile.parquet — {len(mob_df)} runs")

# %% [markdown]
# ## 4. Endurance — run-level + frame-level

# %%
end_summaries = []
end_frames = []
for path in sorted(Path("../raw-data/endurance").rglob("*.json")):
    sim = path.parent.name
    print(f"Loading endurance/{sim}...")
    rdf = load_runs_df(path, suite_name=sim)
    rdf["category"] = "endurance"
    end_summaries.append(rdf)
    fdf = load_frames_df(path, suite_name=sim)
    end_frames.append(fdf)

end_sum_df = pd.concat(end_summaries, ignore_index=True)
end_sum_df.to_parquet(OUT / "endurance_runs.parquet", index=False)
end_frm_df = pd.concat(end_frames, ignore_index=True)
end_frm_df.to_parquet(OUT / "endurance_frames.parquet", index=False)
print(f"✓ endurance_runs.parquet — {len(end_sum_df)} runs")
print(f"✓ endurance_frames.parquet — {len(end_frm_df)} frames")

# %% [markdown]
# ## 5. Trig tests — full JSON (small files, need agent positions)

# %%
from src import load_raw
import json

for device_dir in sorted(Path("../raw-data/trig").iterdir()):
    if not device_dir.is_dir():
        continue
    path = next(device_dir.rglob("*.json"))
    print(f"Copying trig/{device_dir.name}... ({path.stat().st_size / 1e6:.1f} MB)")
    # These are small — just copy as-is for the numerical accuracy notebook

# Save run-level summaries for quick reference
trig_dfs = []
for path in sorted(Path("../raw-data/trig").rglob("*.json")):
    device = path.parent.name
    df = load_runs_df(path, suite_name="trig")
    df["device"] = device
    trig_dfs.append(df)

trig_df = pd.concat(trig_dfs, ignore_index=True)
trig_df.to_parquet(OUT / "trig_runs.parquet", index=False)
print(f"✓ trig_runs.parquet — {len(trig_df)} runs")

# %% [markdown]
# ## Summary

# %%
print("\n=== Processed files ===")
for f in sorted(OUT.glob("*.parquet")):
    print(f"  {f.name:30s}  {f.stat().st_size / 1e6:6.1f} MB")
print("\nDone! All other notebooks will now load from these parquet files.")
