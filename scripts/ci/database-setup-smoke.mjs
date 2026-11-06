import assert from "node:assert/strict";
import fs from "node:fs";
import http from "node:http";

let cookie;
const request = (method, path, body, csrfToken, extraHeaders = {}) =>
	new Promise((resolve, reject) => {
		const content = body === undefined ? undefined : JSON.stringify(body);
		const req = http.request(
			{
				socketPath: "/run/shieldpm/shieldpm.sock",
				path,
				method,
				agent: false,
				headers: {
					...(cookie ? { Cookie: cookie } : {}),
					...(content
						? {
								"Content-Type": "application/json",
								"Content-Length": Buffer.byteLength(content),
							}
						: {}),
					...(csrfToken ? { "X-XSRF-TOKEN": csrfToken } : {}),
					...extraHeaders,
				},
			},
			(res) => {
				if (res.headers["set-cookie"])
					cookie = res.headers["set-cookie"]
						.map((value) => value.split(";")[0])
						.join("; ");
				let response = "";
				res.setEncoding("utf8");
				res.on("data", (chunk) => {
					response += chunk;
				});
				res.on("end", () => {
					try {
						resolve({ status: res.statusCode, body: JSON.parse(response) });
					} catch (error) {
						reject(error);
					}
				});
			},
		);
		req.setTimeout(2000, () =>
			req.destroy(new Error("Database setup request timed out")),
		);
		req.on("error", reject);
		req.end(content);
	});

const health = await request("GET", "/");
assert.equal(
	health.body.databaseSetupRequired,
	true,
	"fresh installation must offer database selection",
);
assert.equal(
	fs.existsSync("/data/shieldpm/database.sqlite"),
	false,
	"chooser must not create the application database",
);
const forbidden = await request("POST", "/database/setup", {
	engine: "sqlite",
});
assert.equal(
	forbidden.status,
	403,
	"setup requires authenticated CSRF pairing",
);
const foreignRequest = await request(
	"POST",
	"/database/setup",
	{ engine: "sqlite" },
	health.body.csrfToken,
	{ "Sec-Fetch-Site": "cross-site" },
);
assert.equal(foreignRequest.status, 403, "cross-site setup must be rejected");
const setup = await request(
	"POST",
	"/database/setup",
	{ engine: "sqlite" },
	health.body.csrfToken,
);
assert.equal(setup.status, 202);
assert.equal(typeof setup.body.operationToken, "string");

let ready = false;
const deadline = Date.now() + 20_000;
while (Date.now() < deadline) {
	try {
		const response = await request("GET", "/");
		if (
			response.status === 200 &&
			response.body.status === "OK" &&
			!response.body.databaseSetupRequired &&
			!response.body.databaseMaintenance
		) {
			ready = true;
			break;
		}
	} catch {
		/* The bootstrap socket closes while the normal application starts. */
	}
	await new Promise((resolve) => setTimeout(resolve, 100));
}
assert.ok(ready, "database setup must transition into the normal application");
assert.equal(fs.statSync("/data/shieldpm/database.json").mode & 0o777, 0o600);
const operation = JSON.parse(
	fs.readFileSync("/data/shieldpm/database-operation.json", "utf8"),
);
assert.equal(operation.state, "completed");
assert.equal(fs.existsSync("/data/shieldpm/database.sqlite"), true);
console.log(
	"Fresh database chooser, CSRF rejection, SQLite initialization and application startup passed.",
);
