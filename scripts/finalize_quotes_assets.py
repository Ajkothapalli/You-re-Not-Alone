"""
Pillow compositing — converts Blender renders into all app asset files.
Run via:  python3 scripts/finalize_quotes_assets.py
Reads:  renders/quotes_full.png, renders/quotes_fg.png, renders/quotes_mono.png
Writes: assets/icon.png, assets/android-icon-foreground.png,
        assets/android-icon-background.png, assets/android-icon-monochrome.png,
        assets/splash-icon.png, assets/favicon.png
"""

import os
from pathlib import Path
from PIL import Image

SCRIPT_DIR  = Path(__file__).parent
PROJECT_DIR = SCRIPT_DIR.parent
RENDER_DIR  = PROJECT_DIR / "renders"
ASSETS_DIR  = PROJECT_DIR / "assets"
ASSETS_DIR.mkdir(exist_ok=True)

INK = (14, 12, 19, 255)   # #0E0C13

def load(name):
    path = RENDER_DIR / name
    if not path.exists():
        raise FileNotFoundError(f"Missing render: {path}")
    return Image.open(path).convert("RGBA")

def bbox_crop(img: Image.Image) -> Image.Image:
    """Crop to non-transparent bounding box."""
    bb = img.getbbox()
    return img.crop(bb) if bb else img

def fit_centered(src: Image.Image, canvas: int, fraction: float) -> Image.Image:
    """Fit src inside (canvas*fraction) px, paste centred on transparent canvas."""
    target = int(canvas * fraction)
    src.thumbnail((target, target), Image.LANCZOS)
    out = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    x = (canvas - src.width)  // 2
    y = (canvas - src.height) // 2
    out.paste(src, (x, y), src)
    return out

def save(img: Image.Image, name: str):
    dest = ASSETS_DIR / name
    img.save(dest)
    print(f"[finalize] wrote {dest}")

# ── Load renders ─────────────────────────────────────────────────────────────
full = load("quotes_full.png")
fg   = load("quotes_fg.png")
mono = load("quotes_mono.png")

# ── icon.png — 1024², opaque (iOS forbids alpha) ────────────────────────────
icon = full.resize((1024, 1024), Image.LANCZOS).convert("RGB")
save(icon.convert("RGBA"), "icon.png")

# ── android-icon-foreground.png — fg bbox-cropped, 60% of 1024 ─────────────
fg_crop = bbox_crop(fg)
save(fit_centered(fg_crop, 1024, 0.60), "android-icon-foreground.png")

# ── android-icon-background.png — solid #0E0C13 1024² ───────────────────────
bg_img = Image.new("RGBA", (1024, 1024), INK)
save(bg_img, "android-icon-background.png")

# ── android-icon-monochrome.png — mono fitted same as fg ─────────────────────
mono_crop = bbox_crop(mono)
save(fit_centered(mono_crop, 1024, 0.60), "android-icon-monochrome.png")

# ── splash-icon.png — fg fitted at 82% of 1024 ──────────────────────────────
save(fit_centered(bbox_crop(fg), 1024, 0.82), "splash-icon.png")

# ── favicon.png — 196² from full render ─────────────────────────────────────
save(full.resize((196, 196), Image.LANCZOS), "favicon.png")

print("[finalize] all assets written")
