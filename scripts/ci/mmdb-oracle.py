#!/usr/bin/env python3
"""Independent smoke oracle using libmaxminddb's public Linux 64-bit ABI.

Structures match MaxMind/libmaxminddb include/maxminddb.h at tag 1.9.1.
No MMDB bytes are parsed here: lookups and values come from the native library.
The Docker smoke supports amd64/arm64, whose native uint128 alignment is 16.
"""

import ctypes as c
import ctypes.util
import json
import os
import sys


class Entry(c.Structure):
    _fields_ = [("mmdb", c.c_void_p), ("offset", c.c_uint32)]


class LookupResult(c.Structure):
    _fields_ = [("found_entry", c.c_bool), ("entry", Entry), ("netmask", c.c_uint16)]


class Value(c.Union):
    _fields_ = [("pointer", c.c_uint32), ("utf8_string", c.c_void_p),
                ("double_value", c.c_double), ("bytes", c.c_void_p),
                ("uint16", c.c_uint16), ("uint32", c.c_uint32),
                ("int32", c.c_int32), ("uint64", c.c_uint64),
                ("uint128_alignment", c.c_longdouble),
                ("boolean", c.c_bool), ("float_value", c.c_float)]


class EntryData(c.Structure):
    _fields_ = [("has_data", c.c_bool), ("value", Value),
                ("offset", c.c_uint32), ("offset_to_next", c.c_uint32),
                ("data_size", c.c_uint32), ("type", c.c_uint32)]


def query(database, addresses):
    abi = (c.sizeof(c.c_void_p), c.alignment(Value), c.sizeof(EntryData),
           EntryData.value.offset, EntryData.type.offset,
           c.sizeof(Entry), Entry.offset.offset, c.sizeof(LookupResult),
           LookupResult.entry.offset, LookupResult.netmask.offset)
    if abi != (8, 16, 48, 16, 44, 16, 8, 32, 8, 24):
        raise RuntimeError("MMDB oracle requires the supported Linux amd64/arm64 ABI")
    library = c.CDLL(os.environ.get("MMDB_ORACLE_LIBRARY") or
                     ctypes.util.find_library("maxminddb") or "libmaxminddb.so.0")
    library.MMDB_open.argtypes = [c.c_char_p, c.c_uint32, c.c_void_p]
    library.MMDB_open.restype = c.c_int
    library.MMDB_lookup_string.argtypes = [c.c_void_p, c.c_char_p,
                                          c.POINTER(c.c_int), c.POINTER(c.c_int)]
    library.MMDB_lookup_string.restype = LookupResult
    library.MMDB_aget_value.argtypes = [c.POINTER(Entry), c.POINTER(EntryData),
                                      c.POINTER(c.c_char_p)]
    library.MMDB_aget_value.restype = c.c_int
    library.MMDB_close.argtypes = [c.c_void_p]
    library.MMDB_strerror.argtypes = [c.c_int]
    library.MMDB_strerror.restype = c.c_char_p
    # The public MMDB_s contains no uint128 value; overallocate aligned storage
    # rather than reproducing metadata structures that the oracle never reads.
    storage = (c.c_longdouble * 256)()

    def check(code):
        if code:
            raise RuntimeError(library.MMDB_strerror(code).decode())

    check(library.MMDB_open(os.fsencode(database), 1, c.byref(storage)))
    try:
        def value(entry, *keys):
            data = EntryData()
            keys_array = (c.c_char_p * (len(keys) + 1))(
                *(key.encode() for key in keys), None)
            code = library.MMDB_aget_value(c.byref(entry), c.byref(data), keys_array)
            if code == 9:
                return None
            check(code)
            if not data.has_data:
                return None
            if data.type == 2:
                return c.string_at(data.value.utf8_string, data.data_size).decode("utf-8")
            if data.type == 6:
                return data.value.uint32
            raise RuntimeError(f"Unexpected MMDB value type: {data.type}")

        results = []
        for address in addresses:
            gai_error, mmdb_error = c.c_int(), c.c_int()
            result = library.MMDB_lookup_string(c.byref(storage), address.encode(),
                                                c.byref(gai_error), c.byref(mmdb_error))
            if gai_error.value:
                raise RuntimeError(f"Invalid oracle address: {address}")
            # An IPv4-only fixture cannot assign an IPv6 address.
            if mmdb_error.value != 11:
                check(mmdb_error.value)
            else:
                result.found_entry = False
            results.append({"ip": address,
                            "asn": value(result.entry, "autonomous_system_number") if result.found_entry else None,
                            "organization": value(result.entry, "autonomous_system_organization") if result.found_entry else None,
                            "country": value(result.entry, "country", "iso_code") if result.found_entry else None})
        return results
    finally:
        library.MMDB_close(c.byref(storage))


if __name__ == "__main__":
    print(json.dumps(query(sys.argv[1], sys.argv[2:])))
