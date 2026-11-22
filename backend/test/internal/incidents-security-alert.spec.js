import { afterAll, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ database: null, send: vi.fn() }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.database = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.database };
});
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => true,
	isPostgres: () => false,
	isDemoMode: () => false,
	getEncryptionKey: () => "0".repeat(64),
}));
vi.mock("../../lib/encryption.js", () => ({ decrypt: (value) => value, encrypt: (value) => value }));
vi.mock("../../lib/notification-http.js", () => ({
	deliverNotification: state.send,
	validateNotificationUrl: vi.fn(),
}));

import incidents from "../../internal/incidents.js";

beforeAll(async () => {
	await state.database.schema.createTable("notification_target", (table) => {
		table.increments("id");
		table.integer("owner_user_id");
		table.string("name");
		table.string("type");
		table.boolean("enabled").defaultTo(1);
		table.text("host_ids");
		table.text("secret");
		table.integer("version");
		table.string("created_on");
		table.string("modified_on");
	});
});

afterAll(async () => state.database.destroy());

beforeEach(async () => {
	state.send.mockReset().mockResolvedValue(204);
	await state.database("notification_target").delete();
});

const target = (owner, enabled = 1) => ({
	owner_user_id: owner,
	name: "Security webhook",
	type: "webhook",
	enabled,
	host_ids: JSON.stringify([]),
	secret: JSON.stringify({ url: "https://notify.example/hook", token: "" }),
	version: 1,
	created_on: new Date().toISOString(),
	modified_on: new Date().toISOString(),
});

describe("security alert notification path", () => {
	it("delivers a high severity replay alert to every enabled target of the account", async () => {
		await state.database("notification_target").insert([target(7), target(7), target(8), target(7, 0)]);

		const delivered = await incidents.securityAlert({
			owner_user_id: 7,
			event: "security.refresh_replay",
			severity: "high",
			message: "Refresh token replay detected",
			meta: { family_id: "family-42" },
		});

		expect(delivered).toBe(2);
		expect(state.send).toHaveBeenCalledTimes(2);
		expect(state.send).toHaveBeenCalledWith(
			expect.objectContaining({ owner_user_id: 7 }),
			{ url: "https://notify.example/hook", token: "" },
			expect.objectContaining({
				event: "security.refresh_replay",
				severity: "high",
				state: "security",
				message: "Refresh token replay detected",
				family_id: "family-42",
			}),
			expect.any(Number),
			undefined,
		);
	});

	it("keeps the caller alive when a target fails", async () => {
		await state.database("notification_target").insert(target(7));
		state.send.mockRejectedValue(new Error("endpoint unavailable"));

		await expect(
			incidents.securityAlert({ owner_user_id: 7, event: "security.refresh_replay", message: "Replay" }),
		).resolves.toBe(1);
	});

	it("is a no-op for an account without targets or an invalid owner", async () => {
		await expect(incidents.securityAlert({ owner_user_id: 99, event: "security.refresh_replay" })).resolves.toBe(0);
		await expect(incidents.securityAlert({ owner_user_id: "invalid" })).resolves.toBe(0);
		expect(state.send).not.toHaveBeenCalled();
	});
});
