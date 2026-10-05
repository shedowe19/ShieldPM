import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ database: null }));
vi.mock("../../db.js", async () => {
	const { default: knex } = await import("knex");
	state.database = knex({ client: "better-sqlite3", connection: { filename: ":memory:" }, useNullAsDefault: true });
	return { default: () => state.database };
});
vi.mock("../../lib/config.js", () => ({ isSqlite: () => true, getEncryptionKey: () => "0".repeat(64) }));
vi.mock("../../internal/ai/executor.js", () => ({ executeTools: vi.fn() }));
vi.mock("../../internal/ai/tools.js", () => ({ getToolDefinitions: vi.fn() }));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../logger.js", () => ({ global: {}, migrate: { info: vi.fn() } }));

import ai from "../../internal/ai.js";
import { decrypt, encrypt } from "../../lib/encryption.js";
import errs from "../../lib/error.js";
import { up as createSettingsTable } from "../../migrations/20190227065017_settings.js";
import Setting from "../../models/setting.js";

const access = { can: vi.fn(async () => true) };
const savedConfig = {
	enabled: true,
	provider: "local",
	api_key: "stored-secret",
	base_url: "https://llm.example.com/v1",
	model: "saved-model",
};

describe("AI configuration read errors preserve saved settings", () => {
	beforeAll(async () => createSettingsTable(state.database));
	beforeEach(async () => {
		await Setting.query().delete();
		access.can.mockReset().mockResolvedValue(true);
		await Setting.query().insert({
			id: "ai-config",
			name: "AI configuration",
			description: "Existing saved configuration",
			value: "true",
			meta: { ...savedConfig, api_key: encrypt(savedConfig.api_key) },
		});
	});
	afterEach(() => vi.restoreAllMocks());
	afterAll(async () => state.database.destroy());

	it("returns defaults only for an actually missing configuration row", async () => {
		await Setting.query().delete();
		expect(await ai.getConfig(access)).toMatchObject({
			enabled: false,
			provider: "gemini",
			api_key: "",
			model: "",
		});
	});

	it("propagates a database read failure and returns the preserved saved configuration after recovery", async () => {
		const before = await state.database("setting").where("id", "ai-config").first();
		const error = Object.assign(new Error("Database unavailable"), { status: 503 });
		vi.spyOn(Setting, "query").mockImplementationOnce(() => {
			throw error;
		});
		await expect(ai.getConfig(access)).rejects.toBe(error);
		expect(await state.database("setting").where("id", "ai-config").first()).toEqual(before);
		expect(await ai.getConfig(access)).toMatchObject(savedConfig);
	});

	it("does not turn a settings:get permission failure into defaults", async () => {
		const error = new errs.PermissionError("Settings read denied");
		access.can.mockImplementation(async (permission) => {
			if (permission === "settings:get") throw error;
			return true;
		});
		await expect(ai.getConfig(access)).rejects.toBe(error);
		expect((await Setting.query().findById("ai-config")).meta.model).toBe(savedConfig.model);
	});

	it("does not overwrite saved metadata when the existence check during save fails", async () => {
		const before = await state.database("setting").where("id", "ai-config").first();
		const error = Object.assign(new Error("Read failed during save"), { status: 503 });
		vi.spyOn(Setting, "query").mockImplementationOnce(() => {
			throw error;
		});
		await expect(ai.setConfig(access, { enabled: false, provider: "gemini" })).rejects.toBe(error);
		expect(await state.database("setting").where("id", "ai-config").first()).toEqual(before);
	});

	it("keeps successful reads and saves using the actual settings model and encrypted API key", async () => {
		const changed = { ...(await ai.getConfig(access)), model: "new-model" };
		await ai.setConfig(access, changed);
		expect(await ai.getConfig(access)).toMatchObject({ ...savedConfig, model: "new-model" });
		const current = await Setting.query().findById("ai-config");
		expect(current.meta.api_key).not.toBe(savedConfig.api_key);
		expect(decrypt(current.meta.api_key)).toBe(savedConfig.api_key);
	});
});
