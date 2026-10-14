# Builds src/app/favicon.ico from the rendered 32px icon, as RGBA (Next's image pipeline
# rejects RGB PNG payloads). Run after render.mjs: python3 design/icons/make-ico.py
from PIL import Image

img = Image.open("design/icons/fav-32.png").convert("RGBA")
img.save("src/app/favicon.ico", format="ICO", sizes=[(16, 16), (32, 32)])
print("favicon.ico written")
