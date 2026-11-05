// Isolated Lua instrumentation check: body-processing bytes are not downstream transfer bytes.
// Run with TRAFFIC_SMOKE_NGINX_BIN=/path/to/nginx and optional TRAFFIC_SMOKE_LUA_DIRECTORY.
// This starts loopback-only fixtures, modifies no application configuration and removes its temporary files.
import assert from "node:assert/strict";
import { spawn } from "node:child_process";
import { once } from "node:events";
import fs from "node:fs/promises";
import http from "node:http";
import net from "node:net";
import os from "node:os";
import path from "node:path";

const binary = process.env.TRAFFIC_SMOKE_NGINX_BIN;
assert.ok(binary, "Set TRAFFIC_SMOKE_NGINX_BIN");
await fs.access(binary);
const directory = await fs.mkdtemp(path.join(os.tmpdir(), "flow-live-"));
const payload = Buffer.alloc(1024 * 1024, 120);
const origin = http.createServer((_req, res) => {
  res.writeHead(200, { "Content-Length": payload.length });
  res.end(payload);
});
await new Promise((resolve) => origin.listen(0, "127.0.0.1", resolve));
const reserve = net.createServer();
await new Promise((r) => reserve.listen(0, "127.0.0.1", r));
const port = reserve.address().port;
await new Promise((r) => reserve.close(r));
const conf = path.join(directory, "nginx.conf");
await fs.writeFile(
  conf,
  `daemon off;
master_process off;
pid ${directory}/pid;
error_log stderr warn;
events { worker_connections 32; }
http {
 lua_package_path "${process.env.TRAFFIC_SMOKE_LUA_DIRECTORY || "/usr/local/share/lua/5.1"}/?.lua;;";
 lua_shared_dict sample 1m;
 access_log off;
 server { listen 127.0.0.1:${port};
  location = /status { content_by_lua_block {
   local d=ngx.shared.sample
   ngx.say(d:get("body") or 0)
   ngx.say(d:get("bytes_sent") or 0)
   ngx.say(d:get("timer") or "not_called")
  } }
  location / {
   limit_rate 32k;
   proxy_buffering on;
   proxy_temp_path ${directory}/body-temp;
   proxy_pass http://127.0.0.1:${origin.address().port};
   body_filter_by_lua_block {
    local d=ngx.shared.sample
    d:incr("body", #(ngx.arg[1] or ""), 0)
    d:set("bytes_sent", tonumber(ngx.var.bytes_sent) or 0)
    if not ngx.ctx.started then
     ngx.ctx.started=true
     ngx.timer.at(0.2,function()
      local ok,value=pcall(function() return ngx.var.bytes_sent end)
      d:set("timer", ok and (value or "nil") or tostring(value))
     end)
    end
   }
  }
 }
}`,
);
let diagnostics = "";
const child = spawn(binary, ["-p", directory, "-c", conf], {
  stdio: ["ignore", "ignore", "pipe"],
});
child.stderr.on("data", (x) => (diagnostics += x));
let request;
let response;
let received = 0;
const deadline = setTimeout(() => {
  request?.destroy(new Error("Probe exceeded 15 seconds"));
  child.kill("SIGTERM");
}, 15000);
const status = () =>
  new Promise((resolve, reject) => {
    http
      .get(
        { host: "127.0.0.1", port, path: "/status", agent: false },
        (res) => {
          let s = "";
          res.on("data", (x) => (s += x));
          res.on("end", () => {
            if (res.statusCode !== 200)
              return reject(new Error(s + diagnostics));
            const [body, variable_at_filter, ...timer] = s.trim().split("\n");
            resolve({
              body: Number(body),
              variable_at_filter: Number(variable_at_filter),
              timer: timer.join("\n"),
            });
          });
        },
      )
      .on("error", reject)
      .setTimeout(3000, function () {
        this.destroy(new Error("Status request timed out"));
      });
  });
try {
  for (let i = 0; i < 100; i++) {
    if (child.exitCode !== null) throw Error(diagnostics);
    const ready = await new Promise((r) => {
      const s = net.connect(port, "127.0.0.1");
      s.once("connect", () => {
        s.destroy();
        r(true);
      });
      s.once("error", () => r(false));
    });
    if (ready) break;
    await new Promise((r) => setTimeout(r, 20));
  }
  await new Promise((resolve, reject) => {
    request = http.get(
      { host: "127.0.0.1", port, path: "/large", agent: false },
      (res) => {
        response = res;
        res.on("error", () => {});
        res.on("data", (x) => {
          received += x.length;
          resolve();
        });
      },
    );
    request.on("error", reject);
    request.setTimeout(3000, () =>
      request.destroy(new Error("Transfer timed out")),
    );
  });
  await new Promise((r) => setTimeout(r, 1200));
  const snapshot = await status();
  console.log(
    JSON.stringify({
      received_payload: received,
      source_payload: payload.length,
      ...snapshot,
    }),
  );
  assert.ok(
    received > 0 && received < payload.length,
    "Client transfer is still active",
  );
  assert.ok(
    snapshot.body > received,
    "Body filter runs ahead of actual client receipt",
  );
  assert.match(snapshot.timer, /API disabled|no request|request/);
  console.log(
    "PASS: body processing counters are not actual transfer counters; request-variable reads from timer are unavailable",
  );
} finally {
  clearTimeout(deadline);
  request?.destroy();
  response?.destroy();
  if (child.exitCode === null) {
    child.kill("SIGTERM");
    await once(child, "exit");
  }
  origin.closeAllConnections();
  await new Promise((r) => origin.close(r));
  await fs.rm(directory, { recursive: true, force: true });
}
