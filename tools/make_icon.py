#!/usr/bin/env python3
"""
Generate the app icon everywhere it is needed, from one definition.

    python3 tools/make_icon.py

The icon is the hot-face emoji on a light ombre. It is written as:

    icon.svg              the master (scalable, what you edit below)
    apple-touch-icon.png  180px -- iOS home screen
    icon-192.png          Android / manifest
    icon-512.png          Android / manifest, splash
    site.webmanifest      so a phone knows which icon to use

and inlined as a base64 data URI in two places, so the SAME artwork shows up
even when there is no file alongside the page:

    index.html            <link rel="icon">        (survives tools/build.py)
    css/style.css         .brand .mark background  (the in-app logo)

Rasterising uses macOS qlmanage + sips, so the emoji is the real Apple glyph
rather than whatever font a viewer happens to have. Rerun after editing SVG.
"""
import base64, re, shutil, subprocess, sys, tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parent.parent

# --- the icon itself -------------------------------------------------------
# A light cream->sky ombre: the cool end picks up the emoji's sweat drop and
# throws the orange face forward, which a warm background does not.
STOPS = [('0%', '#FFFDF6'), ('50%', '#E8F4FF'), ('100%', '#A9D8F5')]
EMOJI = '&#129397;'   # U+1F975 hot face

SVG = f'''<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 512 512" width="512" height="512">
  <defs><linearGradient id="bg" x1="0" y1="0" x2="1" y2="1">
    {''.join(f'<stop offset="{o}" stop-color="{c}"/>' for o, c in STOPS)}
  </linearGradient></defs>
  <rect width="512" height="512" rx="114" fill="url(#bg)"/>
  <text x="256" y="262" font-size="350" text-anchor="middle"
        dominant-baseline="central">{EMOJI}</text>
</svg>
'''


def need(cmd):
    if not shutil.which(cmd):
        sys.exit(f'{cmd} not found -- this script needs macOS (qlmanage + sips).')


def main():
    need('qlmanage'); need('sips')
    (ROOT / 'icon.svg').write_text(SVG, encoding='utf-8')

    with tempfile.TemporaryDirectory() as tmp:
        tmp = Path(tmp)
        subprocess.run(['qlmanage', '-t', '-s', '512', '-o', str(tmp), str(ROOT / 'icon.svg')],
                       check=True, capture_output=True)
        master = tmp / 'icon.svg.png'
        if not master.exists():
            sys.exit('qlmanage produced no PNG -- cannot rasterise the icon.')

        sizes = {'apple-touch-icon.png': 180, 'icon-192.png': 192, 'icon-512.png': 512}
        for name, px in sizes.items():
            subprocess.run(['sips', '-z', str(px), str(px), str(master), '--out', str(ROOT / name)],
                           check=True, capture_output=True)
            print(f'  wrote {name}  ({px}px)')

        # the inline copy: 96px covers a 34px logo at 3x and a browser tab
        inline = tmp / 'inline.png'
        subprocess.run(['sips', '-z', '96', '96', str(master), '--out', str(inline)],
                       check=True, capture_output=True)
        uri = 'data:image/png;base64,' + base64.b64encode(inline.read_bytes()).decode()

    # --- index.html: favicon + home-screen links ---------------------------
    html = (ROOT / 'index.html').read_text(encoding='utf-8')
    links = (f'<link rel="icon" href="{uri}">\n'
             '<link rel="apple-touch-icon" href="apple-touch-icon.png">\n'
             '<link rel="manifest" href="site.webmanifest">')
    # match to end of LINE, not to the first '>': an inline-SVG favicon href
    # contains '>' characters and a '[^>]*' pattern stops inside it
    html, n = re.subn(r'^<link rel="icon".*$(?:\n<link rel="apple-touch-icon".*$)?'
                      r'(?:\n<link rel="manifest".*$)?', links, html, count=1, flags=re.M)
    if not n:
        sys.exit('index.html: no <link rel="icon"> to replace.')
    (ROOT / 'index.html').write_text(html, encoding='utf-8')
    print('  patched index.html')

    # --- the in-app logo ---------------------------------------------------
    css = (ROOT / 'css/style.css').read_text(encoding='utf-8')
    css, n = re.subn(r'(/\* app icon -- generated \*/\s*\.brand \.mark\{[^}]*?background-image:url\()[^)]*(\))',
                     lambda m: m.group(1) + uri + m.group(2), css, count=1)
    if not n:
        sys.exit('css/style.css: no generated .brand .mark rule to patch. '
                 'Add one first (see the marker comment).')
    (ROOT / 'css/style.css').write_text(css, encoding='utf-8')
    print('  patched css/style.css')

    (ROOT / 'site.webmanifest').write_text('''{
  "name": "Sweaty Dyno",
  "short_name": "Sweaty Dyno",
  "start_url": ".",
  "display": "standalone",
  "background_color": "#0E131A",
  "theme_color": "#0A0D11",
  "icons": [
    { "src": "icon-192.png", "sizes": "192x192", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png" },
    { "src": "icon-512.png", "sizes": "512x512", "type": "image/png", "purpose": "maskable" }
  ]
}
''', encoding='utf-8')
    print('  wrote site.webmanifest')
    print('\nNow rerun: python3 tools/build.py')


if __name__ == '__main__':
    main()
