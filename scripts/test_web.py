#!/usr/bin/env python3
"""Run the shared JavaScript security regression tests with JavaScriptCore."""
import subprocess, tempfile
from pathlib import Path
ROOT = Path(__file__).resolve().parents[1]
JSC = '/System/Library/Frameworks/JavaScriptCore.framework/Versions/Current/Helpers/jsc'
STORAGE = "var window = {}; var store = {}; var localStorage = {getItem:k=>store[k]??null,setItem:(k,v)=>{store[k]=String(v)},removeItem:k=>{delete store[k]}}; var document={addEventListener:()=>{}};\n"
suites = {
    'security-smoke': ['js/ai.js', 'js/sync.js', 'tests/security-smoke.js'],
    'render-security': ['js/markdown.js', 'js/app.js', 'tests/render-security.js'],
    'markdown-security': ['js/markdown.js', 'tests/markdown-security.js'],
}
for name, files in suites.items():
    with tempfile.NamedTemporaryFile(mode='w', suffix='.js') as f:
        f.write(STORAGE + '\n'.join((ROOT / p).read_text() for p in files))
        f.flush()
        result = subprocess.run([JSC, f.name], text=True, capture_output=True)
    if result.returncode or 'PASS' not in result.stdout or 'FAIL' in result.stdout:
        raise SystemExit(f'{name}: {result.stdout}{result.stderr}')
    print(result.stdout.strip())
