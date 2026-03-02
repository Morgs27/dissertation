"""
Canonical constants for the benchmark analysis pipeline.

Defines backend names, display labels, colour palettes (multiple themes),
and legend ordering so that every notebook and figure is consistent.
"""

# ---------------------------------------------------------------------------
# Method identifiers (as they appear in the JSON reports)
# ---------------------------------------------------------------------------
JAVASCRIPT = "JavaScript"
WEB_WORKERS = "WebWorkers"
WEB_ASSEMBLY = "WebAssembly"
WEB_GPU = "WebGPU"

# ---------------------------------------------------------------------------
# Canonical ordering for axes, legends, and grouped bar charts
# ---------------------------------------------------------------------------
METHOD_ORDER: list[str] = [JAVASCRIPT, WEB_WORKERS, WEB_ASSEMBLY, WEB_GPU]

# ---------------------------------------------------------------------------
# Display labels (used in axis titles and legends)
# ---------------------------------------------------------------------------
METHOD_LABELS: dict[str, str] = {
    JAVASCRIPT: "JavaScript",
    WEB_WORKERS: "Web Workers",
    WEB_ASSEMBLY: "WebAssembly",
    WEB_GPU: "WebGPU",
}

# ---------------------------------------------------------------------------
# Colour palettes
# Index 0: Academic (colorblind-friendly Wong palette variants)
# Index 1: Teal    (warm teal / sage gradient)
# ---------------------------------------------------------------------------
PALETTES: list[dict[str, str]] = [
    # 0 — Academic (default)
    {
        JAVASCRIPT:   "#4477AA",   # steel blue
        WEB_WORKERS:  "#228833",   # forest green
        WEB_ASSEMBLY: "#EE6677",   # coral red
        WEB_GPU:      "#AA3377",   # plum purple
    },
    # 1 — Teal
    {
        JAVASCRIPT:   "#6DA49D",   # soft teal
        WEB_WORKERS:  "#3B7A71",   # deep teal
        WEB_ASSEMBLY: "#A3D5CE",   # light mint teal
        WEB_GPU:      "#2C5F5A",   # dark teal
    },
]

# Default palette (index 0)
METHOD_COLORS: dict[str, str] = PALETTES[0]

# Render-mode markers (for plots that differentiate render path)
RENDER_MODE_MARKERS: dict[str, str] = {
    "none": "o",
    "cpu": "s",
    "gpu": "D",
}

RENDER_MODE_LABELS: dict[str, str] = {
    "none": "No Render",
    "cpu": "CPU Render",
    "gpu": "GPU Render",
}
