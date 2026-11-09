import sys; from PIL import Image, ImageFilter
import numpy as np
mock, plate, out = sys.argv[1:4]
W,H=1280,720
m=Image.open(mock).convert('RGB').resize((W,H),Image.LANCZOS)
p=Image.open(plate).convert('RGB').resize((W,H),Image.LANCZOS)
# window city region: x 0.066-0.955, y 0.03-0.55, feathered
a=np.zeros((H,W),np.float32)
y0,y1,x0,x1=int(.03*H),int(float(sys.argv[4]) *H),int(.06*W),int(.96*W)
a[y0:y1,x0:x1]=1
al=Image.fromarray((a*255).astype('uint8')).filter(ImageFilter.GaussianBlur(8))
Image.composite(p,m,al).save(out, quality=92)
