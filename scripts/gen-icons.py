#!/usr/bin/env python3
"""Generate the ShiftVault bank-vault icon set.

Requires Pillow (`pip install pillow`). The generated PNGs are committed to the
repository, so building the web app or the Android APK does not need Python.

Usage:
    python3 scripts/gen-icons.py
"""

from __future__ import annotations

import math
import os

from PIL import Image, ImageChops, ImageDraw

ROOT = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))

VARIANTS = {
    "dark": {
        "bg": (8, 8, 10, 255),
        "plate": (16, 16, 20, 255),
        "ink": (237, 237, 242, 255),
        "ring": (60, 60, 70, 255),
        "accent": (16, 185, 129, 255),
    },
    "light": {
        "bg": (255, 255, 255, 255),
        "plate": (245, 245, 247, 255),
        "ink": (11, 11, 15, 255),
        "ring": (198, 198, 208, 255),
        "accent": (16, 185, 129, 255),
    },
}

MIPMAPS = {"mdpi": 48, "hdpi": 72, "xhdpi": 96, "xxhdpi": 144, "xxxhdpi": 192}
FOREGROUNDS = {"mdpi": 108, "hdpi": 162, "xhdpi": 216, "xxhdpi": 324, "xxxhdpi": 432}

ANDROID_ADAPTIVE = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_background" />
    <foreground android:drawable="@mipmap/ic_launcher_foreground" />
</adaptive-icon>
"""

ANDROID_VARIANT_ADAPTIVE = """<?xml version="1.0" encoding="utf-8"?>
<adaptive-icon xmlns:android="http://schemas.android.com/apk/res/android">
    <background android:drawable="@mipmap/ic_launcher_{variant}_background" />
    <foreground android:drawable="@mipmap/ic_launcher_{variant}_foreground" />
</adaptive-icon>
"""


def render(size: int, variant: str = "dark", mode: str = "icon") -> Image.Image:
    """Render one icon.

    mode: "icon" (rounded square), "round" (circular mask), "maskable"
    (full-bleed background with a safe-zone inset artwork) or "foreground"
    (transparent Android adaptive icon layer).
    """
    if size <= 128:
        supersample = 4
    elif size <= 256:
        supersample = 3
    else:
        supersample = 2

    canvas = size * supersample
    colors = VARIANTS[variant]
    image = Image.new("RGBA", (canvas, canvas), (0, 0, 0, 0))
    draw = ImageDraw.Draw(image)

    art_scale = {"icon": 1.0, "round": 1.0, "maskable": 0.78, "foreground": 0.66}[mode]
    u = (canvas / 512.0) * art_scale
    offset = (canvas - 512 * u) / 2.0

    def px(value: float) -> float:
        return offset + value * u

    def box(x0: float, y0: float, x1: float, y1: float):
        return [px(x0), px(y0), px(x1), px(y1)]

    if mode == "maskable":
        draw.rectangle([0, 0, canvas - 1, canvas - 1], fill=colors["bg"])
    elif mode in ("icon", "round"):
        draw.rounded_rectangle([0, 0, canvas - 1, canvas - 1], radius=int(0.22 * canvas), fill=colors["bg"])

    # Safe body
    draw.rounded_rectangle(box(84, 74, 428, 438), radius=int(26 * u), fill=colors["plate"])
    draw.rounded_rectangle(
        box(84, 74, 428, 438),
        radius=int(26 * u),
        outline=colors["ink"],
        width=max(1, int(9 * u)),
    )

    # Door seam
    draw.rounded_rectangle(
        box(112, 102, 400, 410),
        radius=int(16 * u),
        outline=colors["ring"],
        width=max(1, int(4 * u)),
    )

    # Bolts
    for bolt_x, bolt_y in ((132, 122), (380, 122), (132, 390), (380, 390)):
        radius = 7 * u
        draw.ellipse(
            [px(bolt_x) - radius, px(bolt_y) - radius, px(bolt_x) + radius, px(bolt_y) + radius],
            fill=colors["ring"],
        )

    dial_x, dial_y = px(198), px(256)

    # Dial rings
    radius = 58 * u
    draw.ellipse([dial_x - radius, dial_y - radius, dial_x + radius, dial_y + radius], outline=colors["ink"], width=max(1, int(12 * u)))
    radius = 43 * u
    draw.ellipse([dial_x - radius, dial_y - radius, dial_x + radius, dial_y + radius], outline=colors["ring"], width=max(1, int(4 * u)))

    # Dial spokes
    for index in range(6):
        angle = math.pi * index / 3.0
        draw.line(
            [
                (dial_x + math.cos(angle) * 15 * u, dial_y + math.sin(angle) * 15 * u),
                (dial_x + math.cos(angle) * 32 * u, dial_y + math.sin(angle) * 32 * u),
            ],
            fill=colors["ink"],
            width=max(1, int(7 * u)),
        )

    # Dial hub
    radius = 17 * u
    draw.ellipse([dial_x - radius, dial_y - radius, dial_x + radius, dial_y + radius], fill=colors["ink"])
    radius = 5 * u
    draw.ellipse([dial_x - radius, dial_y - radius, dial_x + radius, dial_y + radius], fill=colors["bg"])

    # Spoked handle
    handle_x, handle_y = px(334), px(256)
    for index in range(3):
        angle = -math.pi / 2 + (math.pi * 2 * index) / 3
        draw.line(
            [
                (handle_x + math.cos(angle) * 14 * u, handle_y + math.sin(angle) * 14 * u),
                (handle_x + math.cos(angle) * 56 * u, handle_y + math.sin(angle) * 56 * u),
            ],
            fill=colors["ink"],
            width=max(1, int(14 * u)),
        )

    radius = 22 * u
    draw.ellipse([handle_x - radius, handle_y - radius, handle_x + radius, handle_y + radius], fill=colors["ink"])
    radius = 7 * u
    draw.ellipse([handle_x - radius, handle_y - radius, handle_x + radius, handle_y + radius], fill=colors["plate"])

    # Status LED
    radius = 10 * u
    draw.ellipse([px(380) - radius, px(148) - radius, px(380) + radius, px(148) + radius], fill=colors["accent"])

    if mode == "round":
        mask = Image.new("L", (canvas, canvas), 0)
        ImageDraw.Draw(mask).ellipse([0, 0, canvas - 1, canvas - 1], fill=255)
        image.putalpha(ImageChops.multiply(image.getchannel("A"), mask))

    return image.resize((size, size), Image.LANCZOS)


def render_background(size: int, variant: str = "dark") -> Image.Image:
    """Full-bleed adaptive-icon background layer."""
    return Image.new("RGBA", (size, size), VARIANTS[variant]["bg"])


def save(image: Image.Image, relative_path: str) -> None:
    destination = os.path.join(ROOT, relative_path)
    os.makedirs(os.path.dirname(destination), exist_ok=True)
    image.save(destination, "PNG", optimize=True)
    print("wrote", relative_path)


def main() -> None:
    # Web and PWA icons live inside www/ so every target loads the exact same
    # files.
    save(render(512, "dark", "icon"), "www/icon-dark.png")
    save(render(512, "light", "icon"), "www/icon-light.png")
    save(render(512, "dark", "maskable"), "www/icon-maskable.png")

    for density, pixels in MIPMAPS.items():
        save(render(pixels, "dark", "icon"), f"assets/android/mipmap-{density}/ic_launcher.png")
        save(render(pixels, "dark", "round"), f"assets/android/mipmap-{density}/ic_launcher_round.png")

    for density, pixels in FOREGROUNDS.items():
        save(render(pixels, "dark", "foreground"), f"assets/android/mipmap-{density}/ic_launcher_foreground.png")
        save(render_background(pixels), f"assets/android/mipmap-{density}/ic_launcher_background.png")

    for name in ("ic_launcher.xml", "ic_launcher_round.xml"):
        path = os.path.join(ROOT, "assets/android/mipmap-anydpi-v26", name)
        os.makedirs(os.path.dirname(path), exist_ok=True)
        with open(path, "w", encoding="utf-8") as handle:
            handle.write(ANDROID_ADAPTIVE)
        print("wrote", os.path.relpath(path, ROOT))

    # Launcher aliases: one complete icon set per vault variant.
    for variant in ("dark", "light"):
        for density, pixels in MIPMAPS.items():
            save(render(pixels, variant, "icon"), f"assets/android/mipmap-{density}/ic_launcher_{variant}.png")
            save(render(pixels, variant, "round"), f"assets/android/mipmap-{density}/ic_launcher_{variant}_round.png")

        for density, pixels in FOREGROUNDS.items():
            save(
                render(pixels, variant, "foreground"),
                f"assets/android/mipmap-{density}/ic_launcher_{variant}_foreground.png",
            )
            save(
                render_background(pixels, variant),
                f"assets/android/mipmap-{density}/ic_launcher_{variant}_background.png",
            )

        for suffix in ("", "_round"):
            path = os.path.join(ROOT, f"assets/android/mipmap-anydpi-v26/ic_launcher_{variant}{suffix}.xml")
            os.makedirs(os.path.dirname(path), exist_ok=True)
            with open(path, "w", encoding="utf-8") as handle:
                handle.write(ANDROID_VARIANT_ADAPTIVE.format(variant=variant))
            print("wrote", os.path.relpath(path, ROOT))


if __name__ == "__main__":
    main()
