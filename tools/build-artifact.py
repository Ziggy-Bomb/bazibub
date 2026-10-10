#!/usr/bin/env python3
"""Build the Claude-artifact variant of fieldops.html.

The artifact host wraps the page in its own <!doctype>/<html>/<head>/<body>
skeleton (charset + viewport included), so this strips ours. Everything else
is identical: the page detects the artifact at runtime and switches to the
live-room transport, manual nav and the procedural tactical map.

usage: python3 tools/build-artifact.py [out.html]
"""
import re, sys, pathlib
src = pathlib.Path(__file__).resolve().parent.parent / 'fieldops.html'
out = pathlib.Path(sys.argv[1] if len(sys.argv) > 1 else 'fieldops-artifact.html')
html = src.read_text()
for pat in [r'<!doctype html>\s*', r'<html[^>]*>\s*', r'</html>\s*', r'<head>\s*', r'</head>\s*',
            r'<body>\s*', r'</body>\s*', r'<meta charset[^>]*>\s*', r'<meta name="viewport"[^>]*>\s*']:
    html = re.sub(pat, '', html, flags=re.I)
assert html.lstrip().startswith('<meta name="theme-color"') or html.lstrip().startswith('<title>'), html[:80]
out.write_text(html)
print(f'wrote {out} ({len(html):,} bytes)')
