"""
Unified plotting style for academic paper figures.

Call ``apply_style()`` (or ``apply_style(palette=1)`` for teal) once at
the top of every notebook to ensure consistent fonts, grid, colours,
and sizing across all figures.

Available palettes
------------------
0 — **Academic** (default): colorblind-friendly Wong palette variants.
1 — **Teal**: warm teal / sage gradient built around #6DA49D.
"""

from __future__ import annotations

from pathlib import Path

import matplotlib as mpl
import matplotlib.pyplot as plt

from . import constants as C

# ---------------------------------------------------------------------------
# Project paths
# ---------------------------------------------------------------------------
_PROJECT_ROOT = Path(__file__).resolve().parent.parent
FIGURES_DIR = _PROJECT_ROOT / "outputs" / "figures"

# ---------------------------------------------------------------------------
# Active palette (set by apply_style)
# ---------------------------------------------------------------------------
_active_palette: dict[str, str] = C.PALETTES[0]


def apply_style(palette: int = 0) -> None:
    """
    Apply the global matplotlib rcParams for dissertation figures.

    Parameters
    ----------
    palette : int
        Index into ``constants.PALETTES``.
        0 = Academic (default), 1 = Teal.
    """
    global _active_palette
    _active_palette = C.PALETTES[palette]
    # Also update the module-level constant so anyone importing it directly
    # sees the new colours.
    C.METHOD_COLORS.clear()
    C.METHOD_COLORS.update(_active_palette)

    FIGURES_DIR.mkdir(parents=True, exist_ok=True)

    mpl.rcParams.update(
        {
            # --- Font ---
            "font.family": "serif",
            "font.size": 11,
            "axes.titlesize": 13,
            "axes.labelsize": 12,
            "xtick.labelsize": 10,
            "ytick.labelsize": 10,
            "legend.fontsize": 10,
            # --- Figure ---
            "figure.figsize": (8, 5),
            "figure.dpi": 150,
            "savefig.dpi": 300,
            "savefig.bbox": "tight",
            "savefig.pad_inches": 0.1,
            # --- Grid ---
            "axes.grid": True,
            "grid.alpha": 0.3,
            "grid.linestyle": "--",
            # --- Lines ---
            "lines.linewidth": 2,
            "lines.markersize": 7,
            # --- Legend ---
            "legend.framealpha": 0.9,
            "legend.edgecolor": "0.8",
            # --- Layout ---
            "figure.constrained_layout.use": True,
        }
    )


def get_method_color(method: str) -> str:
    """Return the active palette colour for a compute method."""
    return _active_palette.get(method, "#BBBBBB")


def save_figure(fig: plt.Figure, name: str, *, formats: tuple[str, ...] = ("png", "pdf")) -> list[Path]:
    """
    Save *fig* to ``outputs/figures/<name>.<ext>`` at 300 DPI.

    Parameters
    ----------
    fig : matplotlib Figure
    name : str
        Descriptive filename stem (no extension).
    formats : tuple of str
        File extensions to export (default: png + pdf).

    Returns
    -------
    list[Path]
        Paths to saved files.
    """
    FIGURES_DIR.mkdir(parents=True, exist_ok=True)
    saved: list[Path] = []
    for ext in formats:
        path = FIGURES_DIR / f"{name}.{ext}"
        fig.savefig(path)
        saved.append(path)
        print(f"  ✓ Saved {path.relative_to(_PROJECT_ROOT)}")
    return saved
