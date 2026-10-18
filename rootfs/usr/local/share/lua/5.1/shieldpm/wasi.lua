-- Trusted standalone WASI commands bound to HTTP requests over a private authenticated Unix bridge.
local cjson = require "cjson.safe"
local M = {}
local MAX_BODY = 65536
local MAX_PACKET = 262144
local MAX_RESULT = 2097152

local function request_body()
    local declared = tonumber(ngx.var.content_length)
    if declared and declared > MAX_BODY then return nil end
    local ok = pcall(ngx.req.read_body)
    if not ok then return nil end
    local body = ngx.req.get_body_data()
    if not body then
        local filename = ngx.req.get_body_file()
        if filename then
            local file = io.open(filename, "rb")
            if not file then return nil end
            body = file:read(MAX_BODY + 1)
            file:close()
        end
    end
    body = body or ""
    if #body > MAX_BODY then return nil end
    return body
end

local function request_packet()
    local body = request_body()
    if not body then return nil end
    local source, err = ngx.req.get_headers(128, true)
    if err then return nil end
    local headers = {}
    for name, value in pairs(source) do
        if type(value) == "table" then
            for _, item in ipairs(value) do headers[#headers + 1] = {name=name, value=item} end
        else headers[#headers + 1] = {name=name, value=value} end
    end
    if #headers > 128 then return nil end
    local request = cjson.encode({
        method=ngx.req.get_method(), uri=ngx.var.request_uri or "/", query=ngx.var.args or "",
        host=ngx.var.host or "", scheme=ngx.var.scheme or "http", remote_addr=ngx.var.remote_addr or "",
        body_base64=ngx.encode_base64(body)
    })
    -- Standard Lua CJSON encodes an empty table as {}. A hostless HTTP/1.0 request still needs an array.
    local encoded_headers = #headers == 0 and "[]" or cjson.encode(headers)
    if not request or not encoded_headers then return nil end
    local packet = '{"version":1,"request":' .. request:sub(1, -2) .. ',"headers":' .. encoded_headers .. '}}'
    if not packet or #packet > MAX_PACKET then return nil end
    return packet
end

local function exchange(socket, configuration, filter, packet)
    local request = "POST /execute/" .. configuration .. "/" .. filter.id .. " HTTP/1.1\r\n" ..
        "Host: shieldpm-wasi\r\nContent-Type: application/json\r\nConnection: close\r\n" ..
        "X-ShieldPM-Wasi-Token: " .. filter.bridge_token .. "\r\nContent-Length: " .. #packet .. "\r\n\r\n" .. packet
    if not socket:send(request) then return nil end
    local status = socket:receive("*l")
    if not status or not status:match("^HTTP/1%.[01] 200 ") then return nil end
    local length
    local size = 0
    for _ = 1, 32 do
        local line = socket:receive("*l")
        if not line then return nil end
        size = size + #line
        if size > 4096 then return nil end
        if line == "" then
            if not length then return nil end
            local contents = length == 0 and "" or socket:receive(length)
            if not contents then return nil end
            return cjson.decode(contents)
        end
        local name, value = line:match("^([^:]+):%s*(.-)%s*$")
        if not name then return nil end
        name = name:lower()
        if name == "transfer-encoding" then return nil end
        if name == "content-length" then
            if length or not value:match("^%d+$") then return nil end
            length = tonumber(value)
            if not length or length > MAX_RESULT then return nil end
        end
    end
    return nil
end

local function apply(result)
    if type(result) ~= "table" or result.version ~= 1 then return nil, "response" end
    if result.action == "continue" then
        local request = result.request or {}
        for _, entry in ipairs(request.headers or {}) do
            if entry.value == cjson.null then ngx.req.clear_header(entry.name)
            else ngx.req.set_header(entry.name, entry.value) end
        end
        if request.body_base64 ~= nil then
            local body = ngx.decode_base64(request.body_base64)
            if not body then return nil, "response" end
            ngx.req.set_body_data(body)
        end
        return true
    end
    if result.action ~= "respond" or type(result.response) ~= "table" then return nil, "response" end
    local response = result.response
    local body = ngx.decode_base64(response.body_base64 or "")
    if not body then return nil, "response" end
    -- Explicit guest headers replace the response's header set; Nginx owns framing and bodyless statuses.
    for name in pairs(ngx.resp.get_headers(0, true)) do ngx.header[name] = nil end
    local headers = {}
    for _, entry in ipairs(response.headers or {}) do
        local name = entry.name:lower()
        if headers[name] then
            if type(headers[name]) ~= "table" then headers[name] = {headers[name]} end
            table.insert(headers[name], entry.value)
        else headers[name] = entry.value end
    end
    for name, value in pairs(headers) do ngx.header[name] = value end
    ngx.status = response.status
    if response.status ~= 204 and response.status ~= 304 and ngx.req.get_method() ~= "HEAD" then ngx.print(body) end
    return ngx.exit(response.status)
end

-- Returns true after request middleware, exits for an application response, or nil/phase on a bounded failure.
function M.run(configuration_path, chain, filter)
    local configuration = chain.wasi_configuration_name or configuration_path:match("([^/]+)$")
    if not configuration or not configuration:match("^%d+%-[a-f0-9]+%.json$") or
        not filter.id:match("^[A-Za-z0-9_-]+$") or type(filter.bridge_token) ~= "string" then return nil, "request" end
    local packet = request_packet()
    if not packet then return nil, "request" end
    local socket = ngx.socket.tcp()
    local timeout = (filter.settings and filter.settings.timeout_ms or 10000) + 2000
    socket:settimeouts(1000, 5000, timeout)
    local test_port = chain.wasi_socket_path:match("^tcp:127%.0%.0%.1:(%d+)$")
    local connected
    if test_port then connected = socket:connect("127.0.0.1", tonumber(test_port))
    else connected = socket:connect("unix:" .. chain.wasi_socket_path) end
    if not connected then socket:close(); return nil, "request" end
    -- The generated host enables lua_check_client_abort. Ending this request closes its cosocket,
    -- so the bridge aborts the actual child process rather than merely discarding a late response.
    if not ngx.ctx.shieldpm_wasi_abort_registered then
        local ok = ngx.on_abort(function() ngx.exit(499) end)
        if not ok then socket:close(); return nil, "request" end
        ngx.ctx.shieldpm_wasi_abort_registered = true
    end
    local ok, result = pcall(exchange, socket, configuration, filter, packet)
    socket:close()
    if not ok or not result then return nil, "request" end
    return apply(result)
end

return M
