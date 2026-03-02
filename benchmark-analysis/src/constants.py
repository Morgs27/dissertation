"""
Canonical constants for the benchmark analysis pipeline.

Defines backend names, display labels, colorblind-friendly colour palette,
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
# Colour palette — colorblind-friendly (Wong palette variants)
# Consistent across every plot in the dissertation.
# ---------------------------------------------------------------------------
METHOD_COLORS: dict[str, str] = {
    JAVASCRIPT: "#4477AA",   # blue
    WEB_WORKERS: "#228833",  # green
    WEB_ASSEMBLY: "#EE6677", # red / coral
    WEB_GPU: "#AA3377",      # purple
}

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
