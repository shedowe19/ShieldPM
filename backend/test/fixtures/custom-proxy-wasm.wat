;; Independent uploaded-module fixture. The response header returns the exact JSON
;; bytes passed through proxy_get_configuration, proving this is not a preset.
(module
 (import "env" "proxy_get_configuration" (func $configuration (param i32 i32) (result i32)))
 (import "env" "proxy_replace_header_map_value" (func $header (param i32 i32 i32 i32 i32) (result i32)))
 (import "env" "proxy_get_buffer_bytes" (func $buffer (param i32 i32 i32 i32 i32) (result i32)))
 (memory (export "memory") 2 2)
 (global $allocation (mut i32) (i32.const 4096))
 (global $http_context (mut i32) (i32.const 0))
 (global $request_end (mut i32) (i32.const 1))
 (global $response_trap (mut i32) (i32.const 0))
 (global $request_trap (mut i32) (i32.const 0))
 (global $request_chunks (mut i32) (i32.const 0))
 (global $request_final (mut i32) (i32.const 0))
 (func (export "proxy_abi_version_0_2_1"))
 (func (export "proxy_on_memory_allocate") (param $size i32) (result i32)
  (local $result i32)
  global.get $allocation local.set $result
  global.get $allocation local.get $size i32.add global.set $allocation
  local.get $result)
 (func (export "proxy_on_context_create") (param i32 i32))
 (func (export "proxy_on_configure") (param i32 i32) (result i32)
  i32.const 0 i32.const 4 call $configuration
  i32.eqz if else unreachable end
  ;; Deliberate traps are selected only by fixture JSON byte lengths.
  i32.const 4 i32.load i32.const 13 i32.eq global.set $response_trap
  i32.const 4 i32.load i32.const 18 i32.eq global.set $request_trap
  i32.const 1)
 (func (export "proxy_on_done") (param i32) (result i32) i32.const 1)
 (func (export "proxy_on_delete") (param i32))
 (data (i32.const 64) "x-shieldpm-probe")
 (data (i32.const 96) "uploaded-module")
 (data (i32.const 128) "x-custom-response")
 (data (i32.const 256) "x-custom-chunks")
 (data (i32.const 288) "x-custom-final")
 (func (export "proxy_on_request_headers") (param $ctx i32) (param i32) (param $end i32)
  (result i32)
  local.get $ctx global.set $http_context
  local.get $end global.set $request_end
  i32.const 0 global.set $request_chunks
  i32.const 0 global.set $request_final
  i32.const 0 i32.const 64 i32.const 16 i32.const 96 i32.const 15 call $header
  i32.eqz if else unreachable end
  i32.const 0)
 (func (export "proxy_on_request_body") (param $ctx i32) (param $size i32) (param $end i32) (result i32)
  global.get $http_context i32.eqz if local.get $ctx global.set $http_context end
  global.get $http_context local.get $ctx i32.ne if unreachable end
  ;; API7 0.7 native headers deliberately hardcode this flag to true.
  global.get $request_end i32.eqz if unreachable end
  global.get $request_trap if unreachable end
  global.get $request_chunks i32.const 1 i32.add global.set $request_chunks
  local.get $end global.set $request_final
  i32.const 0 i32.const 0 local.get $size i32.const 8 i32.const 12 call $buffer
  i32.eqz if else unreachable end
  local.get $end if
   i32.const 0 i32.const 64 i32.const 16 i32.const 8 i32.load i32.const 12 i32.load call $header
   i32.eqz if else unreachable end
  end
  i32.const 0)
 (func (export "proxy_on_response_headers") (param $ctx i32) (param i32) (param $end i32) (result i32)
  global.get $http_context local.get $ctx i32.ne if unreachable end
  local.get $end i32.eqz if unreachable end
  i32.const 2 i32.const 128 i32.const 17 i32.const 0 i32.load i32.const 4 i32.load call $header
  i32.eqz if else unreachable end
  i32.const 32 global.get $request_chunks i32.const 48 i32.add i32.store8
  i32.const 33 global.get $request_final i32.const 48 i32.add i32.store8
  i32.const 2 i32.const 256 i32.const 15 i32.const 32 i32.const 1 call $header
  i32.eqz if else unreachable end
  i32.const 2 i32.const 288 i32.const 14 i32.const 33 i32.const 1 call $header
  i32.eqz if else unreachable end
  i32.const 0)
 (func (export "proxy_on_response_body") (param $ctx i32) (param i32 i32) (result i32)
  global.get $http_context i32.eqz if local.get $ctx global.set $http_context end
  global.get $http_context local.get $ctx i32.ne if unreachable end
  global.get $response_trap if unreachable end
  i32.const 0)
)
