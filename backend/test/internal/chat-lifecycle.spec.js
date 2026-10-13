import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ bots: [], requests: [] }));
vi.mock("telegraf", () => ({
	Telegraf: class {
		constructor() {
			mocks.bots.push(this);
		}
		telegram = {
			callApi: (_method, _payload, { signal }) =>
				new Promise((resolve, reject) => {
					mocks.requests.push({ signal, resolve });
					signal.addEventListener("abort", () => reject(new Error("aborted")), { once: true });
				}),
		};
		use(middleware) {
			this.middleware = middleware;
		}
		on() {}
		catch() {}
		launch() {
			return this.telegram.callApi("getMe", {});
		}
		stop() {
			throw new Error("Bot is not running!");
		}
	},
}));
vi.mock("telegraf/filters", () => ({ message: () => "text" }));
vi.mock("../../lib/access.js", () => ({ default: class {} }));
vi.mock("../../lib/config.js", () => ({ getPrivateKey: vi.fn() }));
vi.mock("../../lib/encryption.js", () => ({ decrypt: (token) => token }));
vi.mock("../../logger.js", () => ({ global: { info: vi.fn(), warn: vi.fn(), error: vi.fn(), debug: vi.fn() } }));
vi.mock("../../models/chat_integration.js", () => ({ default: {} }));
vi.mock("../../internal/ai.js", () => ({ default: {} }));

import chat from "../../internal/chat.js";
import { global as logger } from "../../logger.js";

const integration = (id) => ({ id, enabled: true, token: "token", config: { allowed_ids: [7] }, user_id: 1 });

describe("ChatOps launch cancellation", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		mocks.bots.length = 0;
		mocks.requests.length = 0;
	});
	afterEach(async () => {
		for (const id of [101, 102, 103]) await chat.stopBot(id);
	});

	it.each([undefined, null, {}, { allowed_ids: undefined }, { allowed_ids: null }, { allowed_ids: [] }])(
		"denies chat access and warns for an unconfigured allowlist %s",
		async (config) => {
			await chat.startBot({ ...integration(103), config });
			const next = vi.fn();
			const context = { from: { id: 7 } };
			await mocks.bots[0].middleware(context, next);
			expect(next).not.toHaveBeenCalled();
			expect(context).not.toHaveProperty("shieldAccess");
			expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
				"[ChatOps] WARNING: allowed_ids is not configured — all access denied",
			);
		},
	);

	it("denies a foreign Telegram user before synthesizing account access", async () => {
		await chat.startBot(integration(103));
		const next = vi.fn();
		const context = { from: { id: 8 } };
		await mocks.bots[0].middleware(context, next);
		expect(next).not.toHaveBeenCalled();
		expect(context).not.toHaveProperty("shieldAccess");
		expect(logger.warn).toHaveBeenCalledExactlyOnceWith(
			"[ChatOps] Unauthorized access attempt from Telegram ID: 8",
		);
	});

	it("cancels an in-progress launch when stopped before polling exists", async () => {
		await chat.startBot(integration(101));
		const old = mocks.bots[0];
		await chat.stopBot(101);
		expect(mocks.requests[0].signal.aborted).toBe(true);
		const next = vi.fn();
		await old.middleware({ from: { id: 7 } }, next);
		expect(next).not.toHaveBeenCalled();
	});
	it("keeps a replacement bot active when the previous launch rejects", async () => {
		await chat.startBot(integration(102));
		await chat.startBot(integration(102));
		await Promise.resolve();
		expect(mocks.requests[0].signal.aborted).toBe(true);
		expect(mocks.requests[1].signal.aborted).toBe(false);
		await chat.stopBot(102);
		expect(mocks.requests[1].signal.aborted).toBe(true);
	});
});
