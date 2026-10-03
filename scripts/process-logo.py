import os
from PIL import Image, ImageChops
import numpy as np

src_path = r"C:\Users\Harsh\.gemini\antigravity-ide\brain\2ad5240c-5df0-4a00-9f13-9876cf8955c7\.user_uploaded\media_1790440418981.png"
out_dir = r"c:\Users\Harsh\Desktop\kairos\frontend\public"
os.makedirs(out_dir, exist_ok=True)

img = Image.open(src_path).convert("RGBA")
w, h = img.size
print(f"Original size: {w}x{h}")

data = np.array(img, dtype=np.float32)
r, g, b, a = data[:, :, 0], data[:, :, 1], data[:, :, 2], data[:, :, 3]

# Compute brightness of each pixel (the logo is gray on black background)
brightness = np.maximum(np.maximum(r, g), b)

# Background is pure or near black (< 20)
# Foreground logo gray is around 140-160
print(f"Min brightness: {brightness.min()}, Max brightness: {brightness.max()}")

# Find bounding box where brightness > 30
mask = brightness > 30
rows = np.any(mask, axis=1)
cols = np.any(mask, axis=0)
ymin, ymax = np.where(rows)[0][[0, -1]]
xmin, xmax = np.where(cols)[0][[0, -1]]
print(f"Bounding box: ({xmin}, {ymin}) to ({xmax}, {ymax}), dimensions: {xmax - xmin + 1}x{ymax - ymin + 1}")

# Create transparent version
# Normalized alpha based on foreground brightness:
# If background is black (0), alpha = 0.
# The logo fill brightness is ~150-160 (or we can normalize to 255 for full opacity solid logo)
fg_peak = np.percentile(brightness[mask], 95)
print(f"Foreground peak brightness: {fg_peak}")

# Calculate alpha: smooth transition between 10 and 60
alpha = np.clip((brightness - 10) / (fg_peak - 10), 0, 1) * 255

# Solid white logo with alpha
white_img = np.zeros((h, w, 4), dtype=np.uint8)
white_img[:, :, 0] = 255
white_img[:, :, 1] = 255
white_img[:, :, 2] = 255
white_img[:, :, 3] = alpha.astype(np.uint8)

# Original gray logo with alpha
gray_img = np.zeros((h, w, 4), dtype=np.uint8)
gray_img[:, :, 0] = 160
gray_img[:, :, 1] = 160
gray_img[:, :, 2] = 160
gray_img[:, :, 3] = alpha.astype(np.uint8)

# Lime yellow logo with alpha (#D4FF00 -> 212, 255, 0)
lime_img = np.zeros((h, w, 4), dtype=np.uint8)
lime_img[:, :, 0] = 212
lime_img[:, :, 1] = 255
lime_img[:, :, 2] = 0
lime_img[:, :, 3] = alpha.astype(np.uint8)

# Crop to bounding box with small 5% padding
pad = int(max(xmax - xmin, ymax - ymin) * 0.05)
crop_box = (
    max(0, xmin - pad),
    max(0, ymin - pad),
    min(w, xmax + pad + 1),
    min(h, ymax + pad + 1)
)

im_white = Image.fromarray(white_img).crop(crop_box)
im_gray = Image.fromarray(gray_img).crop(crop_box)
im_lime = Image.fromarray(lime_img).crop(crop_box)

im_white.save(os.path.join(out_dir, "kairos-logo-white.png"))
im_gray.save(os.path.join(out_dir, "kairos-logo.png"))
im_lime.save(os.path.join(out_dir, "kairos-logo-lime.png"))

# Favicon 64x64 and 192x192
fav = im_white.resize((64, 64), Image.Resampling.LANCZOS)
fav.save(os.path.join(out_dir, "favicon.png"))
fav_192 = im_white.resize((192, 192), Image.Resampling.LANCZOS)
fav_192.save(os.path.join(out_dir, "apple-touch-icon.png"))

print("Saved all PNG versions successfully!")
