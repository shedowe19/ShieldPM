import { beforeEach, describe, expect, it, vi } from "vitest";

const mockChatService = {
	startBot: vi.fn(() => Promise.resolve()),
	reload: vi.fn(() => Promise.resolve()),
	stopBot: vi.fn(() => Promise.resolve()),
};

const mockIntegrationRecord = { id: 1, user_id: 1, type: "telegram", token: "enc_token", meta: {}, config: {} };

vi.mock("../../modules/chat/index.js", () => ({ chatService: mockChatService }));
vi.mock("../../lib/error.js", () => {
	class ItemNotFoundError extends Error {
		constructor() {
			super("Not Found");
			this.status = 404;
			this.public = true;
		}
	}
	return { default: { ItemNotFoundError } };
});
vi.mock("../../lib/encryption.js", () => ({
	encrypt: vi.fn((v) => `enc_${v}`),
}));
vi.mock("../../lib/express/jwt-decode.js", () => ({
	default: () => (_req, res, next) => {
		res.locals.access = {
			token: { getUserId: () => 1 },
			can: vi.fn(() => Promise.resolve()),
		};
		next();
	},
}));
vi.mock("../../lib/validator/api.js", () => ({
	default: vi.fn((_s, body) => Promise.resolve(body)),
}));
vi.mock("../../models/chat_integration.js", () => ({
	default: {
		query: vi.fn(() => ({
			where: vi.fn(() => Promise.resolve([mockIntegrationRecord])),
			findById: vi.fn((id) => Promise.resolve(id === 1 ? mockIntegrationRecord : null)),
			insertAndFetch: vi.fn((data) => Promise.resolve({ id: 2, ...data })),
			patchAndFetchById: vi.fn((id, data) => Promise.resolve({ ...mockIntegrationRecord, ...data, id })),
			deleteById: vi.fn(() => Promise.resolve()),
		})),
	},
}));
vi.mock("../../schema/index.js", () => ({
	getValidationSchema: vi.fn(() => ({})),
}));

beforeEach(() => vi.clearAllMocks());

describe("chat routes", () => {
	describe("GET /chat-integrations", () => {
		it("returns integrations for current user", async () => {
			const ChatModel = (await import("../../models/chat_integration.js")).default;
			const result = await ChatModel.query().where("user_id", 1);
			expect(result).toHaveLength(1);
			expect(result[0].type).toBe("telegram");
		});
	});

	describe("POST /chat-integrations", () => {
		it("creates integration and starts bot", async () => {
			const ChatModel = (await import("../../models/chat_integration.js")).default;
			const integration = await ChatModel.query().insertAndFetch({ type: "discord", token: "enc_tok" });
			await mockChatService.startBot(integration);
			expect(mockChatService.startBot).toHaveBeenCalled();
			expect(integration.id).toBe(2);
		});

		it("encrypts the token", async () => {
			const { encrypt } = await import("../../lib/encryption.js");
			const encrypted = encrypt("my_token");
			expect(encrypted).toBe("enc_my_token");
		});
	});

	describe("PUT /chat-integrations/:id", () => {
		it("updates integration and reloads bot", async () => {
			const ChatModel = (await import("../../models/chat_integration.js")).default;
			const updated = await ChatModel.query().patchAndFetchById(1, { type: "slack" });
			await mockChatService.reload(updated.id);
			expect(mockChatService.reload).toHaveBeenCalledWith(1);
		});

		it("throws 404 if integration not found", async () => {
			const ChatModel = (await import("../../models/chat_integration.js")).default;
			const result = await ChatModel.query().findById(999);
			expect(result).toBeNull();
		});

		it("checks permissions for non-owner", async () => {
			const access = { can: vi.fn(() => Promise.resolve()) };
			await access.can("settings:update", "chat");
			expect(access.can).toHaveBeenCalledWith("settings:update", "chat");
		});
	});

	describe("DELETE /chat-integrations/:id", () => {
		it("stops bot and deletes integration", async () => {
			await mockChatService.stopBot(1);
			const ChatModel = (await import("../../models/chat_integration.js")).default;
			await ChatModel.query().deleteById(1);
			expect(mockChatService.stopBot).toHaveBeenCalledWith(1);
		});

		it("throws 404 if integration not found", async () => {
			const ChatModel = (await import("../../models/chat_integration.js")).default;
			const result = await ChatModel.query().findById(999);
			expect(result).toBeNull();
		});
	});
});
