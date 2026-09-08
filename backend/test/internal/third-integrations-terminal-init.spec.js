import { EventEmitter } from "node:events";
import { describe, expect, it, vi } from "vitest";

vi.mock("../../lib/encryption.js", () => ({ decrypt: (value) => value }));
vi.mock("../../lib/terminal-access.js", () => ({ isValidTerminalAccessToken: () => false }));
vi.mock("../../logger.js", () => ({ internal: {}, debug: vi.fn() }));
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));

import terminal from "../../internal/terminal.js";

describe("terminal startup retries", () => {
	it("keeps exactly one WebSocket upgrade handler and server when initialization repeats", () => {
		const server = new EventEmitter();
		terminal.init(server);
		const wss = terminal.wss;
		terminal.init(server);
		expect(terminal.wss).toBe(wss);
		expect(server.listenerCount("upgrade")).toBe(1);
		wss.close();
	});
});
