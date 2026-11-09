import sys,json; sys.path.insert(0,'..'); import numpy as np; from PIL import Image
from key import key2,biggest
def segs(A,minw=60):
    cnt=(A[...,3]>100).sum(0); out=[];st=None
    for i,c in enumerate(list(cnt>3)+[False]):
        if c and st is None: st=i
        if not c and st is not None:
            if i-st>minw: out.append((st,i))
            st=None
    return out
meta={}
for src,names in (('src/turn-sheet.jpg',['t0-back','t1-3q-back','t2-side','t3-3q-front','t4-front']),('src/chat-chairs.jpg',['chat-right','chair-back','chair-front'])):
    A=key2(src); S=segs(A); print(src,S)
    for n,(a,b) in zip(names,S):
        cell=A[:,a:b]; s=Image.fromarray(cell,'RGBA'); bb=s.getbbox()
        s=biggest(cell); s.save(n+'.png'); meta[n]={'w':s.width,'h':s.height}
json.dump(meta,open('src/raw-sizes.json','w'),indent=1); print(meta)
