import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const state = vi.hoisted(() => ({ rows: new Map(), children: [], deleteGate: null, deleting: false, handlers: {} }));
vi.mock("express", () => ({
	default: {
		Router: () => {
			const router = { use: () => router };
			for (const method of ["get", "post", "put", "delete"])
				router[method] = (path, handler) => {
					state.handlers[`${method}:${path}`] = handler;
					return router;
				};
			return router;
		},
	},
}));
vi.mock("../../internal/audit-log.js", () => ({ default: { add: vi.fn() } }));
vi.mock("../../lib/express/jwt-decode.js", () => ({ default: () => () => {} }));
vi.mock("../../lib/validator/api.js", () => ({ default: vi.fn() }));
vi.mock("../../schema/index.js", () => ({ getValidationSchema: vi.fn() }));
vi.mock("objection", () => ({
	transaction: { start: async () => ({ commit: async () => {}, rollback: async () => {} }) },
}));
vi.mock("node:child_process", () => ({
	spawn: vi.fn(() => {
		const child = Object.assign(new EventEmitter(), {
			stdout: new EventEmitter(),
			stderr: new EventEmitter(),
			kill: vi.fn(),
		});
		state.children.push(child);
		return child;
	}),
}));
vi.mock("../../logger.js", () => ({ global: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } }));
vi.mock("../../models/cloudflared_tunnel.js", () => ({
	default: {
		knex: () => ({}),
		query: () => {
			let id;
			const filters = [];
			const row = () => {
				const value = state.rows.get(Number(id));
				return value && filters.every(([key, expected]) => value[key] === expected) ? value : undefined;
			};
			const query = {
				findById: (value) => {
					id = value;
					return query;
				},
				where: (key, value) => {
					if (key === "id") {
						id = value;
						return query;
					}
					filters.push([key, value]);
					return query;
				},
				andWhere: (key, value) => query.where(key, value),
				first: async () => row(),
				patch: async (data) => {
					if (row()) Object.assign(row(), data);
				},
				// biome-ignore lint/suspicious/noThenProperty: Objection queries are thenable.
				then: (resolve, reject) => Promise.resolve(row()).then(resolve, reject),
			};
			return query;
		},
	},
}));

import { spawn } from "node:child_process";
import cloudflared from "../../internal/cloudflared.js";
import "../../routes/nginx/cloudflared.js";

const tunnel = (id) => {
	const row = { id, name: "tunnel", token: "original-token", meta: {}, is_deleted: 0 };
	row.$query = () => ({
		patch: async (data) => Object.assign(row, data),
		delete: async () => {
			state.deleting = true;
			if (state.deleteGate) await state.deleteGate;
			state.rows.delete(id);
		},
	});
	state.rows.set(id, row);
	return row;
};

describe("Cloudflared queued deletion and configuration snapshots", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		state.rows.clear();
		state.children.length = 0;
		state.deleteGate = null;
		state.deleting = false;
	});
	afterEach(async () => {
		for (const id of [301, 302, 303]) await cloudflared.stop(id);
		vi.useRealTimers();
	});

	it.each(["removed", "soft-deleted"])("does not restart a %s tunnel from a stale snapshot", async (kind) => {
		const row = tunnel(301);
		const snapshot = { ...row };
		if (kind === "removed") state.rows.delete(row.id);
		else row.is_deleted = 1;
		const pending = cloudflared.restart(snapshot);
		await vi.advanceTimersByTimeAsync(4000);
		await pending;
		expect(spawn.mock.calls.length).toBe(0);
	});

	it("reloads rotated credentials after an older start releases the queue", async () => {
		const row = tunnel(302);
		const first = cloudflared.start(row);
		await vi.advanceTimersByTimeAsync(1);
		const restart = cloudflared.restart({ ...row });
		row.token = "rotated-token";
		await vi.advanceTimersByTimeAsync(6000);
		await Promise.all([first, restart]);
		expect(spawn.mock.calls.at(-1)[2].env.TUNNEL_TOKEN).toBe("rotated-token");
	});

	it("holds the lifecycle queue until deletion commits, then rejects a queued restart", async () => {
		const row = tunnel(303);
		const start = cloudflared.start(row);
		await vi.advanceTimersByTimeAsync(2000);
		await start;
		let finishDelete;
		state.deleteGate = new Promise((resolve) => {
			finishDelete = resolve;
		});
		const response = {
			locals: { access: { can: async () => ({ permission_visibility: "all" }) } },
			status: vi.fn().mockReturnThis(),
			send: vi.fn(),
		};
		const next = vi.fn();
		const deletion = state.handlers["delete:/:id"]({ params: { id: String(row.id) } }, response, next);
		await vi.advanceTimersByTimeAsync(1);
		expect(state.deleting).toBe(true);
		const restart = cloudflared.restart({ ...row });
		await vi.advanceTimersByTimeAsync(4000);
		const startsBeforeDeletion = spawn.mock.calls.length;
		finishDelete();
		await deletion;
		await vi.advanceTimersByTimeAsync(4000);
		await restart;
		expect(startsBeforeDeletion).toBe(1);
		expect(spawn.mock.calls.length).toBe(1);
		expect(state.children[0].kill).toHaveBeenCalledWith("SIGTERM");
		expect(state.rows.has(row.id)).toBe(false);
		expect(next).not.toHaveBeenCalled();
		expect(response.status).toHaveBeenCalledWith(200);
	});
});
