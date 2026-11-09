import sys; import numpy as np; from PIL import Image, ImageFilter
P='/workspace/agent-city/design/v8-preview/'
im=Image.open(P+'src/ferris-raw.jpg').convert('RGB'); a=np.asarray(im).astype(float)
r,g,b=a[...,0],a[...,1],a[...,2]
d=np.sqrt((r-222)**2+(g-1)**2*2+(b-126)**2)
al=np.clip((d-18)/30,0,1)
# despill: pull magenta out of semi-transparent edges
rgb=a.copy(); sp=np.minimum(r,b)-g; m=(al<1)&(sp>0)
rgb[...,0][m]-=sp[m]*(1-al[m]); rgb[...,2][m]-=sp[m]*(1-al[m])
out=np.dstack([np.clip(rgb,0,255),al*255]).astype('uint8')
s=Image.fromarray(out,'RGBA'); s=s.crop(s.getbbox()); s.save(P+'v8b-ferris.png'); print(s.size)
def place(base,outp,cx,by,h,glow=1.0):
    B=Image.open(base).convert('RGB').resize((1280,720),Image.LANCZOS).convert('RGBA')
    w=round(s.width*h/s.height); sp=s.resize((w,h),Image.LANCZOS)
    x=cx-w//2; y=by-h
    gl=sp.split()[3].filter(ImageFilter.GaussianBlur(4)); glim=Image.new('RGBA',sp.size,(255,120,220,0)); glim.putalpha(gl.point(lambda v:int(v*0.45*glow)))
    pad=Image.new('RGBA',B.size,(0,0,0,0)); pad.paste(glim,(x,y),glim); B=Image.alpha_composite(B,pad)
    pad=Image.new('RGBA',B.size,(0,0,0,0)); sp2=sp.copy(); sp2.putalpha(sp.split()[3].point(lambda v:int(v*1.0))); pad.paste(sp2,(x,y),sp2); B=Image.alpha_composite(B,pad)
    B.convert('RGB').save(outp,quality=93)
if len(sys.argv)>1: place(sys.argv[1],sys.argv[2],int(sys.argv[3]),int(sys.argv[4]),int(sys.argv[5]),float(sys.argv[6]) if len(sys.argv)>6 else 1)
