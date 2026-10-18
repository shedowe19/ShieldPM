import { expect, type Page, type Route, test } from "@playwright/test";
import axe from "axe-core";

interface ApiRequest {
	body?: unknown;
	method: string;
	path: string;
}

interface DashboardNote {
	color: string;
	content: string;
	id: number;
	position: number;
}

const localE2eOrigin = "http://127.0.0.1:4173";
const pageErrors = new WeakMap<Page, string[]>();

test.beforeEach(({ page }) => {
	const errors: string[] = [];
	pageErrors.set(page, errors);
	page.on("pageerror", (error) => errors.push(error.message));
});

test.afterEach(({ page }) => {
	expect(pageErrors.get(page), "The application must not produce uncaught browser errors").toEqual([]);
});

const auditEvent = {
	action: "updated",
	created_on: "2026-10-04T12:10:00Z",
	id: 73,
	meta: { name: "E2E Firewall List" },
	modified_on: "2026-10-04T12:10:00Z",
	object_id: 12,
	object_type: "firewall-list",
	user: { avatar: "", email: "admin@e2e.test", id: 1, name: "E2E Administrator" },
	user_id: 1,
};

const mockHost = {
	id: 7,
	domain_names: ["api.e2e.test"],
	forward_scheme: "http",
	forward_host: "127.0.0.1",
	forward_port: 8080,
	enabled: true,
	certificate_id: 0,
	access_list_id: 0,
	advanced_config: "",
	locations: [],
	created_on: "2026-10-17T12:00:00Z",
	modified_on: "2026-10-17T12:00:00Z",
	owner: { id: 1, name: "E2E Administrator", email: "admin@e2e.test", avatar: "" },
	meta: {
		retained: { custom_value: "preserved" },
		waf_ruleset: "base",
		wasm_filters: [],
		upstream_pool: {
			enabled: true,
			connect_timeout: 5,
			read_timeout: 60,
			tls_verify: true,
			targets: [
				{
					id: "primary",
					label: "Primary",
					host: "127.0.0.1",
					port: 8080,
					weight: 1,
					backup: false,
					max_fails: 1,
					fail_timeout: 10,
				},
			],
		},
		cache_policy: {
			enabled: true,
			assets_only: true,
			cache_key: "uri",
			ttl_seconds: 3600,
			max_size_mb: 256,
			inactive_seconds: 86400,
			routes: [{ path: "/", ttl_seconds: 3600 }],
		},
	},
};
const wasmCapability = {
	available: true,
	built: true,
	installed: true,
	configured: true,
	state: "functional",
	checked_at: "2026-10-17T12:00:00Z",
	runtime_version: "36.0.0",
	version: "e2e-trusted-v1",
	sha256: "a".repeat(64),
	module: "trusted-bundled",
	abi: "shieldpm-v1",
	trusted_only: true,
};

async function installMockApi(page: Page) {
	let authenticated = false;
	const notes: DashboardNote[] = [];
	const requests: ApiRequest[] = [];
	const topHostSorts: string[] = [];
	const backupJobs: unknown[] = [];
	const wasmModules: unknown[] = [];
	const wasiApplications: unknown[] = [];

	const fulfill = async (route: Route, body: unknown, status = 200) => {
		await route.fulfill({
			body: JSON.stringify(body),
			contentType: "application/json",
			status,
		});
	};

	await page.routeWebSocket("**", (webSocket) => webSocket.close());
	await page.route("**", async (route) => {
		const request = route.request();
		const method = request.method();
		const url = new URL(request.url());
		const path = url.pathname;
		if (url.origin !== localE2eOrigin) {
			return route.abort("blockedbyclient");
		}
		if (!path.startsWith("/api/")) {
			return route.continue();
		}
		const body =
			request.headers()["content-type"] === "application/wasm"
				? Array.from(request.postDataBuffer() || [])
				: request.postDataJSON();
		requests.push({ body, method, path });

		if (method === "GET" && path === "/api/") {
			return fulfill(route, { setup: true, status: "OK", version: "4.3.2-e2e" });
		}

		if (method === "POST" && path === "/api/tokens/refresh") {
			if (authenticated) {
				return fulfill(route, { expires: Date.now() + 3_600_000, user: { id: 1 } });
			}
			return fulfill(route, { error: { message: "No mocked session" } }, 401);
		}

		if (method === "POST" && path === "/api/oidc/claim") {
			return fulfill(route, { error: { message: "No mocked OIDC token" } }, 404);
		}

		if (method === "POST" && path === "/api/tokens") {
			authenticated = true;
			return fulfill(route, { expires: Date.now() + 3_600_000, user: { id: 1 } });
		}

		if (method === "GET" && (path === "/api/users/me" || path === "/api/users/1")) {
			return fulfill(route, {
				email: "admin@e2e.test",
				id: 1,
				name: "E2E Administrator",
				nickname: "E2E Administrator",
				permissions: {},
				roles: ["admin"],
			});
		}

		if (method === "GET" && path === "/api/reports/hosts") {
			return fulfill(route, { dead: 0, proxy: 0, redirection: 0, stream: 0 });
		}

		if (method === "GET" && path === "/api/analytics/top-hosts") {
			const sort = url.searchParams.get("sort") ?? "requests";
			topHostSorts.push(sort);
			return fulfill(route, [
				{
					bytes: sort === "bytes" ? 1536 : 0,
					domain_name: "api.e2e.test",
					id: 7,
					requests: 42,
					server_errors: sort === "server_errors" ? 3 : 0,
				},
			]);
		}

		if (method === "GET" && path === "/api/nginx/certificates") {
			return fulfill(route, []);
		}

		if (method === "GET" && path === "/api/nginx/proxy-hosts")
			return fulfill(route, {
				items: [mockHost],
				pagination: { page: 1, limit: 100, total_items: 1, total_pages: 1 },
			});
		if (method === "GET" && path === "/api/nginx/proxy-hosts/options")
			return fulfill(route, [{ id: 7, domain_names: ["api.e2e.test"] }]);
		if (method === "GET" && path === "/api/nginx/proxy-hosts/monitors/status")
			return fulfill(route, [{ host_id: 7, state: "up", checked_at: "2026-10-17T12:00:00Z", response_ms: 25 }]);
		if (method === "GET" && path === "/api/nginx/proxy-hosts/7") return fulfill(route, mockHost);
		if (method === "PUT" && path === "/api/nginx/proxy-hosts/7")
			return fulfill(route, { ...mockHost, ...(body as object) });
		if (method === "GET" && path === "/api/nginx/access-lists") return fulfill(route, []);
		if (
			(method === "GET" && path === "/api/nginx/wasm") ||
			(method === "POST" && path === "/api/nginx/wasm/self-test")
		)
			return fulfill(route, wasmCapability);
		if (method === "GET" && path === "/api/nginx/wasm/modules") return fulfill(route, wasmModules);
		if (method === "GET" && path === "/api/nginx/wasm/applications") return fulfill(route, wasiApplications);
		if (method === "POST" && path === "/api/nginx/wasm/applications") {
			const application = {
				id: "c".repeat(64),
				sha256: "c".repeat(64),
				name: url.searchParams.get("name"),
				filename: url.searchParams.get("filename"),
				size: request.postDataBuffer()?.length || 0,
				runtime: "wasi-preview1",
				created_on: "2026-10-18T00:00:00Z",
			};
			wasiApplications.push(application);
			return fulfill(route, application, 201);
		}
		if (method === "POST" && path === `/api/nginx/wasm/applications/${"c".repeat(64)}/run`) {
			return fulfill(route, {
				status: "failed",
				exit_code: 7,
				stdout: "WASI stdout: browser input\n",
				stderr: "A nonzero program exit remains visible.\n",
				duration_ms: 8,
				truncated: false,
			});
		}
		if (method === "POST" && path === "/api/nginx/wasm/modules") {
			const module = {
				id: "b".repeat(64),
				sha256: "b".repeat(64),
				name: url.searchParams.get("name"),
				filename: url.searchParams.get("filename"),
				size: request.postDataBuffer()?.length || 0,
				abi: "0.2.1",
				created_on: "2026-10-17T20:00:00Z",
			};
			wasmModules.push(module);
			return fulfill(route, module, 201);
		}
		if (method === "GET" && path === "/api/nginx/wasm/hosts/7")
			return fulfill(route, { state: "inactive", checked_at: null });
		if (method === "GET" && path === "/api/nginx/proxy-hosts/7/upstream-pool/status")
			return fulfill(route, {
				enabled: true,
				observation: "tcp",
				checked_at: "2026-10-17T12:00:00Z",
				targets: [
					{
						...mockHost.meta.upstream_pool.targets[0],
						state: "up",
						response_ms: 4,
						observed_requests: 12,
						monitor: {
							state: "up",
							response_ms: 25,
							checked_at: "2026-10-17T12:00:00Z",
							status_code: 200,
							message: "HTTP 200",
						},
					},
				],
			});
		if (method === "GET" && path === "/api/nginx/proxy-hosts/7/cache/status")
			return fulfill(route, {
				enabled: true,
				protected_bypass: false,
				policy: mockHost.meta.cache_policy,
				counts: { HIT: 8, MISS: 2 },
				hit_ratio: 0.8,
				sample_requests: 10,
				sample_limit_bytes: 1048576,
			});
		if (method === "DELETE" && path === "/api/nginx/proxy-hosts/7/cache")
			return fulfill(route, { removed: 2, path: url.searchParams.get("path") });
		if (method === "GET" && path === "/api/incidents/hosts")
			return fulfill(route, [{ id: 7, domain_names: ["api.e2e.test"], enabled: true, owned: true }]);
		if (method === "GET" && path === "/api/incidents")
			return fulfill(route, [
				{
					id: 11,
					host_id: 7,
					opened_at: "2026-10-17T12:00:00Z",
					resolved_at: null,
					last_seen_at: "2026-10-17T12:05:00Z",
					resolution: null,
					failure_count: 3,
					message: "E2E origin unavailable",
				},
			]);
		if (method === "GET" && ["/api/incidents/targets", "/api/incidents/deliveries"].includes(path))
			return fulfill(route, []);
		if (method === "GET" && path === "/api/incidents/hosts/7")
			return fulfill(route, {
				host_id: 7,
				mute: null,
				current: { state: "down", checked_at: "2026-10-17T12:05:00Z" },
				daily: [
					{
						day: "2026-10-17",
						up_ms: 600000,
						down_ms: 60000,
						unknown_ms: 0,
						coverage_percent: 100,
						uptime_percent: 90.9,
						checks: 11,
					},
				],
				latency: [
					{ bucket: "2026-10-17T12:00:00Z", samples: 1, avg_ms: 25, min_ms: 25, max_ms: 25 },
					{ bucket: "2026-10-17T12:01:00Z", samples: 1, avg_ms: 40, min_ms: 40, max_ms: 40 },
				],
			});
		if (method === "GET" && path === "/api/backups")
			return fulfill(route, {
				backups: [
					{
						id: "backup-e2e",
						name: "E2E encrypted backup",
						created_on: "2026-10-17T12:00:00Z",
						app_version: "4.4.1",
						database: "sqlite",
						size: 4096,
					},
				],
				jobs: backupJobs,
				pending: null,
				limits: { max_bytes: 1073741824 },
				activation: "next_restart",
			});
		if (method === "POST" && path === "/api/backups/backup-e2e/preflight") {
			const job = {
				id: "job-e2e",
				kind: "preflight",
				phase: "completed",
				status: "completed",
				created_on: "2026-10-17T12:00:00Z",
				error: null,
				result: { valid: true, activation: null },
			};
			backupJobs.push(job);
			return fulfill(route, job);
		}

		if (method === "GET" && path === "/api/audit-log") {
			return fulfill(route, {
				items: [auditEvent],
				pagination: { limit: 100, page: 1, total_items: 1, total_pages: 1 },
			});
		}

		if (method === "GET" && path === "/api/audit-log/73") {
			return fulfill(route, auditEvent);
		}

		if (method === "GET" && path === "/api/dashboard/notes") {
			return fulfill(route, notes);
		}

		if (method === "POST" && path === "/api/dashboard/notes") {
			const note = { id: notes.length + 1, ...(body as Omit<DashboardNote, "id">) };
			notes.push(note);
			return fulfill(route, note);
		}

		if (method === "GET" && path === "/api/version/check") {
			return fulfill(route, { current: "4.3.2-e2e", latest: null, updateAvailable: false });
		}

		await route.abort("blockedbyclient");
		throw new Error(`Unexpected API request in browser smoke test: ${method} ${path}`);
	});

	return { requests, topHostSorts };
}

async function signIn(page: Page) {
	await page.goto("/");
	await expect(page.getByRole("heading", { name: "Login to your account" })).toBeVisible();
	await expect(page.getByLabel("Email address")).toBeFocused();
	await page.getByLabel("Email address").fill("admin@e2e.test");
	await page.getByLabel("Password").fill("a-safe-test-password");
	await page.getByRole("button", { name: "Sign in" }).click();
	await expect(page.getByTestId("app-content")).toBeVisible();
}

test("keeps login, top-host analytics, route fallback, a11y, keyboard focus, and dashboard-note saves inside a mocked browser", async ({
	page,
}) => {
	const api = await installMockApi(page);

	await signIn(page);
	await expect(page.getByRole("heading", { name: "Top Proxy Hosts" })).toBeVisible();
	await expect.poll(() => api.topHostSorts).toEqual(["requests"]);
	await page.getByRole("tab", { name: "Top Bandwidth Consumers" }).click();
	await expect(page.getByRole("heading", { name: "Top Bandwidth Consumers" })).toBeVisible();
	await expect.poll(() => api.topHostSorts).toEqual(["requests", "bytes"]);
	await expect(page.getByTestId("dashboard-top-bandwidth")).toContainText(/1\.5\s?kB/);
	await page.getByRole("tab", { name: "Top Server Errors" }).click();
	await expect(page.getByRole("heading", { name: "Top Server Errors" })).toBeVisible();
	await expect.poll(() => api.topHostSorts).toEqual(["requests", "bytes", "server_errors"]);
	await expect(
		page.getByTestId("dashboard-top-server-errors").getByRole("link", { name: "api.e2e.test" }),
	).toHaveAttribute("href", "/analytics?host=7&range=24h");

	await page.goto("/");
	await expect(page.getByTestId("app-content")).toBeVisible();
	const skipLink = page.getByRole("link", { name: "Skip to main content" });
	await page.keyboard.press("Tab");
	await expect(skipLink).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(page.getByTestId("app-content")).toBeFocused();

	await page.getByLabel("Add Note").click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	await dialog.getByLabel("Note Content").fill("Browser-safe note");
	await dialog.getByRole("button", { name: "Save" }).click();
	await expect(dialog).toBeHidden();
	await expect(page.getByText("Browser-safe note")).toBeVisible();
	await expect
		.poll(() =>
			api.requests.filter((request) => request.path === "/api/dashboard/notes" && request.method === "POST"),
		)
		.toEqual([
			{
				body: { color: "yellow", content: "Browser-safe note", position: 0 },
				method: "POST",
				path: "/api/dashboard/notes",
			},
		]);

	await page.addScriptTag({ content: axe.source });
	const violations = await page.evaluate(async () => {
		const result = await (globalThis as typeof globalThis & { axe: typeof axe }).axe.run("#app-content", {
			rules: { "color-contrast": { enabled: false } },
		});
		return result.violations.map((violation) => violation.id);
	});
	expect(violations).toEqual([]);

	await page.goto("/not-a-real-route");
	await expect(page.getByTestId("app-content")).toContainText("Oops… You just found an error page");
});

test("shows audit row icons at their intended size and preserves filter and details actions", async ({
	page,
}, testInfo) => {
	await installMockApi(page);
	await signIn(page);
	await page.goto("/audit-log");

	const row = page.getByRole("row").filter({ hasText: "E2E Firewall List" });
	const actionLabels = ["Filter by user ID 1", "Filter by object ID 12", "View Details"];
	await expect(row).toBeVisible();

	for (const width of [1440, 390]) {
		await page.setViewportSize({ width, height: 900 });
		await row.getByRole("button", { name: "View Details", exact: true }).scrollIntoViewIfNeeded();

		for (const label of actionLabels) {
			const button = row.getByRole("button", { name: label, exact: true });
			await expect(button).toBeVisible();
			await button.scrollIntoViewIfNeeded();
			await expect(button).toBeInViewport({ ratio: 1 });
			const geometry = await button.evaluate((element) => {
				const svg = element.querySelector("svg");
				if (!svg) throw new Error("Audit action has no SVG icon");
				const buttonRect = element.getBoundingClientRect();
				const iconRect = svg.getBoundingClientRect();
				const style = getComputedStyle(svg);
				return {
					button: { height: buttonRect.height, width: buttonRect.width },
					icon: { height: iconRect.height, width: iconRect.width },
					insideButton:
						iconRect.left >= buttonRect.left &&
						iconRect.right <= buttonRect.right &&
						iconRect.top >= buttonRect.top &&
						iconRect.bottom <= buttonRect.bottom,
					opacity: Number(style.opacity),
					visibility: style.visibility,
				};
			});
			expect(geometry.button.width, `${label} button width at ${width}px`).toBeGreaterThanOrEqual(24);
			expect(geometry.button.height, `${label} button height at ${width}px`).toBeGreaterThanOrEqual(24);
			expect(geometry.icon.width, `${label} SVG width at ${width}px`).toBeGreaterThanOrEqual(15);
			expect(geometry.icon.height, `${label} SVG height at ${width}px`).toBeGreaterThanOrEqual(15);
			expect(geometry.insideButton).toBe(true);
			expect(geometry.opacity).toBeGreaterThan(0);
			expect(geometry.visibility).toBe("visible");
			if (label !== "View Details") await expect(button).toHaveAttribute("title", label);
		}
		await row
			.getByRole("button", { name: "View Details", exact: true })
			.locator("..")
			.screenshot({ animations: "disabled", path: testInfo.outputPath(`audit-actions-${width}.png`) });
	}

	const userFilterRequest = page.waitForRequest((request) => {
		const url = new URL(request.url());
		return url.pathname === "/api/audit-log" && url.searchParams.get("user_id") === "1";
	});
	await row.getByRole("button", { name: "Filter by user ID 1", exact: true }).click();
	await userFilterRequest;
	await expect(page.getByLabel("User ID", { exact: true })).toHaveValue("1");

	const objectFilterRequest = page.waitForRequest((request) => {
		const url = new URL(request.url());
		return (
			url.pathname === "/api/audit-log" &&
			url.searchParams.get("object_id") === "12" &&
			url.searchParams.get("object_type") === "firewall-list" &&
			url.searchParams.get("user_id") === "1"
		);
	});
	await row.getByRole("button", { name: "Filter by object ID 12", exact: true }).click();
	await objectFilterRequest;
	await expect(page.getByLabel("Object ID", { exact: true })).toHaveValue("12");

	await row.getByRole("button", { name: "View Details", exact: true }).click();
	await expect(page.getByRole("dialog")).toBeVisible();
	await expect(page.getByRole("dialog")).toContainText("E2E Firewall List");
});

test("uploads and configures a Wasm module with upstream and cache policies in the real host dialog", async ({
	page,
}, testInfo) => {
	await page.setViewportSize({ width: 1440, height: 1100 });
	const api = await installMockApi(page);
	await signIn(page);
	await page.goto("/nginx/proxy");
	const row = page.getByRole("row").filter({ hasText: "api.e2e.test" });
	await expect(row).toBeVisible();
	await row.getByRole("button", { name: "Open action menu", exact: true }).click();
	await page.getByRole("menuitem", { name: "Edit", exact: true }).click();
	const dialog = page.getByRole("dialog");
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole("combobox", { name: "Domain Names", exact: true })).toBeVisible();
	await dialog.getByRole("tab", { name: "Wasm", exact: true }).click();
	await expect(dialog.getByText(/Runtime: functional/)).toBeVisible();
	await dialog.getByRole("button", { name: "Verify runtime", exact: true }).click();
	await expect.poll(() => api.requests.filter((r) => r.path === "/api/nginx/wasm/self-test").length).toBe(1);
	await dialog.getByLabel("Wasm module file (.wasm)", { exact: true }).setInputFiles({
		name: "tenant.wasm",
		mimeType: "application/wasm",
		buffer: Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]),
	});
	await dialog.getByLabel("Module name", { exact: true }).fill("Tenant module");
	await dialog.getByRole("button", { name: "Upload module", exact: true }).click();
	await expect(dialog.getByLabel("Available module", { exact: true })).toHaveValue("b".repeat(64));
	await dialog.getByRole("button", { name: "Add module to host", exact: true }).click();
	await dialog
		.getByLabel("Module configuration (JSON)", { exact: true })
		.fill('{"TenantID":"demo","HeaderRules":{"ExactCase":true}}');
	await dialog.getByText("Built-in templates", { exact: true }).click();
	await dialog.getByRole("button", { name: "Add request header", exact: true }).click();
	await dialog.getByLabel("Header name", { exact: true }).fill("x-e2e-policy");
	await dialog.getByLabel("Header value", { exact: true }).fill("verified");
	await dialog.screenshot({ path: testInfo.outputPath("host-wasm.png"), animations: "disabled" });
	await dialog.getByRole("tab", { name: "Upstreams", exact: true }).click();
	await expect(dialog.getByText("HTTP 200", { exact: false })).toBeVisible();
	await dialog.getByLabel("Weight / canary share", { exact: true }).fill("3");
	await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toBeVisible();
	await dialog.screenshot({ path: testInfo.outputPath("host-upstream.png"), animations: "disabled" });
	await dialog.getByRole("tab", { name: "Cache", exact: true }).click();
	await dialog.getByLabel("TTL (seconds)", { exact: true }).fill("120");
	await expect(dialog.getByRole("button", { name: "Delete", exact: true })).toBeDisabled();
	await dialog.getByLabel("Exact request URI to purge (blank: entire host)", { exact: true }).fill("/app.js?v=2");
	await dialog.getByRole("button", { name: "Purge saved cache", exact: true }).click();
	await expect(dialog.getByText("Removed cache entries: 2", { exact: true })).toBeVisible();
	await dialog.screenshot({ path: testInfo.outputPath("host-cache.png"), animations: "disabled" });
	await dialog.getByRole("button", { name: "Save", exact: true }).click();
	await expect(dialog).toBeHidden();
	const update = api.requests.find((r) => r.method === "PUT" && r.path === "/api/nginx/proxy-hosts/7");
	expect(update?.body).toMatchObject({
		meta: {
			retained: { custom_value: "preserved" },
			waf_ruleset: "base",
			upstream_pool: { targets: [{ weight: 3 }] },
			cache_policy: { routes: [{ path: "/", ttl_seconds: 120 }] },
			wasm_filters: [
				{
					kind: "module",
					enabled: true,
					config: {
						module_id: "b".repeat(64),
						configuration: { TenantID: "demo", HeaderRules: { ExactCase: true } },
					},
				},
				{ kind: "request_header", enabled: true, config: { header: "x-e2e-policy", value: "verified" } },
			],
		},
	});
	expect(api.requests.find((r) => r.method === "POST" && r.path === "/api/nginx/wasm/modules")?.body).toEqual([
		0, 97, 115, 109, 1, 0, 0, 0,
	]);
	expect(api.requests.filter((r) => r.method === "DELETE" && r.path.endsWith("/cache"))).toHaveLength(1);
});

test("navigates incident details and verifies a backup without requesting activation", async ({ page }, testInfo) => {
	const api = await installMockApi(page);
	await signIn(page);
	await page.getByRole("link", { name: "Incident center", exact: true }).click();
	await expect(page.getByRole("heading", { name: "Incident center", exact: true })).toBeVisible();
	await expect(page.getByText("E2E origin unavailable", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "api.e2e.test", exact: true }).click();
	await expect(page.getByRole("img", { name: "Latency · last 24 hours", exact: true })).toBeVisible();
	await page
		.getByTestId("app-content")
		.screenshot({ path: testInfo.outputPath("incident-detail.png"), animations: "disabled" });
	await page.getByRole("link", { name: "Instance backups", exact: true }).click();
	await expect(page.getByText("E2E encrypted backup", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Select for verification or restore", exact: true }).click();
	await page.getByLabel("Archive password", { exact: true }).fill("e2e-archive-password");
	await page.getByRole("button", { name: "Verify with isolated restore", exact: true }).click();
	await expect.poll(() => api.requests.filter((r) => r.path.endsWith("/preflight")).length).toBe(1);
	await expect(
		page.getByText("Archive authentication, hashes, database and Nginx checks passed.", { exact: true }),
	).toBeVisible();
	expect(api.requests.filter((r) => r.path.endsWith("/restore"))).toEqual([]);
	await page
		.getByTestId("app-content")
		.screenshot({ path: testInfo.outputPath("backup-verification.png"), animations: "disabled" });
});

test("uploads and runs a standalone WASI application through the real UI with mocked execution results", async ({
	page,
}, testInfo) => {
	const api = await installMockApi(page);
	await page.setViewportSize({ width: 1440, height: 1100 });
	await signIn(page);
	await page.getByRole("link", { name: "WASI applications", exact: true }).click();
	await expect(page.getByRole("heading", { name: "WASI applications", exact: true })).toBeVisible();
	await expect(page.getByText("No applications uploaded yet.", { exact: true })).toBeVisible();
	await page.getByLabel("Application file (.wasm)", { exact: true }).setInputFiles({
		name: "command.wasm",
		mimeType: "application/wasm",
		buffer: Buffer.from([0, 97, 115, 109, 1, 0, 0, 0]),
	});
	await page.getByLabel("Application name", { exact: true }).fill("WASI command");
	await page.getByRole("button", { name: "Upload application", exact: true }).click();
	await expect(page.getByLabel("Application", { exact: true })).toHaveValue("c".repeat(64));
	await page.getByLabel("Arguments (JSON array)", { exact: true }).fill('["--fail", "ExactCase"]');
	await page.getByLabel("Environment variables (JSON object)", { exact: true }).fill('{"TenantID":42}');
	await page.getByRole("button", { name: "Run", exact: true }).click();
	await expect(page.getByRole("alert")).toContainText("Enter a JSON object with up to 32 string values.");
	expect(api.requests.filter((request) => request.path.endsWith("/run"))).toEqual([]);
	await page.getByLabel("Environment variables (JSON object)", { exact: true }).fill('{"TenantID":"Exact_VALUE"}');
	await page.getByLabel("Standard input (stdin)", { exact: true }).fill("browser input\n");
	await page.getByLabel("Time limit (seconds)", { exact: true }).fill("2.5");
	await page.getByRole("button", { name: "Run", exact: true }).click();
	await expect(page.getByRole("status")).toContainText("Failed · Exit code: 7");
	await expect(page.getByRole("region", { name: "Standard output (stdout)", exact: true })).toHaveText(
		"WASI stdout: browser input\n",
	);
	await expect(page.getByRole("region", { name: "Standard error (stderr)", exact: true })).toHaveText(
		"A nonzero program exit remains visible.\n",
	);
	expect(api.requests.find((request) => request.method === "POST" && request.path.endsWith("/run"))?.body).toEqual({
		args: ["--fail", "ExactCase"],
		env: [{ name: "TenantID", value: "Exact_VALUE" }],
		stdin: "browser input\n",
		timeout_ms: 2500,
	});
	expect(
		api.requests.find((request) => request.method === "POST" && request.path === "/api/nginx/wasm/applications")
			?.body,
	).toEqual([0, 97, 115, 109, 1, 0, 0, 0]);
	await page.addScriptTag({ content: axe.source });
	const violations = await page.evaluate(async () => {
		const result = await (globalThis as typeof globalThis & { axe: typeof axe }).axe.run("#app-content", {
			rules: { "color-contrast": { enabled: false } },
		});
		return result.violations.map((violation) => violation.id);
	});
	expect(violations).toEqual([]);
	for (const width of [1440, 390]) {
		await page.setViewportSize({ width, height: 1100 });
		await page.getByTestId("app-content").screenshot({
			path: testInfo.outputPath(`standalone-wasi-${width}.png`),
			animations: "disabled",
		});
	}
});
