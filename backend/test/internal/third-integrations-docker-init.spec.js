import { afterEach, describe, expect, it, vi } from "vitest";

vi.mock("../../db.js", () => ({ default: () => ({}) }));
vi.mock("../../lib/config.js", () => ({
	isSqlite: () => false,
	isPostgres: () => false,
	getEncryptionKey: () => "0".repeat(64),
}));
vi.mock("../../internal/certificate.js", () => ({ default: {} }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));

import docker from "../../internal/docker.js";

describe("Docker discovery initialization", () => {
	afterEach(() => {
		vi.restoreAllMocks();
		docker.initialized = false;
		docker.clients = [];
	});
	it("shares concurrent initialization and preserves established event watchers on a startup retry", async () => {
		let finishPing;
		const ping = vi.fn(
			() =>
				new Promise((resolve) => {
					finishPing = resolve;
				}),
		);
		vi.spyOn(docker, "addClient").mockImplementation(() => {
			docker.clients.push({ docker: { ping }, name: "test", isConnected: false });
		});
		const sync = vi.spyOn(docker, "sync").mockResolvedValue();
		const watch = vi.spyOn(docker, "watch").mockResolvedValue();
		const first = docker.init();
		const second = docker.init();
		expect(ping).toHaveBeenCalledOnce();
		finishPing();
		await Promise.all([first, second]);
		await docker.init();
		expect(sync).toHaveBeenCalledOnce();
		expect(watch).toHaveBeenCalledOnce();
		expect(docker.clients).toHaveLength(1);
	});
});
