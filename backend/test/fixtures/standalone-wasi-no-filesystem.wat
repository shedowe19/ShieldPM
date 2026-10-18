(module
  (import "wasi_snapshot_preview1" "fd_prestat_get" (func $prestat (param i32 i32) (result i32)))
  (import "wasi_snapshot_preview1" "environ_sizes_get" (func $environment (param i32 i32) (result i32)))
  (memory (export "memory") 1)
  (func (export "_start")
    ;; Without a preopened directory fd 3 must return WASI EBADF (8).
    (if (i32.ne (call $prestat (i32.const 3) (i32.const 0)) (i32.const 8)) (then unreachable))
    (drop (call $environment (i32.const 16) (i32.const 20)))
    (if (i32.ne (i32.load (i32.const 16)) (i32.const 0)) (then unreachable))))
