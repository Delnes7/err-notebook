#!/usr/bin/env python3
"""Bundle the shared app and pinned CDN dependencies for offline iOS startup.

Uses curl's system TLS trust, verifies cached/downloaded bytes against ios/web-dependencies.json.
Run --update-lock only when intentionally changing the dependency list.
"""
from pathlib import Path
import argparse, concurrent.futures, hashlib, json, re, shutil, subprocess

ROOT = Path(__file__).resolve().parents[1]
OUT = ROOT / 'ios/ErrorNotebook/Web'
CACHE = ROOT / '.ios-cache'
LOCK = ROOT / 'ios/web-dependencies.json'
ASSETS = {
    'tailwind.js': 'https://cdn.tailwindcss.com/3.4.17',
    'katex.min.css': 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css',
    'katex.min.js': 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js',
    'chart.umd.min.js': 'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js',
    'prism.min.css': 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css',
    'prism.min.js': 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js',
    'licenses/tailwind.txt': 'https://cdn.jsdelivr.net/npm/tailwindcss@3.4.17/LICENSE',
    'licenses/katex.txt': 'https://cdn.jsdelivr.net/npm/katex@0.16.9/LICENSE',
    'licenses/chart.txt': 'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/LICENSE.md',
    'licenses/prism.txt': 'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/LICENSE',
    'licenses/supabase.txt': 'https://raw.githubusercontent.com/supabase/supabase-js/v2.86.0/LICENSE',
    'supabase.js': 'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2.86.0/dist/umd/supabase.js',
}

def main():
    parser = argparse.ArgumentParser()
    parser.add_argument('--update-lock', action='store_true')
    args = parser.parse_args()
    lock = json.loads(LOCK.read_text()) if LOCK.exists() else {}
    if not lock and not args.update_lock:
        raise SystemExit('Dependency lock missing. Review URLs and run --update-lock.')
    CACHE.mkdir(exist_ok=True)
    fetched = {}
    def fetch(item):
        name, url = item
        target = CACHE / name
        target.parent.mkdir(parents=True, exist_ok=True)
        if not target.exists():
            temp = target.with_suffix(target.suffix + '.download')
            subprocess.run(['curl', '--fail', '--silent', '--show-error', '--location', '--max-time', '90', '--retry', '2', '--output', str(temp), url], check=True)
            temp.replace(target)
        digest = hashlib.sha256(target.read_bytes()).hexdigest()
        if not args.update_lock and lock.get(name) != {'url': url, 'sha256': digest}:
            raise RuntimeError(f'Dependency hash mismatch: {name}; remove cache and retry, or review the update.')
        return name, {'url': url, 'sha256': digest}
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        fetched.update(pool.map(fetch, ASSETS.items()))
    fonts = set(re.findall(r'url\((fonts/[^)]+\.woff2)\)', (CACHE / 'katex.min.css').read_text()))
    with concurrent.futures.ThreadPoolExecutor(max_workers=4) as pool:
        fetched.update(pool.map(fetch, [(name, 'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/' + name) for name in sorted(fonts)]))
    if args.update_lock:
        LOCK.write_text(json.dumps(fetched, indent=2) + '\n')
    if OUT.exists(): shutil.rmtree(OUT)
    OUT.mkdir(parents=True)
    for folder in ['js', 'css']:
        shutil.copytree(ROOT / folder, OUT / folder)
    for name in fetched:
        target = OUT / 'vendor' / name
        target.parent.mkdir(parents=True, exist_ok=True)
        shutil.copy2(CACHE / name, target)
    html = (ROOT / 'index.html').read_text()
    replacements = {
        'https://cdn.tailwindcss.com': 'vendor/tailwind.js',
        'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.css': 'vendor/katex.min.css',
        'https://cdn.jsdelivr.net/npm/katex@0.16.9/dist/katex.min.js': 'vendor/katex.min.js',
        'https://cdn.jsdelivr.net/npm/chart.js@4.4.2/dist/chart.umd.min.js': 'vendor/chart.umd.min.js',
        'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/themes/prism-tomorrow.min.css': 'vendor/prism.min.css',
        'https://cdn.jsdelivr.net/npm/prismjs@1.29.0/prism.min.js': 'vendor/prism.min.js',
        'https://cdn.jsdelivr.net/npm/@supabase/supabase-js@2': 'vendor/supabase.js',
    }
    for url, local in replacements.items(): html = html.replace(url, local)
    html = re.sub(r'\s*<script[^>]+(?:prism-autoloader|heic-to)[^>]*></script>', '', html)
    # Cross-origin SRI is unnecessary for locally bundled, hash-verified resources.
    html = re.sub(r' integrity="[^"]+"| crossorigin="[^"]+"', '', html)
    html = html.replace('<script src="js/db.js">', '<script src="native.js"></script>\n  <script src="js/db.js">')
    (OUT / 'index.html').write_text(html)
    shutil.copy2(ROOT / 'ios/ErrorNotebook/native.js', OUT / 'native.js')
    css = OUT / 'css/style.css'
    css.write_text(css.read_text() + '\n.native-ios #top-nav { padding-top: 0; }\n.native-ios body { padding-bottom: max(16px, env(safe-area-inset-bottom)); }\n')
    print(f'iOS web bundle: {len(fetched)} verified assets, {sum(p.stat().st_size for p in OUT.rglob("*") if p.is_file()) // 1024} KiB')

if __name__ == '__main__': main()
