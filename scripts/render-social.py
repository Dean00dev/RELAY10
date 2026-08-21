"""Render the deterministic Open Graph preview from local primitives."""

from __future__ import annotations

from math import sin, pi
from pathlib import Path
from random import Random

from PIL import Image, ImageDraw, ImageFilter, ImageFont


ROOT = Path(__file__).resolve().parents[1]
WIDTH, HEIGHT = 1200, 630


def font(size: int, *, bold: bool = False) -> ImageFont.FreeTypeFont:
    name = "DejaVuSans-Bold.ttf" if bold else "DejaVuSans.ttf"
    return ImageFont.truetype(f"/usr/share/fonts/truetype/dejavu/{name}", size)


image = Image.new("RGB", (WIDTH, HEIGHT))
pixels = image.load()
for y in range(HEIGHT):
    for x in range(WIDTH):
        blend = (x / WIDTH) * 0.55 + (y / HEIGHT) * 0.45
        pixels[x, y] = (
            round(6 + 14 * blend),
            round(8 + 4 * blend),
            round(18 + 28 * blend),
        )

draw = ImageDraw.Draw(image)
random = Random(10)
for _ in range(80):
    x, y = random.randrange(WIDTH), random.randrange(HEIGHT)
    alpha = random.randrange(80, 190)
    radius = random.choice((1, 1, 1, 2))
    draw.ellipse((x - radius, y - radius, x + radius, y + radius), fill=(alpha, alpha, min(255, alpha + 30)))

points = []
for x in range(70, 1160, 6):
    y = 420 + sin((x - 70) / 145 * pi) * 75 + sin((x - 70) / 53) * 20
    points.append((x, round(y)))
glow = Image.new("RGBA", image.size, (0, 0, 0, 0))
glow_draw = ImageDraw.Draw(glow)
glow_draw.line(points, fill=(67, 248, 255, 180), width=18, joint="curve")
blur = glow.filter(ImageFilter.GaussianBlur(22))
image = Image.alpha_composite(image.convert("RGBA"), blur)
draw = ImageDraw.Draw(image)
for index in range(len(points) - 1):
    ratio = index / max(1, len(points) - 2)
    color = (
        round(67 + (255 - 67) * ratio),
        round(248 + (78 - 248) * ratio),
        round(255 + (205 - 255) * ratio),
        230,
    )
    draw.line((points[index], points[index + 1]), fill=color, width=7)

ship_x, ship_y = points[len(points) // 2]
draw.ellipse((ship_x - 18, ship_y - 18, ship_x + 18, ship_y + 18), fill=(220, 255, 255, 255))

title_font = font(92, bold=True)
body_font = font(38, bold=True)
sub_font = font(30)
button_font = font(20, bold=True)
draw.text((88, 64), "RELAY", font=title_font, fill=(247, 248, 255))
relay_width = draw.textlength("RELAY", font=title_font)
draw.text((88 + relay_width, 64), "//10", font=title_font, fill=(67, 248, 255))
draw.text((92, 184), "YOU GET TEN SECONDS.", font=body_font, fill=(247, 248, 255))
draw.text((92, 236), "THEN THE GAME BELONGS TO SOMEONE ELSE.", font=sub_font, fill=(150, 157, 184))
draw.rounded_rectangle((90, 500, 460, 566), radius=33, fill=(67, 248, 255))
label = "TAKE THE BATON"
label_width = draw.textlength(label, font=button_font)
draw.text((275 - label_width / 2, 520), label, font=button_font, fill=(4, 16, 20))

output = ROOT / "assets" / "social-preview.png"
image.convert("RGB").save(output, format="PNG", optimize=True)
print(output)
