import sys
import subprocess
import shutil

try:
    from PIL import Image, ImageDraw
except ImportError:
    subprocess.check_call([sys.executable, "-m", "pip", "install", "Pillow"])
    from PIL import Image, ImageDraw

def add_corners(im, rad):
    circle = Image.new('L', (rad * 2, rad * 2), 0)
    draw = ImageDraw.Draw(circle)
    draw.ellipse((0, 0, rad * 2 - 1, rad * 2 - 1), fill=255)
    alpha = Image.new('L', im.size, 255)
    w, h = im.size
    alpha.paste(circle.crop((0, 0, rad, rad)), (0, 0))
    alpha.paste(circle.crop((0, rad, rad, rad * 2)), (0, h - rad))
    alpha.paste(circle.crop((rad, 0, rad * 2, rad)), (w - rad, 0))
    alpha.paste(circle.crop((rad, rad, rad * 2, rad * 2)), (w - rad, h - rad))
    im.putalpha(alpha)
    return im

original_path = "/Users/joker/.gemini/antigravity/brain/7b85fdf7-6882-43e2-8aad-bf5ac2b8fb9f/media__1777397528709.png"
out_path = "/Users/joker/Desktop/jarvis-ai/app/assets/icon.png"

# Open original image
im = Image.open(original_path).convert("RGBA")
w, h = im.size

# Crop to zoom in by 5% on all sides to remove the red line
crop_amount_w = int(w * 0.05)
crop_amount_h = int(h * 0.05)
im = im.crop((crop_amount_w, crop_amount_h, w - crop_amount_w, h - crop_amount_h))

# Resize back to original size (optional but good for consistency)
im = im.resize((w, h), Image.Resampling.LANCZOS)

# Standard mac radius is approx 22.5%
radius = int(min(im.size) * 0.225)
im = add_corners(im, radius)
im.save(out_path, "PNG")
print("Cropped and corners rounded successfully")
