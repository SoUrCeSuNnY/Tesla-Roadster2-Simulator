"""Simple CPU z-buffer render for inspecting geometry without a browser."""
import json
from pathlib import Path
import numpy as np
from PIL import Image

WIDTH, HEIGHT = 1200, 800
yy, xx = np.mgrid[:HEIGHT,:WIDTH]
radial = np.clip(np.hypot((xx-600)/800,(yy-300)/700),0,1)[...,None]
background = (np.array([240,243,238])*(1-radial)+np.array([220,229,227])*radial)
shadow = np.exp(-(((xx-590)/370)**2+((yy-570)/75)**2)*2)[...,None]*.12
background *= (1-shadow)

for name in ['front','rear','exploded','bottom']:
    pixels=background.copy().astype(np.uint8)
    depth=np.full((HEIGHT,WIDTH),np.inf)
    for t in json.loads(Path(f'research/{name}-triangles.json').read_text()):
        v=np.array(t['vertices']); x0,y0,z0=v[0];x1,y1,z1=v[1];x2,y2,z2=v[2]
        den=(y1-y2)*(x0-x2)+(x2-x1)*(y0-y2)
        if abs(den)<1e-10:continue
        lo=np.maximum(np.floor(v[:,:2].min(axis=0)).astype(int),[0,0]);hi=np.minimum(np.ceil(v[:,:2].max(axis=0)).astype(int),[WIDTH-1,HEIGHT-1])
        if np.any(lo>hi):continue
        x,y=np.meshgrid(np.arange(lo[0],hi[0]+1)+.5,np.arange(lo[1],hi[1]+1)+.5)
        a=((y1-y2)*(x-x2)+(x2-x1)*(y-y2))/den
        b=((y2-y0)*(x-x2)+(x0-x2)*(y-y2))/den;c=1-a-b
        z=a*z0+b*z1+c*z2
        old=depth[lo[1]:hi[1]+1,lo[0]:hi[0]+1]
        mask=(a>=0)&(b>=0)&(c>=0)&(z<old)
        old[mask]=z[mask]
        color=tuple(int(t['color'][i:i+2],16) for i in [1,3,5])
        pixels[lo[1]:hi[1]+1,lo[0]:hi[0]+1][mask]=color
    Image.fromarray(pixels).save(f'research/{name}.png')
out=Image.new('RGB',(1200,800))
for i,name in enumerate(['front','rear','exploded','bottom']):out.paste(Image.open(f'research/{name}.png').resize((600,400)),(i%2*600,i//2*400))
out.save('research/model-contact.jpg')
Image.open('research/front.png').save('dist/assets/model-preview.png')
print('Rendered 4 geometry inspection views with depth buffering.')
