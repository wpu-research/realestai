"""DEMO ilan görselleri için derinlik haritaları (public/img/ilan/demo-N-k-derinlik.jpg).

Sitedeki admin aracıyla aynı model: Depth Anything V2 Small (Apache-2.0).
Kullanım: python scripts/demo-derinlik.py  (transformers, torch, pillow gerekli; GPU varsa kullanılır)
"""
import pathlib
import numpy as np
import torch
from PIL import Image, ImageFilter
from transformers import AutoImageProcessor, AutoModelForDepthEstimation

kok = pathlib.Path(__file__).resolve().parent.parent / "public" / "img" / "ilan"
MODEL = "depth-anything/Depth-Anything-V2-Small-hf"
cihaz = "cuda" if torch.cuda.is_available() else "cpu"
isleyici = AutoImageProcessor.from_pretrained(MODEL)
model = AutoModelForDepthEstimation.from_pretrained(MODEL).to(cihaz).eval()
for yol in sorted(kok.glob("demo-*-[0-9].jpg")):
    hedef = yol.with_name(yol.stem + "-derinlik.jpg")
    goruntu = Image.open(yol).convert("RGB")
    with torch.no_grad():
        d = model(**isleyici(images=goruntu, return_tensors="pt").to(cihaz)).predicted_depth.squeeze().float().cpu().numpy()
    d = (d - d.min()) / max(float(d.max() - d.min()), 1e-6)      # beyaz = yakın
    harita = Image.fromarray((d * 255).astype(np.uint8)).resize(goruntu.size, Image.BICUBIC)
    harita.filter(ImageFilter.GaussianBlur(1.2)).save(hedef, quality=90)
    print(hedef.name)
