"""Make a dark-mode variant of the small JPEG logo without redrawing its text."""
from pathlib import Path
from PIL import Image

SOURCE = Path("attached_assets/iu__acm_logo_1790412157993.jpg")
OUTPUT = Path("deliverables/acm-logo")
OUTPUT.mkdir(parents=True, exist_ok=True)

original = Image.open(SOURCE).convert("RGB")
transparent = Image.new("RGBA", original.size, (0, 0, 0, 0))
background = (16, 26, 41)  # deep navy
dark = Image.new("RGB", original.size, background)

for y in range(original.height):
    for x in range(original.width):
        r, g, b = original.getpixel((x, y))
        # The supplied JPEG contains faint compression bands outside the logo.
        if y < 24 or y > 69:
            continue
        # JPEG compression softened the edges against white. Recover opacity
        # from the original ink-to-white contrast rather than hard-thresholding.
        # Use the actual ink hue, not horizontal position: the right edge of
        # the "m" sits close enough to the right brace to overlap its x-range.
        blue = b > r + 8
        reference = (42, 96, 135) if blue else (197, 155, 87)
        main_channel = 0 if blue else 2
        observed = (r, g, b)[main_channel]
        alpha = max(0.0, min(1.0, (255 - observed) / (255 - reference[main_channel])))
        if alpha < 0.055:
            alpha = 0.0
        elif alpha > 0.96:
            alpha = 1.0
        foreground = (140, 202, 234) if blue else (239, 194, 124)
        if alpha:
            transparent.putpixel((x, y), (*foreground, round(alpha * 255)))
            dark.putpixel(
                (x, y),
                tuple(round(background[i] * (1 - alpha) + foreground[i] * alpha) for i in range(3)),
            )

# Source is only 152x91. Upscaling does not invent detail, but preserves smooth
# anti-aliased edges when the image is presented or placed on a dark canvas.
large = (original.width * 8, original.height * 8)
dark.resize(large, Image.Resampling.LANCZOS).save(OUTPUT / "acm-logo-dark.png")
transparent.resize(large, Image.Resampling.LANCZOS).save(OUTPUT / "acm-logo-transparent.png")
print("Wrote dark-background and transparent PNG variants.")