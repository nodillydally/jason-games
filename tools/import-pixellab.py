#!/usr/bin/env python3
"""Import PixelLab character + animation jobs into lib/sprites/.

PixelLab returns raw RGBA base64, not PNG, and each frame sits on a canvas
~40% larger than the character to leave room for motion. Two things matter:

1. Crop every frame of every animation to ONE shared bounding box. Cropping
   each frame to its own box re-centres each pose individually, and the sprite
   then jitters as it cycles.
2. Derive the head anchor per frame (first opaque row, horizontal centre of the
   hair mass) so gear can ride the head instead of sitting at a fixed height.

Usage:  python tools/import-pixellab.py <job-json-dir> <out-dir> <name>
        where job-json-dir holds job2.json (the character) and anim-*.json.

See tools/pixellab-recipe.md for the prompts and endpoint parameters.
"""
import base64, json, os, struct, sys, zlib


def decode(im):
    data = base64.b64decode(im['base64'])
    w = im['width']
    return w, len(data) // (4 * w), data


def write_png(path, w, h, rgba):
    raw = b''.join(b'\x00' + bytes(rgba[y * w * 4:(y + 1) * w * 4]) for y in range(h))
    def chunk(tag, data):
        return struct.pack('>I', len(data)) + tag + data + struct.pack('>I', zlib.crc32(tag + data) & 0xffffffff)
    open(path, 'wb').write(
        b'\x89PNG\r\n\x1a\n'
        + chunk(b'IHDR', struct.pack('>IIBBBBB', w, h, 8, 6, 0, 0, 0))
        + chunk(b'IDAT', zlib.compress(raw, 9))
        + chunk(b'IEND', b''))


def main(src, out, name):
    anims = {}
    base = json.load(open(os.path.join(src, 'job2.json')))
    anims['base'] = [base['last_response']['images']['south']]
    for fn in sorted(os.listdir(src)):
        if fn.startswith('anim-') and fn.endswith('.json'):
            anims[fn[5:-5]] = json.load(open(os.path.join(src, fn)))['last_response']['images']

    x0, y0, x1, y1 = 10**9, 10**9, -1, -1
    for ims in anims.values():
        for im in ims:
            w, h, data = decode(im)
            for y in range(h):
                for x in range(w):
                    if data[(y * w + x) * 4 + 3]:
                        x0, x1 = min(x0, x), max(x1, x)
                        y0, y1 = min(y0, y), max(y1, y)
    cw, ch = x1 - x0 + 1, y1 - y0 + 1

    dest = os.path.join(out, name)
    os.makedirs(dest, exist_ok=True)
    manifest = {'w': cw, 'h': ch, 'anims': {}}

    for anim, ims in anims.items():
        manifest['anims'][anim] = []
        for i, im in enumerate(ims):
            w, _, data = decode(im)
            crop = bytearray()
            for y in range(y0, y1 + 1):
                crop += data[(y * w + x0) * 4:(y * w + x1 + 1) * 4]
            fn = '%s-%d.png' % (anim, i)
            write_png(os.path.join(dest, fn), cw, ch, crop)

            top, cols = None, []
            for y in range(ch):
                row = [x for x in range(cw) if crop[(y * cw + x) * 4 + 3]]
                if row:
                    if top is None:
                        top = y
                    if y < top + 4:
                        cols += row
            manifest['anims'][anim].append(
                {'f': fn[:-4], 'top': top, 'cx': (min(cols) + max(cols)) // 2 if cols else cw // 2})

    print(json.dumps(manifest, indent=1))
    print('\n%d frames at %dx%d -> %s' % (
        sum(len(v) for v in manifest['anims'].values()), cw, ch, dest), file=sys.stderr)


if __name__ == '__main__':
    main(sys.argv[1], sys.argv[2], sys.argv[3])
