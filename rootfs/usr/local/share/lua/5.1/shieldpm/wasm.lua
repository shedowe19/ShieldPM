-- ShieldPM trusted Proxy-Wasm dispatcher. No user-supplied code or filenames.
require "resty.core"
local cjson = require "cjson.safe"
local wasm = require "resty.proxy-wasm"
local sha256 = require "resty.sha256"
local hex = require "resty.string"
local M = {}
local cache = {}
local last_error = {}
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
                message="Trusted filter execution failed", checked_at=now, version=chain.bundle_version}))
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
        local plugin = assert(wasm.load(filter.id, filter.path), "Trusted Wasm artifact failed to load")
        filter.plugin = plugin -- Keep VM alive for the complete worker lifetime.
        filter.context = assert(wasm.on_configure(plugin, assert(ngx.decode_base64(filter.configuration))),
            "Trusted Wasm configuration failed")
    end
    cache[path] = chain
    return chain
end
function M.access(path)
    local ok, chain = pcall(M.load, path)
    if not ok then
        ngx.log(ngx.ERR, "ShieldPM Wasm chain could not load")
        return ngx.exit(503)
    end
    ngx.ctx.shieldpm_wasm_chain = chain
    for _, filter in ipairs(chain.filters) do
        if filter.phase == "request" then
            local success, result = pcall(wasm.on_http_request_headers, filter.context)
            if not success or not result then
                report(chain, filter, "request")
                if filter.failure_mode ~= "open" or filter.authentication then return ngx.exit(503) end
            end
        end
    end
end
function M.header_filter(path)
    local chain = ngx.ctx.shieldpm_wasm_chain
    -- Responses produced before access (ACME, redirects, WAF) must not acquire another policy chain.
    if not chain then return end
    for _, filter in ipairs(chain.filters) do
        if filter.phase == "response" then
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
    if ngx.ctx.shieldpm_wasm_discard_body then ngx.arg[1] = nil end
end
return M
