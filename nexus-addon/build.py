#!/usr/bin/env python3
"""Build the addon xpi at the repo root, named after the manifest version.

Usage: python3 build.py    (from nexus-addon/)
Removes any older nexus-accounting-*.xpi at the repo root first.
"""
import glob
import json
import os
import zipfile

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


def main():
    with open(os.path.join(HERE, 'manifest.json')) as f:
        version = json.load(f)['version']

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


if __name__ == '__main__':
    main()
