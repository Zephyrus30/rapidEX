"""
Rapidex Native Messaging Host
Monitora clipboard por imagens e envia para a extensão Chrome via stdio.
Requer: pip install pillow
"""
import sys, json, struct, base64, io, time, hashlib
from PIL import ImageGrab, Image

def send(data):
    msg = json.dumps(data, separators=(',', ':')).encode('utf-8')
    sys.stdout.buffer.write(struct.pack('<I', len(msg)))
    sys.stdout.buffer.write(msg)
    sys.stdout.buffer.flush()

def img_hash(img):
    buf = io.BytesIO()
    img.save(buf, format='PNG')
    return hashlib.md5(buf.getvalue()).hexdigest()[:16]

def to_jpeg_data_url(img):
    if img.mode in ('RGBA', 'P', 'LA'):
        img = img.convert('RGB')
    buf = io.BytesIO()
    img.save(buf, format='JPEG', quality=88, optimize=True)
    b64 = base64.b64encode(buf.getvalue()).decode('ascii')
    return 'data:image/jpeg;base64,' + b64

last_hash = None

while True:
    try:
        img = ImageGrab.grabclipboard()
        if isinstance(img, Image.Image):
            h = img_hash(img)
            if h != last_hash:
                last_hash = h
                send({'type': 'newCapture', 'dataUrl': to_jpeg_data_url(img), 'hash': h})
    except Exception:
        pass
    time.sleep(0.5)
