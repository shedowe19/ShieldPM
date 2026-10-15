import { expect, type Page, type Route, test } from "@playwright/test";

const origin = "http://127.0.0.1:4173";
const errors = new WeakMap<Page, string[]>();
test.beforeEach(({ page }) => {
	const collected: string[] = [];
	errors.set(page, collected);
	page.on("pageerror", (error) => collected.push(error.message));
});
test.afterEach(({ page }) => expect(errors.get(page)).toEqual([]));

async function installCookieApi(page: Page) {
	let holdRefresh = false;
	let releaseRefresh: (() => void) | undefined;
	let heldRefreshes = 0;
	const cookieActions: string[] = [];
	const verifiedUsers: number[] = [];
	const user = (id: number) => ({
		id,
		name: id === 1 ? "E2E Administrator" : "E2E Target",
		nickname: id === 1 ? "Administrator" : "Target",
		email: id === 1 ? "admin@e2e.test" : "target@e2e.test",
		avatar: "",
		created_on: "2026-10-15T00:00:00Z",
		is_disabled: false,
		roles: id === 1 ? ["admin"] : ["user"],
		permissions: {},
	});
	const token = (id: number) => ({ expires: Date.now() + 3_600_000, user: user(id) });
	const reply = (route: Route, body: unknown, status = 200, cookie?: string) =>
		route.fulfill({
			status,
			contentType: "application/json",
			body: body === undefined ? undefined : JSON.stringify(body),
			headers: cookie ? { "set-cookie": cookie } : undefined,
		});
	const identityCookie = (id: number) => `e2e_identity=${id}; Path=/; HttpOnly; SameSite=Lax`;
	await page.routeWebSocket("**", (socket) => socket.close());
	await page.route("**", async (route) => {
		const request = route.request();
		const url = new URL(request.url());
		if (url.origin !== origin) return route.abort("blockedbyclient");
		if (!url.pathname.startsWith("/api/")) return route.continue();
		const path = url.pathname;
		const method = request.method();
		const id = Number(/(?:^|;\s*)e2e_identity=(\d+)/.exec(request.headers().cookie || "")?.[1] || 0);
		if (method === "GET" && path === "/api/")
			return reply(route, { setup: true, status: "OK", version: "4.4.1-e2e" });
		if (method === "POST" && path === "/api/oidc/claim")
			return reply(route, { error: { message: "No OIDC session" } }, 404);
		if (method === "POST" && path === "/api/tokens") return reply(route, token(1), 200, identityCookie(1));
		if (method === "POST" && path === "/api/tokens/refresh") {
			if (!id) return reply(route, { error: { message: "No session" } }, 401);
			if (holdRefresh) {
				heldRefreshes += 1;
				await new Promise<void>((resolve) => {
					releaseRefresh = resolve;
				});
			}
			return reply(route, token(1), 200, identityCookie(1));
		}
		if (method === "POST" && path === "/api/users/2/login") {
			cookieActions.push(path);
			return reply(route, token(2), 200, identityCookie(2));
		}
		if (method === "POST" && path === "/api/tokens/restore") {
			cookieActions.push(path);
			return reply(route, { error: { message: "No backup session" } }, 400);
		}
		if (method === "POST" && path === "/api/tokens/logout") {
			cookieActions.push(path);
			return reply(route, undefined, 204, "e2e_identity=; Path=/; HttpOnly; Max-Age=0; SameSite=Lax");
		}
		if (method === "GET" && path === "/api/users/me") {
			if (!id) return reply(route, { error: { message: "No session" } }, 401);
			verifiedUsers.push(id);
			return reply(route, user(id));
		}
		if (method === "GET" && path === "/api/users") return reply(route, [user(1), user(2)]);
		if (method === "GET" && /^\/api\/users\/\d+$/.test(path))
			return reply(route, user(Number(path.split("/").pop())));
		if (method === "GET" && path === "/api/reports/hosts")
			return reply(route, { dead: 0, proxy: 0, redirection: 0, stream: 0 });
		if (
			method === "GET" &&
			["/api/analytics/top-hosts", "/api/dashboard/notes", "/api/nginx/certificates"].includes(path)
		)
			return reply(route, []);
		if (method === "GET" && path === "/api/version/check")
			return reply(route, { current: "4.4.1-e2e", latest: null, updateAvailable: false });
		await route.abort("blockedbyclient");
		throw new Error(`Unexpected cookie-race request: ${method} ${path}`);
	});
	return {
		cookieActions,
		verifiedUsers,
		hold: () => {
			holdRefresh = true;
		},
		held: () => heldRefreshes,
		release: () => {
			holdRefresh = false;
			releaseRefresh?.();
		},
	};
}

for (const action of ["impersonation", "logout"] as const) {
	test(`waits for a delayed HttpOnly refresh response before ${action} and preserves the next request identity`, async ({
		page,
		context,
	}) => {
		await page.clock.install();
		const api = await installCookieApi(page);
		await page.goto("/");
		await page.getByLabel("Email address").fill("admin@e2e.test");
		await page.getByLabel("Password").fill("a-safe-test-password");
		await page.getByRole("button", { name: "Sign in", exact: true }).click();
		await expect(page.getByTestId("app-content")).toBeVisible();
		if (action === "impersonation") {
			await page.goto("/users");
			await expect(page.getByRole("row").filter({ hasText: "E2E Target" })).toBeVisible();
		}
		api.hold();
		await page.clock.runFor(300_001);
		await expect.poll(api.held).toBe(1);
		if (action === "impersonation") {
			await page
				.getByRole("row")
				.filter({ hasText: "E2E Target" })
				.getByRole("button", { name: "Open action menu" })
				.click();
			await page.getByRole("menuitem", { name: "Sign in as E2E Target" }).click();
		} else {
			await page.getByRole("button", { name: "Toggle user menu" }).click();
			await page.getByRole("menuitem", { name: "Logout", exact: true }).click();
		}
		expect(api.cookieActions).toEqual([]);
		api.release();
		if (action === "impersonation") {
			await expect.poll(() => api.verifiedUsers[api.verifiedUsers.length - 1]).toBe(2);
			const cookie = (await context.cookies()).find((item) => item.name === "e2e_identity");
			expect(cookie).toMatchObject({ value: "2", httpOnly: true });
			await page.reload();
			await expect(page.getByTestId("app-content")).toBeVisible();
			expect(api.verifiedUsers[api.verifiedUsers.length - 1]).toBe(2);
		} else {
			await expect(page.getByRole("heading", { name: "Login to your account" })).toBeVisible();
			expect((await context.cookies()).some((item) => item.name === "e2e_identity")).toBe(false);
			await page.reload();
			await expect(page.getByRole("heading", { name: "Login to your account" })).toBeVisible();
		}
	});
}
