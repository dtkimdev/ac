import numpy as np; from PIL import Image
from scipy import ndimage
def key(path,tol=18,soft=30):
    a=np.asarray(Image.open(path).convert('RGB')).astype(float)
    bg=np.median(np.concatenate([a[:8].reshape(-1,3),a[-8:].reshape(-1,3),a[:,:8].reshape(-1,3),a[:,-8:].reshape(-1,3)]),0)
    d=np.sqrt(((a-bg)**2*[1,2,1]).sum(-1)); al=np.clip((d-tol)/soft,0,1)
    r,g,b=a[...,0],a[...,1],a[...,2]; sp=np.clip(np.minimum(r,b)-g-20,0,None)*(1-al)
    a[...,0]-=sp; a[...,2]-=sp
    s=Image.fromarray(np.dstack([np.clip(a,0,255),al*255]).astype('uint8'),'RGBA'); return s.crop(s.getbbox())

def key2(path,lo=50,hi=130):
    pass
    a=np.asarray(Image.open(path).convert('RGB')).astype(float)
    r,g,b=a[...,0],a[...,1],a[...,2]; mg=np.minimum(r,b)-g
    al=1-np.clip((mg-lo)/(hi-lo),0,1)
    sp=np.clip(mg-20,0,None)*(al<1); a[...,0]-=sp*0.8; a[...,2]-=sp*0.8
    return np.dstack([np.clip(a,0,255),al*255]).astype('uint8')
def biggest(rgba,thr=100):
    pass
    lab,n=ndimage.label(rgba[...,3]>thr)
    if n>1:
        sz=ndimage.sum(np.ones_like(lab),lab,range(1,n+1)); keep=np.argmax(sz)+1
        mask=ndimage.binary_dilation(lab==keep,iterations=3); rgba=rgba.copy(); rgba[...,3]=rgba[...,3]*mask
    s=Image.fromarray(rgba,'RGBA'); return s.crop(s.getbbox())
