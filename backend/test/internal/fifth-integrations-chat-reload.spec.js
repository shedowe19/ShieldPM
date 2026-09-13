import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({
	rows: new Map(),
	bots: [],
	read: null,
	deleteGate: null,
	deleting: false,
	handlers: {},
}));
vi.mock("telegraf", () => ({
	Telegraf: class {
		constructor(token) {
			this.token = token;
			state.bots.push(this);
		}
		telegram = {
			callApi: async (_method, _payload, options) => {
				this.signal = options.signal;
			},
		};
		use() {}
		on() {}
		catch() {}
		launch() {
			return this.telegram.callApi("getMe", {});
		}
		stop() {}
	},
}));
vi.mock("telegraf/filters", () => ({ message: () => "text" }));
vi.mock("../../lib/access.js", () => ({ default: class {} }));
vi.mock("../../lib/config.js", () => ({ getPrivateKey: vi.fn() }));
vi.mock("../../lib/encryption.js", () => ({ decrypt: (value) => value, encrypt: (value) => value }));
vi.mock("../../logger.js", () => ({ global: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../../internal/ai.js", () => ({ default: {} }));
vi.mock("../../lib/express/jwt-decode.js", () => ({ default: () => () => {} }));
vi.mock("../../lib/validator/api.js", () => ({ default: vi.fn() }));
vi.mock("../../schema/index.js", () => ({ getValidationSchema: vi.fn() }));
vi.mock("express", () => ({
	default: {
		Router: () => {
			const router = {};
			for (const method of ["get", "post", "put", "delete"])
				router[method] = (path, ...handlers) => {
					state.handlers[`${method}:${path}`] = handlers.at(-1);
					return router;
				};
			return router;
		},
	},
}));
vi.mock("../../models/chat_integration.js", () => ({
	default: {
		query: () => {
			let id;
			const query = {
				findById: (value) => {
					id = Number(value);
					return query;
				},
				where: () => query,
				deleteById: async (value) => {
					state.deleting = true;
					if (state.deleteGate) await state.deleteGate;
					state.rows.delete(Number(value));
				},
				// biome-ignore lint/suspicious/noThenProperty: Objection queries are thenable.
				then: (resolve, reject) => {
					const row = state.rows.get(id);
					return Promise.resolve(state.read ? state.read(row) : row).then(resolve, reject);
				},
			};
			return query;
		},
	},
}));

import chat from "../../internal/chat.js";
import "../../routes/chat.js";

const integration = () => {
	const row = { id: 401, user_id: 7, enabled: true, token: "original-token", config: { allowed_ids: [7] } };
	state.rows.set(row.id, row);
	return row;
};

describe("ChatOps delayed configuration reads", () => {
	beforeEach(() => {
		state.rows.clear();
		state.bots.length = 0;
		state.read = null;
		state.deleteGate = null;
		state.deleting = false;
	});
	afterEach(async () => chat.stopBot(401));

	it("does not launch a bot after stop invalidates its pending configuration read", async () => {
		const row = integration();
		let completeRead;
		state.read = () =>
			new Promise((resolve) => {
				completeRead = resolve;
			});
		const reload = chat.reload(row.id);
		await vi.waitFor(() => expect(completeRead).toBeTypeOf("function"));
		await chat.stopBot(row.id);
		completeRead(row);
		await reload;
		expect(state.bots.length).toBe(0);
	});

	it("keeps a newer configuration when an older reload completes last", async () => {
		const row = integration();
		let completeRead;
		state.read = () =>
			new Promise((resolve) => {
				completeRead = resolve;
			});
		const older = chat.reload(row.id);
		await vi.waitFor(() => expect(completeRead).toBeTypeOf("function"));
		state.read = null;
		state.rows.set(row.id, { ...row, token: "rotated-token" });
		await chat.reload(row.id);
		completeRead(row);
		await older;
		expect(state.bots.map((bot) => bot.token)).toEqual(["rotated-token"]);
		expect(state.bots[0].signal.aborted).toBe(false);
	});

	it("stops a concurrent reload after the delete route finishes removing the record", async () => {
		const row = integration();
		await chat.startBot(row);
		let finishDelete;
		state.deleteGate = new Promise((resolve) => {
			finishDelete = resolve;
		});
		const response = {
			locals: { access: { can: async () => true, token: { getUserId: () => 7 } } },
			json: vi.fn(),
		};
		const deletion = state.handlers["delete:/:id"]({ params: { id: String(row.id) } }, response);
		await vi.waitFor(() => expect(state.deleting).toBe(true));
		await chat.reload(row.id);
		finishDelete();
		await deletion;
		expect(state.rows.has(row.id)).toBe(false);
		expect(state.bots.every((bot) => bot.signal.aborted)).toBe(true);
		expect(response.json).toHaveBeenCalledWith({ status: "ok" });
	});
});
