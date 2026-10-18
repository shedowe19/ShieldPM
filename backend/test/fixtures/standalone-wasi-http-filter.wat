;; Independent WASI HTTP JSON v1 filter. Replace a body including a NUL byte,
;; replace a request header, and remove another header before the real upstream.
(module
  (import "wasi_snapshot_preview1" "fd_write" (func $write (param i32 i32 i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "args_sizes_get" (func $sizes (param i32 i32) (result i32)))
  (memory (export "memory") 1)
  (data (i32.const 128) "{\22version\22:1,\22action\22:\22continue\22,\22request\22:{\22headers\22:[{\22name\22:\22X-Wasi-Filter\22,\22value\22:\22trusted\22},{\22name\22:\22X-Remove-Me\22,\22value\22:null}],\22body_base64\22:\22cmV3cml0dGVuAGJpbmFyeQ==\22}}")
  ;; An argument chooses ASCII body bytes for a later Proxy-Wasm fixture that
  ;; reflects its body into a request header (where NUL bytes are forbidden).
  (data (i32.const 512) "cmV3cml0dGVuX2JpbmFyeQ==")
  (func (export "_start")
    (drop (call $sizes (i32.const 16) (i32.const 20)))
    (if (i32.gt_u (i32.load (i32.const 16)) (i32.const 1)) (then
      (memory.copy (i32.const 278) (i32.const 512) (i32.const 24))))
    (i32.store (i32.const 0) (i32.const 128))
    (i32.store (i32.const 4) (i32.const 177))
    (if (call $write (i32.const 1) (i32.const 0) (i32.const 1) (i32.const 8)) (then unreachable))))
