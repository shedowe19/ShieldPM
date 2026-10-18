;; Independent JSON v1 responder. Default response is binary HTTP 207;
;; argv[1] beginning with "2" or "3" selects HTTP 204 or 304 respectively.
;; Deliberate bodies on 204 and 304 verify the HTTP adapter suppresses them.
(module
  (import "wasi_snapshot_preview1" "fd_write" (func $write (param i32 i32 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "args_sizes_get" (func $sizes (param i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "args_get" (func $args (param i32 i32) (result i32)))
  (memory (export "memory") 1)
  (data (i32.const 128) "{\22version\22:1,\22action\22:\22respond\22,\22response\22:{\22status\22:207,\22headers\22:[{\22name\22:\22X-Wasi-Response\22,\22value\22:\22independent\22},{\22name\22:\22Content-Type\22,\22value\22:\22application/octet-stream\22}],\22body_base64\22:\22AP+AQQo=\22}}")
  (func (export "_start")
    (local $first i32)
    (drop (call $sizes (i32.const 16) (i32.const 20)))
    (if (i32.gt_u (i32.load (i32.const 16)) (i32.const 1)) (then
      (drop (call $args (i32.const 512) (i32.const 1024)))
      (local.set $first (i32.load8_u (i32.load (i32.const 516))))
      (if (i32.eq (local.get $first) (i32.const 50))
        (then (i32.store8 (i32.const 183) (i32.const 52))))
      (if (i32.eq (local.get $first) (i32.const 51))
        (then
          (i32.store8 (i32.const 181) (i32.const 51))
          (i32.store8 (i32.const 183) (i32.const 52))))))
    (i32.store (i32.const 0) (i32.const 128))
    (i32.store (i32.const 4) (i32.const 203))
    (if (call $write (i32.const 1) (i32.const 0) (i32.const 1) (i32.const 8)) (then unreachable))))
