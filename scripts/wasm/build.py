#!/usr/bin/env python3
"""Rebuild trusted Wasm using the Wasmtime C API shipped by shieldpm-nginx.
Usage: python3 scripts/wasm/build.py --library /usr/local/lib/libwasmtime.so
No compiler download or network access is required.
"""
import argparse
import ctypes
import hashlib
import json
from pathlib import Path
parser = argparse.ArgumentParser()
parser.add_argument('--library', default='/usr/local/lib/libwasmtime.so')
args = parser.parse_args()
root = Path(__file__).resolve().parents[2] / 'backend' / 'wasm'
class ByteVec(ctypes.Structure):
    _fields_ = [('size', ctypes.c_size_t), ('data', ctypes.POINTER(ctypes.c_ubyte))]
lib = ctypes.CDLL(args.library)
lib.wasmtime_wat2wasm.argtypes = [ctypes.c_char_p, ctypes.c_size_t, ctypes.POINTER(ByteVec)]
lib.wasmtime_wat2wasm.restype = ctypes.c_void_p
lib.wasm_byte_vec_delete.argtypes = [ctypes.POINTER(ByteVec)]
source = (root / 'policy.wat').read_bytes()
vec = ByteVec()
if lib.wasmtime_wat2wasm(source, len(source), ctypes.byref(vec)):
    raise SystemExit('Invalid policy.wat')
try:
    binary = ctypes.string_at(vec.data, vec.size)
finally:
    lib.wasm_byte_vec_delete(ctypes.byref(vec))
(root / 'policy.wasm').write_bytes(binary)
manifest = {'version':'1.0.0','abi':'0.2.1','module':'api7/wasm-nginx-module',
            'file':'policy.wasm','sha256':hashlib.sha256(binary).hexdigest(),
            'source_sha256':hashlib.sha256(source).hexdigest()}
(root / 'manifest.json').write_text(json.dumps(manifest, indent=2) + '\n')
print(manifest['sha256'])
