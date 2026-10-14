# Generates 15 synthetic "garment photos" for tests: a flat garment shape on a textured
# household background (bedsheet, wood floor, door), with folds, grain and a soft shadow.
# They are not real photos; they exercise the pipeline end to end. Deterministic (seeded).
# Run: python3 tests/fixtures/make-garments.py
import math, random
from PIL import Image, ImageDraw, ImageFilter

W, H = 1200, 1600
random.seed(7)

SHAPES = {
    "tee": [(30,12),(42,7),(50,12),(58,7),(70,12),(89,29),(78,41),(70,35),(70,91),(30,91),(30,35),(22,41),(11,29)],
    "shirt": [(32,10),(44,6),(50,14),(56,6),(68,10),(86,26),(92,80),(82,82),(72,40),(72,94),(28,94),(28,40),(18,82),(8,80),(14,26)],
    "trousers": [(29,5),(71,5),(77,95),(57,95),(50,36),(43,95),(23,95)],
    "skirt": [(34,15),(66,15),(84,85),(16,85)],
    "shorts": [(24,25),(76,25),(82,70),(56,70),(50,48),(44,70),(18,70)],
    "dress": [(40,4),(60,4),(63,22),(84,95),(16,95),(37,22)],
    "coat": [(33,6),(45,3),(50,18),(55,3),(67,6),(85,20),(94,86),(81,89),(73,42),(73,97),(27,97),(27,42),(19,89),(6,86),(15,20)],
    "sweater": [(32,12),(44,9),(50,14),(56,9),(68,12),(86,26),(94,84),(82,86),(72,42),(72,88),(28,88),(28,42),(18,86),(6,84),(14,26)],
    "sneaker": [(8,64),(10,52),(20,45),(38,42),(46,33),(56,35),(70,47),(86,51),(92,60),(92,72),(8,72)],
    "boot": [(30,15),(55,15),(57,60),(85,66),(90,74),(90,82),(25,82),(25,60)],
    "scarf": [(20,20),(80,20),(80,32),(62,32),(64,90),(52,90),(50,32),(20,32)],
    "bag": [(22,38),(78,38),(84,88),(16,88)],
}

ITEMS = [
    ("01-top-navy-tee", "tee", (31, 42, 68), "sheet"),
    ("02-top-white-shirt", "shirt", (238, 236, 230), "wood"),
    ("03-bottom-denim-jeans", "trousers", (74, 106, 143), "sheet"),
    ("04-bottom-khaki-chinos", "trousers", (168, 154, 110), "door"),
    ("05-bottom-black-skirt", "skirt", (34, 34, 36), "wood"),
    ("06-shoes-white-sneakers", "sneaker", (240, 238, 232), "wood"),
    ("07-shoes-brown-boots", "boot", (107, 74, 50), "sheet"),
    ("08-outer-camel-coat", "coat", (185, 138, 86), "door"),
    ("09-outer-olive-raincoat", "coat", (107, 107, 58), "sheet"),
    ("10-top-burgundy-sweater", "sweater", (109, 31, 44), "wood"),
    ("11-dress-pink-dress", "dress", (227, 161, 180), "door"),
    ("12-top-grey-hoodie", "sweater", (142, 143, 145), "sheet"),
    ("13-bottom-blue-shorts", "shorts", (47, 95, 168), "wood"),
    ("14-accessory-red-scarf", "scarf", (184, 49, 47), "door"),
    ("15-accessory-tan-bag", "bag", (185, 150, 105), "sheet"),
]

def background(kind):
    img = Image.new("RGB", (W, H))
    px = img.load()
    base = {"sheet": (236, 232, 224), "wood": (176, 132, 92), "door": (226, 224, 218)}[kind]
    for y in range(H):
        for x in range(0, W):
            n = random.randint(-6, 6)
            if kind == "wood":
                grain = int(12 * math.sin(x / 9.0 + math.sin(y / 70.0) * 3)) + (18 if (x // 150) % 2 else 0)
                c = tuple(max(0, min(255, v + grain + n)) for v in base)
            elif kind == "sheet":
                fold = int(10 * math.sin((x + y * 0.6) / 120.0))
                c = tuple(max(0, min(255, v + fold + n)) for v in base)
            else:
                panel = -14 if (120 < x < 1080 and (180 < y < 720 or 860 < y < 1420)) and (x in range(118, 124) or y in range(178, 184)) else 0
                c = tuple(max(0, min(255, v + n + panel)) for v in base)
            px[x, y] = c
    return img

for name, shape, color, bg in ITEMS:
    img = background(bg)
    pts = SHAPES[shape]
    scale, ox, oy = 9.0, 150, 300
    poly = [(ox + x * scale, oy + y * scale) for x, y in pts]
    shadow = Image.new("L", (W, H), 0)
    ImageDraw.Draw(shadow).polygon([(x + 18, y + 26) for x, y in poly], fill=110)
    shadow = shadow.filter(ImageFilter.GaussianBlur(28))
    img.paste((40, 30, 25), (0, 0), shadow)
    layer = Image.new("RGB", (W, H), color)
    mask = Image.new("L", (W, H), 0)
    ImageDraw.Draw(mask).polygon(poly, fill=255)
    # Folds: soft light and dark bands across the cloth.
    shade = Image.new("L", (W, H), 0)
    sd = ImageDraw.Draw(shade)
    for i in range(5):
        x0 = ox + random.randint(10, 80) * scale
        sd.line([(x0, oy), (x0 + random.randint(-90, 90), oy + 900)], fill=random.randint(30, 70), width=random.randint(20, 60))
    shade = shade.filter(ImageFilter.GaussianBlur(24))
    dark = Image.new("RGB", (W, H), tuple(int(c * 0.72) for c in color))
    layer = Image.composite(dark, layer, shade)
    img.paste(layer, (0, 0), mask.filter(ImageFilter.GaussianBlur(1.2)))
    img = img.filter(ImageFilter.GaussianBlur(0.6))
    img.save(f"tests/fixtures/garments/{name}.jpg", quality=86)
    print(name)
