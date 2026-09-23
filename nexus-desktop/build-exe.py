#!/usr/bin/env python3
"""Build the Windows companion as a single executable + release zip.

Usage, from nexus-desktop/:
    python3 build-exe.py            # writes ../nexus-companion-<version>-win-x64.zip

The exe is an official node.exe (downloaded once into .cache/) with a Node SEA
blob injected via postject (fetched with npx). Runtime code is NOT bundled:
the zip carries nexus-desktop/ and nexus-addon/ next to the exe, so the
companion runs the exact files the Firefox addon ships. Version comes from
nexus-addon/manifest.json.
"""
import io
import json
import os
import shutil
import subprocess
import sys
import urllib.request
import zipfile

HERE = os.path.dirname(os.path.abspath(__file__))
ROOT = os.path.dirname(HERE)
ADDON = os.path.join(ROOT, 'nexus-addon')
CACHE = os.path.join(HERE, '.cache')
NODE_ZIP = 'node-v24.21.0-win-x64.zip'
NODE_URL = f'https://nodejs.org/dist/v24.21.0/{NODE_ZIP}'
FUSE = 'NODE_SEA_FUSE_fce680ab2cc467b6e072b8b5df1996b2'
COMPANION_FILES = ['companion.mjs', 'version.mjs', 'page-shim.js', 'README.md']
# Everything lands in one folder, so unzipping drops a single tidy directory
# instead of three loose entries. The updater strips it back off.
TOP = 'nexus companion'

sys.path.insert(0, ADDON)
from build import FILES as ADDON_FILES  # noqa: E402  — same whitelist as the xpi


def node_exe():
    """Official Windows node.exe, cached."""
    os.makedirs(CACHE, exist_ok=True)
    exe = os.path.join(CACHE, 'node.exe')
    if not os.path.exists(exe):
        print(f'downloading {NODE_URL}')
        data = urllib.request.urlopen(NODE_URL).read()
        with zipfile.ZipFile(io.BytesIO(data)) as z:
            name = next(n for n in z.namelist() if n.endswith('/node.exe'))
            with open(exe, 'wb') as f:
                f.write(z.read(name))
        os.chmod(exe, 0o755)   # WSL interop needs the exec bit to launch it
    return exe


def win_stage():
    """A directory the Windows node.exe can use as cwd. The SEA blob must be
    produced by the very node build it is injected into, so on WSL the
    downloaded node.exe runs through interop, in %TEMP% (no UNC cwd)."""
    if sys.platform == 'win32':
        return HERE
    temp = subprocess.run(['cmd.exe', '/c', 'echo %TEMP%'], capture_output=True, text=True).stdout.strip()
    stage = os.path.join(subprocess.run(['wslpath', temp], capture_output=True, text=True).stdout.strip(), 'nexus-companion-build')
    os.makedirs(stage, exist_ok=True)
    return stage


def set_gui_subsystem(exe):
    """Flip the PE subsystem from console (3) to GUI (2) so the exe opens no
    console window. Output goes to DATA/companion.log and the dashboard's
    Companion screen instead."""
    with open(exe, 'r+b') as f:
        f.seek(0x3C)
        pe = int.from_bytes(f.read(4), 'little')
        f.seek(pe)
        assert f.read(4) == b'PE\0\0', 'not a PE file'
        f.seek(pe + 0x5C)
        assert int.from_bytes(f.read(2), 'little') == 3, 'unexpected subsystem'
        f.seek(pe + 0x5C)
        f.write((2).to_bytes(2, 'little'))


def build(version):
    stage = win_stage()
    if stage != HERE:   # on Windows the stage is HERE and the files are already there
        for name in ('sea-entry.cjs', 'sea-config.json'):
            shutil.copyfile(os.path.join(HERE, name), os.path.join(stage, name))
    blob = os.path.join(stage, 'sea-prep.blob')
    exe = os.path.join(stage, 'nexus-companion.exe')
    subprocess.run([node_exe(), '--experimental-sea-config', 'sea-config.json'], cwd=stage, check=True)
    shutil.copyfile(node_exe(), exe)
    # which() resolves npx.cmd on Windows, where CreateProcess won't.
    npx = shutil.which('npx') or 'npx'
    subprocess.run([npx, '--yes', 'postject', exe, 'NODE_SEA_BLOB', blob, '--sentinel-fuse', FUSE], check=True)
    os.remove(blob)
    set_gui_subsystem(exe)

    target = os.path.join(ROOT, f'nexus-companion-{version}-win-x64.zip')
    with zipfile.ZipFile(target, 'w', zipfile.ZIP_DEFLATED) as z:
        z.write(exe, f'{TOP}/nexus-companion.exe')
        for name in COMPANION_FILES:
            z.write(os.path.join(HERE, name), f'{TOP}/nexus-desktop/{name}')
        for name in ADDON_FILES:
            z.write(os.path.join(ADDON, name), f'{TOP}/nexus-addon/{name}')
    os.remove(exe)
    print(f'built {os.path.basename(target)} ({os.path.getsize(target) // 1024 // 1024} MB)')


if __name__ == '__main__':
    with open(os.path.join(ADDON, 'manifest.json')) as f:
        build(json.load(f)['version'])
