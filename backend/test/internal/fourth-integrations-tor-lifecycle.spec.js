import { EventEmitter } from "node:events";
import { beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ record: null, commands: [], creations: [], stopResponse: "250 OK\r\n" }));
vi.mock("node:fs", () => ({ default: { existsSync: () => true, promises: { readFile: async () => "password" } } }));
vi.mock("node:net", () => ({
	createConnection: (_port, _host, connected) => {
		const socket = new EventEmitter();
		socket.setTimeout = () => {};
		socket.destroy = () => {};
		socket.end = () => queueMicrotask(() => socket.emit("end"));
		socket.write = (command) => {
			if (command.startsWith("AUTHENTICATE")) {
				queueMicrotask(() => socket.emit("data", "250 OK\r\n"));
			} else {
				state.commands.push(command.trim());
				if (command.startsWith("ADD_ONION")) {
					const identity = String.fromCharCode(97 + state.creations.length).repeat(56);
					state.creations.push(() =>
						socket.emit("data", `250-ServiceID=${identity}\r\n250-PrivateKey=ED25519-V3:key\r\n250 OK\r\n`),
					);
				} else queueMicrotask(() => socket.emit("data", state.stopResponse));
			}
		};
		queueMicrotask(connected);
		return socket;
	},
}));
vi.mock("../../models/tor_onion.js", () => ({
	default: {
		query: () => {
			const query = {
				findById: () => query,
				where: () => query,
				// biome-ignore lint/suspicious/noThenProperty: Objection queries are thenable.
				then: (resolve, reject) =>
					Promise.resolve(state.record && !state.record.is_deleted ? snapshot() : undefined).then(
						resolve,
						reject,
					),
			};
			return query;
		},
	},
}));
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));
vi.mock("../../internal/gitops.js", () => ({ default: {} }));
vi.mock("../../internal/nginx.js", () => ({ default: { withConfigurationLock: (operation) => operation() } }));
vi.mock("../../internal/anubis.js", () => ({ default: {} }));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: {} }));
vi.mock("../../logger.js", () => ({ global: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() } }));

import tor from "../../internal/tor.js";

function snapshot() {
	return {
		...state.record,
		$query: () => ({
			patch: async (data) => {
				if (state.record) Object.assign(state.record, data);
			},
			delete: async () => {
				state.record = null;
			},
		}),
	};
}

describe("Tor service lifecycle ordering", () => {
	beforeEach(() => {
		state.record = { id: 7, name: "service", virtual_port: 80, target_port: 8080, status: 0, is_deleted: 0 };
		state.commands = [];
		state.creations = [];
		state.stopResponse = "250 OK\r\n";
	});

	it("keeps one onion identity when first-use create requests overlap", async () => {
		const pending = [tor.create(snapshot()), tor.create(snapshot())];
		await vi.waitFor(() => expect(state.creations.length).toBeGreaterThan(0));
		for (const complete of state.creations) complete();
		const results = await Promise.all(pending);
		expect(state.commands.filter((command) => command.startsWith("ADD_ONION NEW"))).toHaveLength(1);
		expect(results[0]).toEqual(results[1]);
		expect(state.record.onion_address).toBe(results[0].onionAddress);
	});

	it("stops the newly created detached identity before deleting its database record", async () => {
		const creation = tor.create(snapshot());
		await vi.waitFor(() => expect(state.creations).toHaveLength(1));
		const deletion = tor.delete(7);
		await Promise.resolve();
		state.creations[0]();
		await Promise.all([creation, deletion]);
		expect(state.commands).toEqual([
			"ADD_ONION NEW:ED25519-V3 Flags=Detach Port=80,127.0.0.1:8080",
			`DEL_ONION ${"a".repeat(56)}`,
		]);
		expect(state.record).toBeNull();
	});

	it.each([false, true])("prevents stale requests from recreating a service after soft=%s deletion", async (soft) => {
		const stale = snapshot();
		await tor.delete(7, { soft });
		expect(await tor.create(stale)).toBeNull();
		expect(await tor.start(stale)).toBe(false);
		expect(await tor.restart(stale)).toBe(false);
		expect(state.commands).toEqual([]);
	});

	it("retains the record after a stop failure and permits deletion to be retried", async () => {
		state.record.onion_address = `${"a".repeat(56)}.onion`;
		state.stopResponse = "550 Internal error\r\n";
		await expect(tor.delete(7)).rejects.toThrow("Unable to stop onion service");
		expect(state.record).toMatchObject({ id: 7, status: 3 });
		state.stopResponse = "250 OK\r\n";
		expect(await tor.delete(7)).toBe(true);
		expect(state.record).toBeNull();
	});
});
