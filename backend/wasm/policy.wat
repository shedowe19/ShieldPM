;; ShieldPM trusted policy filter v1. Proxy-Wasm ABI 0.2.1, API7 host subset.
;; Fixed 64-KiB memory; every loop is bounded by validated configuration/header lengths.
(module
 (import "env" "proxy_get_configuration" (func $config (param i32 i32) (result i32)))
 (import "env" "proxy_get_header_map_value" (func $get (param i32 i32 i32 i32 i32) (result i32)))
 (import "env" "proxy_replace_header_map_value" (func $set (param i32 i32 i32 i32 i32) (result i32)))
 (import "env" "proxy_remove_header_map_value" (func $remove (param i32 i32 i32) (result i32)))
 (import "env" "proxy_send_local_response" (func $respond (param i32 i32 i32 i32 i32 i32 i32 i32) (result i32)))
 (memory (export "memory") 1 1)
 (global $configured (mut i32) (i32.const 0))
 (global $allocation (mut i32) (i32.const 4096))
 (func (export "proxy_abi_version_0_2_1"))
 (func (export "proxy_on_memory_allocate") (param $size i32) (result i32)
  local.get $size i32.const 12288 i32.gt_u if i32.const 0 return end
  global.get $allocation)
 (func (export "proxy_on_context_create") (param i32 i32))
 (func (export "proxy_on_configure") (param i32 i32) (result i32)
  i32.const 4096 global.set $allocation
  i32.const 16 i32.const 20 call $config i32.eqz
  if
   i32.const 20 i32.load i32.const 16 i32.ge_u
   i32.const 20 i32.load i32.const 8208 i32.le_u i32.and
   if
    i32.const 4100 i32.load i32.const 128 i32.le_u
    i32.const 4104 i32.load i32.const 4096 i32.le_u i32.and
    i32.const 4100 i32.load i32.const 4104 i32.load i32.add i32.const 16 i32.add i32.const 20 i32.load i32.eq i32.and
    if i32.const 1 global.set $configured end
   end
  end
  i32.const 16384 global.set $allocation
  global.get $configured)
 (func (export "proxy_on_done") (param i32) (result i32) i32.const 1)
 (func (export "proxy_on_delete") (param i32))
 (data (i32.const 64) "Unauthorized")
 (func $name (result i32) i32.const 4112)
 (func $value (result i32) i32.const 4112 i32.const 4100 i32.load i32.add)
 (func $transform (param $map i32) (result i32)
  i32.const 4096 i32.load i32.const 3 i32.eq
  i32.const 4096 i32.load i32.const 5 i32.eq i32.or
  if (result i32)
   local.get $map call $name i32.const 4100 i32.load call $remove
  else
   local.get $map call $name i32.const 4100 i32.load call $value i32.const 4104 i32.load call $set
  end)
 (func (export "proxy_on_request_headers") (param i32 i32 i32) (result i32)
  (local $kind i32) (local $valid i32) (local $index i32) (local $different i32)
  global.get $configured i32.eqz if unreachable end
  i32.const 4096 i32.load local.set $kind
  local.get $kind i32.const 1 i32.eq
  if
   i32.const 0 call $name i32.const 4100 i32.load i32.const 24 i32.const 28 call $get i32.eqz
   if
    i32.const 28 i32.load i32.const 4104 i32.load i32.eq
    if
     i32.const 0 local.set $index
     block $done loop $compare
      local.get $index i32.const 4104 i32.load i32.ge_u br_if $done
      local.get $different
      i32.const 24 i32.load local.get $index i32.add i32.load8_u
      call $value local.get $index i32.add i32.load8_u i32.xor i32.or local.set $different
      local.get $index i32.const 1 i32.add local.set $index br $compare
     end end
     local.get $different i32.eqz local.set $valid
    end
   end
   local.get $valid i32.eqz if
    i32.const 401 i32.const 0 i32.const 0 i32.const 64 i32.const 12 i32.const 0 i32.const 0 i32.const -1 call $respond
    i32.eqz if else unreachable end
   end
  end
  local.get $kind i32.const 2 i32.eq local.get $kind i32.const 3 i32.eq i32.or
  if i32.const 0 call $transform i32.eqz if else unreachable end end
  local.get $kind i32.const 6 i32.eq
  if
   i32.const 4108 i32.load i32.const 0 i32.const 0 call $value i32.const 4104 i32.load i32.const 0 i32.const 0 i32.const -1 call $respond
   i32.eqz if else unreachable end
  end
  i32.const 0)
 (func (export "proxy_on_response_headers") (param i32 i32 i32) (result i32)
  (local $kind i32)
  i32.const 4096 i32.load local.set $kind
  local.get $kind i32.const 4 i32.eq local.get $kind i32.const 5 i32.eq i32.or
  if i32.const 2 call $transform i32.eqz if else unreachable end end
  i32.const 0)
)
