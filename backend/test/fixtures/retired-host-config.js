const modulePath = `/data/wasm/artifacts/${"a".repeat(64)}.lua`;
const name = `7-${"b".repeat(64)}.json`;
const configuration = `/data/wasm/hosts/${name}`;
const headers = `lua_check_client_abort on;
# ShieldPM Wasm configuration: ${name}

# Trusted Wasm filters: application/application
header_filter_by_lua_block {
    local wasm_dispatcher = package.loaded["${modulePath}"]
    if wasm_dispatcher then wasm_dispatcher.header_filter("${configuration}") end
}
body_filter_by_lua_block {
    local wasm_dispatcher = package.loaded["${modulePath}"]
    if wasm_dispatcher then wasm_dispatcher.body_filter() end
}
`;
const access = `local wasm_path = "${modulePath}"
local wasm_dispatcher = package.loaded[wasm_path]
if not wasm_dispatcher then
    wasm_dispatcher = dofile(wasm_path)
    package.loaded[wasm_path] = wasm_dispatcher
end
wasm_dispatcher.access("${configuration}")
`;
const authentication = `access_by_lua_block {
    require("crowdsec").CheckAccess(ngx.var.remote_addr)
    local res, err = require("resty.openidc").authenticate(opts)
    if err then return ngx.exit(ngx.HTTP_FORBIDDEN) end
`;
const custom = `    local custom = dofile("/data/custom.lua")
    ngx.say("custom content")
}
`;

export { access, authentication, configuration, custom, headers, modulePath };
