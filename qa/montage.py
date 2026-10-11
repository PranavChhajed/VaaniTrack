"""Lay a set of screenshots side by side in one image, so a sequence can be read at a glance.
python qa/montage.py out.png in1.jpg in2.jpg ... [--cols N] [--w 180]"""
import sys
from PIL import Image

args = sys.argv[1:]
cols, width = 7, 180
if "--cols" in args:
    i = args.index("--cols"); cols = int(args[i + 1]); del args[i:i + 2]
if "--w" in args:
    i = args.index("--w"); width = int(args[i + 1]); del args[i:i + 2]
out, files = args[0], args[1:]
imgs = []
for f in files:
    im = Image.open(f).convert("RGB")
    h = int(im.height * width / im.width)
    imgs.append(im.resize((width, h)))
rows = (len(imgs) + cols - 1) // cols
cell_h = max(i.height for i in imgs)
sheet = Image.new("RGB", (cols * (width + 6) + 6, rows * (cell_h + 6) + 6), (90, 90, 90))
for n, im in enumerate(imgs):
    sheet.paste(im, (6 + (n % cols) * (width + 6), 6 + (n // cols) * (cell_h + 6)))
sheet.save(out)
