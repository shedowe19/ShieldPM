(module
  (memory (export "memory") 1)
  (func (export "_start")
    (if (i32.ne (memory.grow (i32.const 4096)) (i32.const -1))
      (then unreachable))))
