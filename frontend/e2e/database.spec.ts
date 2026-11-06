import { expect, type Page, type Route, test } from "@playwright/test";

type Engine = "sqlite" | "mysql2" | "pg";
const capability = "synthetic-database-operation-capability";
const password = "synthetic-database-password";
interface Fixture {
	engine: Engine | null;
	required: boolean;
	maintenance: boolean;
	account: boolean;
	polls: number;
	operation: { id: string; state: string; phase: string; canCancel: boolean; error?: string } | null;
	poll?: (route: Route) => Promise<void>;
	setupBody?: Record<string, unknown>;
	switchBody?: Record<string, unknown>;
	acknowledged: boolean;
	databaseReads?: number;
	target?: Engine;
}
async function fixture(page: Page, state: Fixture) {
	const urls: string[] = [];
	page.on("request", (request) => {
		if (request.url().includes("/api/")) urls.push(request.url());
	});
	await page.routeWebSocket("**", (socket) => socket.close());
	await page.route("**/api/**", async (route) => {
		const pathname = new URL(route.request().url()).pathname;
		if (pathname === "/api/database" && route.request().method() === "GET") {
			state.databaseReads = (state.databaseReads || 0) + 1;
			if (!state.account && !state.required && !state.maintenance) {
				await route.fulfill({
					status: 403,
					contentType: "application/json",
					body: JSON.stringify({ error: { message: "Forbidden" } }),
				});
				return;
			}
		}
		if (
			route.request().method() === "POST" &&
			pathname.startsWith("/api/database/") &&
			route.request().headers()["x-xsrf-token"] !== "database-fixture-csrf"
		) {
			await route.fulfill({
				status: 403,
				contentType: "application/json",
				body: JSON.stringify({ error: { code: 403, reason: "EBADCSRFTOKEN", message: "Invalid CSRF token" } }),
			});
			return;
		}
		let body: unknown = {};
		if (pathname === "/api/")
			body = {
				setup: state.account,
				status: state.maintenance ? "MAINTENANCE" : "OK",
				databaseSetupRequired: state.required,
				databaseMaintenance: state.maintenance,
				csrfToken: "database-fixture-csrf",
				version: "4.4.1-e2e",
			};
		else if (pathname === "/api/tokens/refresh") body = { expires: Date.now() + 3600000, user: { id: 1 } };
		else if (pathname === "/api/users/me" || pathname === "/api/users/1")
			body = {
				id: 1,
				name: "Fixture administrator",
				nickname: "Fixture",
				email: "fixture@e2e.test",
				roles: ["admin"],
				permissions: {},
			};
		else if (pathname === "/api/database")
			body = {
				engine: state.engine,
				configured: Boolean(state.engine),
				source: "managed",
				editable: true,
				supportedTransitions:
					state.engine === "sqlite" || !state.engine ? ["sqlite", "mysql2", "pg"] : ["sqlite"],
				connection:
					state.engine === "sqlite"
						? null
						: {
								host: "current.invalid",
								port: 5432,
								user: "fixture",
								name: "shieldpm",
								ssl: false,
								passwordConfigured: true,
							},
				operation: state.operation,
			};
		else if (pathname === "/api/database/test") body = { ok: true };
		else if (pathname === "/api/database/setup" || pathname === "/api/database/switch") {
			const data = route.request().postDataJSON();
			if (pathname.endsWith("setup")) {
				state.setupBody = data;
				state.target = data.engine;
			} else {
				state.switchBody = data;
				state.target = data.target.engine;
			}
			expect(route.request().headers()["x-xsrf-token"]).toBe("database-fixture-csrf");
			state.maintenance = true;
			state.operation = {
				id: "fixture-database-operation",
				state: "requested",
				phase: "requested",
				canCancel: false,
			};
			await route.fulfill({
				status: 202,
				contentType: "application/json",
				body: JSON.stringify({ ...state.operation, operationToken: capability }),
			});
			return;
		} else if (pathname === "/api/database/operation") {
			expect(route.request().headers()["x-database-operation-token"]).toBe(capability);
			expect(new URL(route.request().url()).searchParams.get("token")).toBeNull();
			state.polls++;
			if (state.poll) {
				await state.poll(route);
				return;
			}
			body = state.operation;
		} else if (pathname === "/api/database/operation/cancel") {
			expect(route.request().headers()["x-database-operation-token"]).toBe(capability);
			expect(route.request().headers()["x-xsrf-token"]).toBe("database-fixture-csrf");
			expect(route.request().postDataJSON()).toEqual({ id: "fixture-database-operation" });
			state.acknowledged = true;
			state.maintenance = false;
			state.operation = null;
			body = { state: "cancelled" };
		} else if (pathname.includes("notifications")) body = [];
		await route.fulfill({ contentType: "application/json", body: JSON.stringify(body) });
	});
	return urls;
}
const selectEngine = async (page: Page, name: string) => {
	await page.getByRole("combobox", { name: "Database engine" }).click();
	await page.getByRole("option", { name, exact: true }).click();
};
const fillServer = async (page: Page) => {
	await page.getByLabel("Database host", { exact: true }).fill("target.invalid");
	await page.getByLabel("Database name", { exact: true }).fill("dedicated_empty_target");
	await page.getByLabel("Database user", { exact: true }).fill("fixture");
	await page.getByLabel("Database password", { exact: true }).fill(password);
};
const verifyConnection = async (page: Page) => {
	await page.getByRole("button", { name: "Test connection", exact: true }).click();
	await expect(page.getByText(/Connection test succeeded/)).toBeVisible();
};
const agree = async (page: Page) => {
	await page.getByRole("checkbox", { name: /current, verified backup/ }).check();
	await page.getByRole("checkbox", { name: /stopped all other ShieldPM/ }).check();
};

test("first setup chooses a database before the account and resumes safely through a restart interruption", async ({
	page,
}) => {
	const state: Fixture = {
		engine: null,
		required: true,
		maintenance: false,
		account: false,
		polls: 0,
		operation: null,
		acknowledged: false,
	};
	state.poll = async (route) => {
		if (state.polls === 1) {
			await route.abort("connectionrefused");
			return;
		}
		if (state.polls >= 3) {
			state.engine = state.target || "pg";
			state.required = false;
			state.maintenance = false;
			state.operation = {
				id: "fixture-database-operation",
				state: "completed",
				phase: "completed",
				canCancel: false,
			};
		} else
			state.operation = {
				id: "fixture-database-operation",
				state: "running",
				phase: "copying",
				canCancel: false,
			};
		await route.fulfill({ contentType: "application/json", body: JSON.stringify(state.operation) });
	};
	const urls = await fixture(page, state);
	await page.goto("/");
	await expect(page.getByText("Choose your database", { exact: true })).toBeVisible();
	await expect(page.getByLabel("Full Name", { exact: true })).toHaveCount(0);
	await expect(page.getByRole("combobox")).toHaveText("SQLite");
	await selectEngine(page, "PostgreSQL");
	await fillServer(page);
	await expect(page.getByLabel("Port", { exact: true })).toHaveValue("5432");
	await page.screenshot({ path: "/tmp/database-first-setup.png", fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
	await page.screenshot({ path: "/tmp/database-first-setup-mobile.png", fullPage: true });
	await page.setViewportSize({ width: 1280, height: 720 });
	await verifyConnection(page);
	await page.getByRole("button", { name: "Use database and continue", exact: true }).click();
	await expect(page.getByText(/Restart interruptions are expected/)).toBeVisible();
	expect(state.setupBody).toMatchObject({ engine: "pg", host: "target.invalid", password });
	const retained = await page.evaluate(() => sessionStorage.getItem("shieldpm.database.operation"));
	expect(retained).toContain(capability);
	expect(retained).not.toContain(password);
	expect(retained).not.toContain("target.invalid");
	await page.reload();
	await expect(page.getByText("Initializing the database", { exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Continue to ShieldPM", exact: true })).toBeEnabled({
		timeout: 15000,
	});
	expect(await page.evaluate(() => sessionStorage.getItem("shieldpm.database.operation"))).toBeNull();
	await page.getByRole("button", { name: "Continue to ShieldPM", exact: true }).click();
	await expect(page.getByLabel("Full Name", { exact: true })).toBeVisible();
	for (const url of urls) {
		expect(url).not.toContain(password);
		expect(url).not.toContain(capability);
	}
});

test("failed PostgreSQL to SQLite conversion can acknowledge safe recovery without claiming activation", async ({
	page,
}) => {
	const state: Fixture = {
		engine: "pg",
		required: false,
		maintenance: false,
		account: true,
		polls: 0,
		operation: null,
		acknowledged: false,
	};
	state.poll = async (route) => {
		state.operation = {
			id: "fixture-database-operation",
			state: "failed",
			phase: "preparing",
			canCancel: true,
			error: "Destination must be empty",
		};
		await route.fulfill({ contentType: "application/json", body: JSON.stringify(state.operation) });
	};
	await fixture(page, state);
	await page.goto("/settings?tab=database");
	await expect(page.getByText("Current database: PostgreSQL", { exact: true })).toBeVisible();
	await page.getByRole("combobox").click();
	await expect(page.getByRole("option", { name: "MySQL / MariaDB", exact: true })).toHaveCount(0);
	await page.getByRole("option", { name: "SQLite", exact: true }).click();
	await verifyConnection(page);
	await page.getByRole("checkbox", { name: /current, verified backup/ }).check();
	await expect(page.getByRole("button", { name: "Convert database and restart" })).toBeDisabled();
	await page.getByRole("checkbox", { name: /stopped all other ShieldPM/ }).check();
	await page.getByRole("button", { name: "Convert database and restart" }).click();
	await expect(page.getByText("Destination must be empty", { exact: true })).toBeVisible();
	expect(state.switchBody).toEqual({ target: { engine: "sqlite" }, confirm: true, confirmExclusive: true });
	await page.screenshot({ path: "/tmp/database-conversion-recovery.png", fullPage: true });
	await page.setViewportSize({ width: 390, height: 844 });
	expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
	await page.screenshot({ path: "/tmp/database-conversion-recovery-mobile.png", fullPage: true });
	await page.getByRole("button", { name: "Acknowledge failure and return to the current database" }).click();
	await expect(page.getByRole("button", { name: "Continue to ShieldPM", exact: true })).toBeEnabled();
	expect(state.acknowledged).toBe(true);
	await page.getByRole("button", { name: "Continue to ShieldPM", exact: true }).click();
	await expect(page.getByText("Current database: PostgreSQL", { exact: true })).toBeVisible();
	expect(await page.evaluate(() => sessionStorage.getItem("shieldpm.database.operation"))).toBeNull();
});

test("SQLite to MySQL conversion gates confirmation and shows the verified destination after restart", async ({
	page,
}) => {
	const state: Fixture = {
		engine: "sqlite",
		required: false,
		maintenance: false,
		account: true,
		polls: 0,
		operation: null,
		acknowledged: false,
	};
	state.poll = async (route) => {
		if (state.polls >= 2) {
			state.engine = "mysql2";
			state.maintenance = false;
			state.operation = {
				id: "fixture-database-operation",
				state: "completed",
				phase: "completed",
				canCancel: false,
			};
		} else
			state.operation = {
				id: "fixture-database-operation",
				state: "running",
				phase: "copying",
				canCancel: false,
			};
		await route.fulfill({ contentType: "application/json", body: JSON.stringify(state.operation) });
	};
	const urls = await fixture(page, state);
	await page.goto("/settings?tab=database");
	await expect(page.getByText("Current database: SQLite", { exact: true })).toBeVisible();
	await expect(page.getByRole("combobox")).toHaveText("MySQL / MariaDB");
	await fillServer(page);
	await verifyConnection(page);
	await agree(page);
	await page.screenshot({ path: "/tmp/database-settings-desktop.png", fullPage: true });
	await page.getByRole("button", { name: "Convert database and restart" }).click();
	await expect(page.getByText("Database conversion", { exact: true })).toBeVisible();
	await expect(page.getByRole("button", { name: "Continue to ShieldPM", exact: true })).toBeEnabled({
		timeout: 15000,
	});
	await page.getByRole("button", { name: "Continue to ShieldPM", exact: true }).click();
	await expect(page.getByText("Current database: MySQL / MariaDB", { exact: true })).toBeVisible();
	expect(state.switchBody).toMatchObject({
		target: { engine: "mysql2", password },
		confirm: true,
		confirmExclusive: true,
	});
	await page.setViewportSize({ width: 390, height: 844 });
	expect(await page.evaluate(() => document.documentElement.scrollWidth > window.innerWidth)).toBe(false);
	await page.screenshot({ path: "/tmp/database-settings-mobile.png", fullPage: true });
	await page.evaluate(() => localStorage.setItem("locale", "de"));
	await page.reload();
	await expect(page.getByText("Aktuelle Datenbank: MySQL / MariaDB", { exact: true })).toBeVisible();
	await page.screenshot({ path: "/tmp/database-settings-german-mobile.png", fullPage: true });
	await page.setViewportSize({ width: 1440, height: 1000 });
	await page.screenshot({ path: "/tmp/database-settings-german-desktop.png", fullPage: true });
	for (const url of urls) {
		expect(url).not.toContain(password);
		expect(url).not.toContain(capability);
	}
});

test("an expired monitor capability returns only after active database inspection, including pre-account setup", async ({
	page,
}) => {
	const state: Fixture = {
		engine: "sqlite",
		required: false,
		maintenance: false,
		account: true,
		polls: 0,
		operation: null,
		acknowledged: false,
	};
	state.poll = async (route) => {
		await route.fulfill({
			status: 403,
			contentType: "application/json",
			body: JSON.stringify({ error: { message: "Operation capability is no longer valid" } }),
		});
	};
	await fixture(page, state);
	await page.goto("/settings?tab=database");
	await expect(page.getByText("Current database: SQLite", { exact: true })).toBeVisible();
	const seed = async (kind: "setup" | "switch") =>
		page.evaluate(
			({ token, kind }) =>
				sessionStorage.setItem(
					"shieldpm.database.operation",
					JSON.stringify({ id: "fixture-database-operation", token, kind, targetEngine: "pg" }),
				),
			{ token: capability, kind },
		);
	await seed("switch");
	await page.reload();
	await page.getByRole("button", { name: "Inspect current database and return", exact: true }).click();
	await expect(page.getByText("Current database: SQLite", { exact: true })).toBeVisible();
	expect(await page.evaluate(() => sessionStorage.getItem("shieldpm.database.operation"))).toBeNull();
	await expect(
		page.getByText("The destination database is active and verified. ShieldPM is ready.", { exact: true }),
	).toHaveCount(0);
	state.account = false;
	state.engine = "pg";
	const reads = state.databaseReads;
	await seed("setup");
	await page.reload();
	await page.getByRole("button", { name: "Inspect current database and return", exact: true }).click();
	await expect(page.getByLabel("Full Name", { exact: true })).toBeVisible();
	expect(state.databaseReads).toBe(reads);
	expect(await page.evaluate(() => sessionStorage.getItem("shieldpm.database.operation"))).toBeNull();
});
