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

async function installMockApi(page: Page) {
	let authenticated = false;
	const notes: DashboardNote[] = [];
	const requests: ApiRequest[] = [];
	const topHostSorts: string[] = [];

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
		const body = request.postDataJSON();
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

		if (method === "GET" && path === "/api/settings/oidc-config") {
			return fulfill(route, {
				description: "Sign in to ShieldPM with an external Identity Provider",
				id: "oidc-config",
				meta: { enabled: false },
				name: "Open ID Connect",
				value: "metadata",
			});
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
	await expect
		.poll(() =>
			api.requests.filter((request) => request.path === "/api/settings/oidc-config" && request.method === "GET"),
		)
		.toHaveLength(1);
	await expect(page.getByRole("heading", { name: "Top Proxy Hosts" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Top Bandwidth Consumers" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "Top Server Errors" })).toBeVisible();
	await expect.poll(() => api.topHostSorts).toEqual(expect.arrayContaining(["requests", "bytes", "server_errors"]));
	await expect(page.getByTestId("dashboard-top-bandwidth")).toContainText(/1\.5\s?kB/);
	await expect(page.getByTestId("dashboard-top-hosts").getByRole("link", { name: "api.e2e.test" })).toHaveAttribute(
		"href",
		"/analytics?host=7&range=24h",
	);

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
