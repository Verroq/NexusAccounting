#!/usr/bin/env python3
"""Build (and optionally submit) the addon.

Usage, from nexus-addon/:
    python3 build.py            build the unsigned xpi at the repo root
    python3 build.py --sign     submit the version to AMO (LISTED channel)
                                for review and public distribution

Submission needs AMO credentials in the environment or in ../.env
(gitignored):
    WEB_EXT_API_KEY=user:12345678:123
    WEB_EXT_API_SECRET=...

Listed versions are reviewed by Mozilla humans and distributed/updated by
AMO itself — there is no self-hosted update channel. Track review status at
https://addons.mozilla.org/developers/addons.
"""
import glob
import json
import os
import shutil
import subprocess
import sys

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)

FILES = [
    'manifest.json',
    'package.json',
    'background.js',
    'dashboard.html', 'dashboard.css', 'dashboard.js', 'common.js',
    'tabs/surveys.js', 'tabs/pirates.js', 'tabs/mining.js',
    'tabs/debris.js', 'tabs/expeditions.js', 'tabs/finder.js',
    'simulator.html', 'simulator.css', 'simulator.js',
    'simulator-intel.js', 'simulator-validate.js', 'engine.js',
    'chart.umd.js',
    'icons/icon128.png',
]


def read_version():
    with open(os.path.join(HERE, 'manifest.json')) as f:
        return json.load(f)['version']


def build(version):
    import zipfile
    target = os.path.join(ROOT, f'nexus-accounting-{version}.xpi')
    for old in glob.glob(os.path.join(ROOT, 'nexus-accounting-*.xpi')):
        if old != target:
            os.remove(old)
            print(f'removed {os.path.basename(old)}')
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as z:
        for name in FILES:
            z.write(os.path.join(HERE, name), name)
    size = os.path.getsize(target) // 1024
    print(f'built {os.path.basename(target)} ({size} KB, {len(FILES)} files)')
    return target


def load_env():
    """Fill os.environ from ../.env (KEY=value lines), without overriding."""
    path = os.path.join(ROOT, '.env')
    if not os.path.exists(path):
        return
    with open(path) as f:
        for line in f:
            line = line.strip()
            if line and not line.startswith('#') and '=' in line:
                k, _, v = line.partition('=')
                os.environ.setdefault(k.strip(), v.strip())


def sign(version):
    load_env()
    key = os.environ.get('WEB_EXT_API_KEY')
    secret = os.environ.get('WEB_EXT_API_SECRET')
    if not key or not secret:
        sys.exit('Missing WEB_EXT_API_KEY / WEB_EXT_API_SECRET (env or ../.env).')

    artifacts = os.path.join(ROOT, 'web-ext-artifacts')
    cmd = [
        'npx', '--yes', 'web-ext', 'sign',
        '--source-dir', HERE,
        '--artifacts-dir', artifacts,
        '--channel', 'listed',
        '--api-key', key,
        '--api-secret', secret,
        # web-ext refuses files it doesn't recognize unless ignored explicitly
        '--ignore-files', 'build.py', 'web-ext-artifacts', '.amo-upload-uuid',
    ]
    print(f'submitting {version} to AMO (listed channel, human review)…')
    result = subprocess.run(cmd)

    signed = sorted(glob.glob(os.path.join(artifacts, '*.xpi')), key=os.path.getmtime)
    if signed and f'-{version}.xpi' in signed[-1]:
        # Only happens if the version was approved while we waited.
        shutil.copy2(signed[-1], os.path.join(ROOT, os.path.basename(signed[-1])))
        print(f'approved and signed: {os.path.basename(signed[-1])}')
    else:
        print()
        print('Submitted for review. AMO distributes and auto-updates the addon')
        print('once approved — track status at')
        print('https://addons.mozilla.org/developers/addons')
        if result.returncode != 0:
            print('(web-ext exited non-zero: usual for listed submissions that')
            print(' end while the review is still pending — check the page above.)')


def main():
    version = read_version()
    build(version)
    if '--sign' in sys.argv:
        sign(version)


if __name__ == '__main__':
    main()
