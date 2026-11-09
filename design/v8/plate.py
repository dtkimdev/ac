import sys; from PIL import Image, ImageFilter, ImageDraw, ImageEnhance; from key import key
W,H=3840,2160; k=W/1024
p2=Image.open('src-plate2-night.jpg').convert('RGB').resize((W,H),Image.LANCZOS)
p1=Image.open('src-plate1-night.jpg').convert('RGB').resize((W,H),Image.LANCZOS)
m=Image.new('L',(W,H),0); ImageDraw.Draw(m).ellipse([680*k,430*k,820*k,555*k],255); m=m.filter(ImageFilter.GaussianBlur(10*k))
base=Image.composite(p1,p2,m).convert('RGBA')
d=key('src-desk.jpg'); d=ImageEnhance.Brightness(d).enhance(0.82)
tw=int(float(sys.argv[1])*k); th=int(d.height*tw/d.width); d=d.resize((tw,th),Image.LANCZOS)
x=int(float(sys.argv[2])*k); yb=int(float(sys.argv[3])*k); y=yb-th
sh=Image.new('RGBA',(W,H),(0,0,0,0)); ImageDraw.Draw(sh).ellipse([x+tw*0.02,yb-th*0.2,x+tw*0.98,yb+th*0.04],(10,5,12,120)); sh=sh.filter(ImageFilter.GaussianBlur(6*k))
base=Image.alpha_composite(base,sh); base.alpha_composite(d,(x,y))
base=base.convert('RGB'); base.save('plate-night-3840.png'); base.resize((1280,720),Image.LANCZOS).save('/workspace/tmp/v7/pn.jpg',quality=85)
print(x/W,y/H,(x+tw)/W,yb/H)
