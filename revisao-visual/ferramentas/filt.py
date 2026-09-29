# filt.py A1 A2 B OUT  -> imprime "ndiff nunstable dimsA dimsB"; OUT = B onde A!=B (fora da máscara instável), senão 0
import sys, numpy as np
from PIL import Image
a1, a2, b = (np.asarray(Image.open(p).convert('RGBA')) for p in sys.argv[1:4])
out = sys.argv[4]
if a1.shape != b.shape:
    # alturas diferentes: compara na área comum, o excedente conta inteiro como diferença
    h = max(a1.shape[0], b.shape[0]); w = max(a1.shape[1], b.shape[1])
    def pad(x):
        y = np.zeros((h, w, 4), np.uint8); y[:x.shape[0], :x.shape[1]] = x; return y
    a1p, a2p, bp = pad(a1), pad(a2) if a2.shape == a1.shape else pad(a1), pad(b)
else:
    a1p, a2p, bp = a1, (a2 if a2.shape == a1.shape else a1), b
unst = np.any(a1p != a2p, axis=2)
R = 8  # dilata a máscara instável (quadrado 2R+1) por soma acumulada
if unst.any():
    c = np.pad(unst.astype(np.int32), ((R+1, R), (R+1, R))).cumsum(0).cumsum(1)
    unst = (c[2*R+1:, 2*R+1:] - c[:-2*R-1, 2*R+1:] - c[2*R+1:, :-2*R-1] + c[:-2*R-1, :-2*R-1]) > 0
diff = np.any(a1p != bp, axis=2) & ~unst
res = np.where(diff[..., None], bp, 0).astype(np.uint8)
Image.fromarray(res, 'RGBA').save(out)
print(int(diff.sum()), int(unst.sum()), f"{a1.shape[1]}x{a1.shape[0]}", f"{b.shape[1]}x{b.shape[0]}")

if diff.any():  # zoom: A, B e o filtro, recortados na região que mudou (margem de 40 px)
    ys, xs = np.where(diff)
    y0, y1 = max(0, ys.min()-40), min(bp.shape[0], ys.max()+41); x0, x1 = max(0, xs.min()-40), min(bp.shape[1], xs.max()+41)
    y1 = min(y1, y0 + 1500)
    k = max(1, min(3, 1400 // (x1 - x0)))
    def big(x, bg):
        im = Image.alpha_composite(Image.new('RGBA', (x1-x0, y1-y0), bg), Image.fromarray(np.ascontiguousarray(x[y0:y1, x0:x1]), 'RGBA'))
        return im.resize(((x1-x0)*k, (y1-y0)*k), Image.NEAREST)
    ps = [big(a1p, (255,255,255,255)), big(bp, (255,255,255,255)), big(res, (40,40,40,255))]
    z = Image.new('RGBA', (ps[0].width, sum(p.height for p in ps) + 20), (255,0,255,255))
    for i, p in enumerate(ps): z.paste(p, (0, i*(p.height+10)))
    z.save(out.replace('diff.png', 'zoom.png'))
