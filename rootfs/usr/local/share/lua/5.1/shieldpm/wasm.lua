-- ShieldPM administrator-trusted Proxy-Wasm dispatcher. Paths are generated from catalog digests.
require "resty.core"
local cjson = require "cjson.safe"
local wasm
local sha256 = require "resty.sha256"
local hex = require "resty.string"
local M = {}
local cache = {}
local last_error = {}
local function callback(filter, name)
    return filter.callbacks and filter.callbacks[name] == true
end
local function read(path)
    local file, err = io.open(path, "rb")
    if not file then return nil, err end
    local bytes = file:read("*a")
    file:close()
    return bytes
end
local function report(chain, filter, phase)
    local now = ngx.now()
    if chain.status_path and (last_error[chain.status_path] or 0) + 1 < now then
        last_error[chain.status_path] = now
        local file = io.open(chain.status_path, "w")
        if file then
            file:write(cjson.encode({state="error", filter_id=filter.id, phase=phase,
                message="Trusted filter execution failed", checked_at=now,
                version=chain.active_version or chain.bundle_version}))
            file:close()
        end
    end
    ngx.log(ngx.ERR, "ShieldPM Wasm filter ", filter.id, " failed in ", phase)
end
function M.load(path)
    if cache[path] then return cache[path] end
    local bytes = assert(read(path), "Wasm configuration unavailable")
    local chain = assert(cjson.decode(bytes), "Invalid Wasm configuration")
    assert(chain.version == 1 and type(chain.filters) == "table", "Unsupported Wasm configuration")
    for _, filter in ipairs(chain.filters) do
        local binary = assert(read(filter.path), "Trusted Wasm artifact unavailable")
        local digest = sha256:new()
        assert(digest:update(binary))
        assert(hex.to_hex(digest:final()) == filter.sha256, "Trusted Wasm artifact hash mismatch")
        if filter.kind ~= "application" then
            wasm = wasm or require "resty.proxy-wasm"
            local plugin = assert(wasm.load(filter.id, filter.path), "Trusted Wasm artifact failed to load")
            filter.plugin = plugin -- Keep VM alive for the complete worker lifetime.
            filter.context = assert(wasm.on_configure(plugin, assert(ngx.decode_base64(filter.configuration))),
                "Trusted Wasm configuration failed")
        end
        local callbacks = {}
        for _, name in ipairs(filter.callbacks or {}) do callbacks[name] = true end
        filter.callbacks = callbacks
    end
    cache[path] = chain
    return chain
end
local function request_body(chain, filter)
    if not callback(filter, "proxy_on_request_body") then return true end
    -- Finish this filter before a following application can transform or answer the request.
    local body_ok = pcall(ngx.req.read_body)
    local data = body_ok and ngx.req.get_body_data() or nil
    local filename = body_ok and ngx.req.get_body_file() or nil
    local function unavailable()
        report(chain, filter, "request_body")
        return filter.failure_mode == "open"
    end
    if not body_ok then return unavailable() end
    local offset = 0
    while data or filename do
        local chunk, eof, read_error
        if data then
            chunk = data:sub(offset + 1, offset + 65536)
            eof = offset + #chunk >= #data
        else
            -- Never retain a body-file descriptor across a callback that may produce a local reply.
            local file = io.open(filename, "rb")
            if file then
                local position = file:seek("set", offset)
                if position then chunk, read_error = file:read(65537) else read_error = true end
                file:close()
                if chunk then
                    eof = #chunk <= 65536
                    chunk = chunk:sub(1, 65536)
                end
            else read_error = true end
        end
        if read_error then return unavailable() end
        if not chunk or #chunk == 0 then break end
        local success, result = pcall(wasm.on_http_request_body, filter.context, chunk, eof)
        if not success or not result then
            if not unavailable() then return false end
        end
        if eof then break end
        offset = offset + #chunk
    end
    return true
end
function M.access(path)
    local ok, chain = pcall(M.load, path)
    if not ok then
        ngx.log(ngx.ERR, "ShieldPM Wasm chain could not load")
        return ngx.exit(503)
    end
    ngx.ctx.shieldpm_wasm_chain = chain
    for _, filter in ipairs(chain.filters) do
        if filter.kind == "application" then
            local success, result = pcall(function()
                chain.wasi_dispatcher = chain.wasi_dispatcher or dofile(chain.wasi_dispatcher_path)
                return chain.wasi_dispatcher.run(path, chain, filter)
            end)
            if not success or not result then
                report(chain, filter, "wasi_request")
                if filter.failure_mode ~= "open" then return ngx.exit(503) end
            end
        else
            if filter.phase == "request" or callback(filter, "proxy_on_request_headers") then
                local success, result = pcall(wasm.on_http_request_headers, filter.context)
                if not success or not result then
                    report(chain, filter, "request")
                    if filter.failure_mode ~= "open" or filter.authentication then return ngx.exit(503) end
                end
            end
            if not request_body(chain, filter) then return ngx.exit(503) end
        end
    end
end
function M.header_filter(path)
    local chain = ngx.ctx.shieldpm_wasm_chain
    -- Responses produced before access (ACME, redirects, WAF) must not acquire another policy chain.
    if not chain then return end
    for _, filter in ipairs(chain.filters) do
        if filter.phase == "response" or callback(filter, "proxy_on_response_headers") then
            local ok, result = pcall(wasm.on_http_response_headers, filter.context)
            if not ok or not result then
                report(chain, filter, "response")
                if filter.failure_mode ~= "open" then
                    -- A failed removal policy must not expose the upstream header
                    -- it was meant to remove (including credentials or cookies).
                    for name in pairs(ngx.resp.get_headers(0, true)) do ngx.header[name] = nil end
                    ngx.status = 503
                    ngx.header.content_type = "text/plain"
                    ngx.header.cache_control = "no-store"
                    ngx.ctx.shieldpm_wasm_discard_body = true
                    return
                end
            end
        end
    end
end
function M.body_filter()
    if ngx.ctx.shieldpm_wasm_discard_body then ngx.arg[1] = nil; return end
    local chain = ngx.ctx.shieldpm_wasm_chain
    if not chain then return end
    for _, filter in ipairs(chain.filters) do
        if callback(filter, "proxy_on_response_body") then
            ngx.arg[1] = ngx.arg[1] or ""
            local ok, result = pcall(wasm.on_http_response_body, filter.context)
            if not ok or not result then
                report(chain, filter, "response_body")
                if filter.failure_mode ~= "open" then
                    ngx.ctx.shieldpm_wasm_discard_body = true
                    ngx.arg[1] = nil
                    ngx.arg[2] = true
                    return
                end
            end
        end
    end
end
return M
