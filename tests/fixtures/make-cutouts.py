# Transparent garment cutouts (what a real cutout looks like) for seeding e2e closets and the
# paper doll screenshots. Same drawn shapes as make-garments.py, no background. Deterministic.
# Run: python3 tests/fixtures/make-cutouts.py
import random
from PIL import Image, ImageDraw, ImageFilter

random.seed(11)
SHAPES = {
    "tee": ([(30,12),(42,7),(50,12),(58,7),(70,12),(89,29),(78,41),(70,35),(70,91),(30,91),(30,35),(22,41),(11,29)], (100, 100)),
    "shirt": ([(32,10),(44,6),(50,14),(56,6),(68,10),(86,26),(92,80),(82,82),(72,40),(72,94),(28,94),(28,40),(18,82),(8,80),(14,26)], (100, 100)),
    "sweater": ([(32,12),(44,9),(50,14),(56,9),(68,12),(86,26),(94,84),(82,86),(72,42),(72,88),(28,88),(28,42),(18,86),(6,84),(14,26)], (100, 100)),
    "trousers": ([(29,5),(71,5),(77,95),(57,95),(50,36),(43,95),(23,95)], (100, 100)),
    "skirt": ([(34,15),(66,15),(84,85),(16,85)], (100, 100)),
    "coat": ([(33,6),(45,3),(50,18),(55,3),(67,6),(85,20),(94,86),(81,89),(73,42),(73,97),(27,97),(27,42),(19,89),(6,86),(15,20)], (100, 100)),
    "dress": ([(40,4),(60,4),(63,22),(84,95),(16,95),(37,22)], (100, 100)),
    "shoe": ([(8,64),(10,52),(20,45),(38,42),(46,33),(56,35),(70,47),(86,51),(92,60),(92,72),(8,72)], (100, 100)),
}
ITEMS = [
    ("navy-shirt", "shirt", (31, 42, 68)),
    ("white-tee", "tee", (240, 238, 232)),
    ("burgundy-sweater", "sweater", (109, 31, 44)),
    ("khaki-chinos", "trousers", (168, 154, 110)),
    ("denim-jeans", "trousers", (74, 106, 143)),
    ("black-skirt", "skirt", (34, 34, 36)),
    ("camel-coat", "coat", (185, 138, 86)),
    ("olive-raincoat", "coat", (107, 107, 58)),
    ("pink-dress", "dress", (227, 161, 180)),
    ("white-sneakers", "shoe", (240, 238, 232)),
    ("brown-loafers", "shoe", (122, 72, 44)),
]
S = 8
for name, shape, color in ITEMS:
    pts, _ = SHAPES[shape]
    if shape == "shoe":  # a pair, side by side
        W, H = 1000, 420
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        for ox in (20, 480):
            poly = [(ox + x * 5, -150 + y * 5) for x, y in pts]
            layer = Image.new("RGBA", (W, H), color + (255,))
            mask = Image.new("L", (W, H), 0)
            ImageDraw.Draw(mask).polygon(poly, fill=255)
            img.paste(layer, (0, 0), mask)
    else:
        W, H = 800, 800
        poly = [(x * S, y * S) for x, y in pts]
        img = Image.new("RGBA", (W, H), (0, 0, 0, 0))
        layer = Image.new("RGBA", (W, H), color + (255,))
        shade = Image.new("L", (W, H), 0)
        sd = ImageDraw.Draw(shade)
        for _ in range(4):
            x0 = random.randint(150, 650)
            sd.line([(x0, 0), (x0 + random.randint(-80, 80), H)], fill=random.randint(30, 60), width=random.randint(30, 60))
        dark = Image.new("RGBA", (W, H), tuple(int(c * 0.78) for c in color) + (255,))
        layer = Image.composite(dark, layer, shade.filter(ImageFilter.GaussianBlur(30)))
        mask = Image.new("L", (W, H), 0)
        ImageDraw.Draw(mask).polygon(poly, fill=255)
        img.paste(layer, (0, 0), mask.filter(ImageFilter.GaussianBlur(1)))
    img = img.crop(img.getbbox())
    img.save(f"tests/fixtures/cutouts/{name}.png")
    print(name, img.size)
