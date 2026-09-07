import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ spawn: vi.fn(), patch: vi.fn() }));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn }));
vi.mock("../../logger.js", () => ({ global: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } }));
vi.mock("../../models/cloudflared_tunnel.js", () => ({
	default: { query: () => ({ findById: () => ({ patch: mocks.patch }) }) },
}));

import cloudflared from "../../internal/cloudflared.js";

const child = () =>
	Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter(), kill: vi.fn() });
const tunnel = (id) => ({ id, name: "test", token: "test-token", meta: {}, $query: () => ({ patch: mocks.patch }) });
describe("Cloudflared child lifecycle", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		mocks.patch.mockResolvedValue();
	});
	afterEach(() => vi.useRealTimers());
	it("handles missing executables without an unhandled error event", async () => {
		const process = child();
		mocks.spawn.mockReturnValue(process);
		const started = cloudflared.start(tunnel(11));
		await vi.advanceTimersByTimeAsync(1);
		process.emit("error", new Error("spawn ENOENT"));
		await vi.advanceTimersByTimeAsync(2000);
		await started;
		expect(mocks.patch).toHaveBeenCalledWith(
			expect.objectContaining({ status: 3, meta: { last_error: "spawn ENOENT" } }),
		);
		expect(mocks.patch).not.toHaveBeenCalledWith(expect.objectContaining({ status: 2 }));
	});
	it("an old process exit cannot erase or stop its replacement", async () => {
		const old = child();
		const replacement = child();
		mocks.spawn.mockReturnValueOnce(old).mockReturnValueOnce(replacement);
		const initial = cloudflared.start(tunnel(12));
		await vi.advanceTimersByTimeAsync(2000);
		await initial;
		const restarted = cloudflared.start(tunnel(12));
		await vi.advanceTimersByTimeAsync(1);
		old.emit("exit", 0, "SIGTERM");
		await vi.advanceTimersByTimeAsync(2000);
		await restarted;
		await cloudflared.stop(12);
		expect(replacement.kill).toHaveBeenCalledWith("SIGTERM");
	});
	it("serializes simultaneous starts so the first child cannot become untracked", async () => {
		const first = child();
		const second = child();
		mocks.spawn.mockReturnValueOnce(first).mockReturnValueOnce(second);
		const pending = [cloudflared.start(tunnel(13)), cloudflared.start(tunnel(13))];
		await vi.advanceTimersByTimeAsync(4001);
		await Promise.all(pending);
		expect(first.kill).toHaveBeenCalledWith("SIGTERM");
		await cloudflared.stop(13);
		expect(second.kill).toHaveBeenCalledWith("SIGTERM");
	});
});
