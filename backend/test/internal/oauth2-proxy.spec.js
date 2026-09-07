import { EventEmitter } from "node:events";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	spawn: vi.fn(),
	mkdir: vi.fn(),
	writeFile: vi.fn(),
	chmod: vi.fn(),
	hosts: vi.fn(),
}));
vi.mock("node:child_process", () => ({ spawn: mocks.spawn, execFileSync: vi.fn() }));
vi.mock("node:fs", () => ({
	default: { promises: { mkdir: mocks.mkdir, writeFile: mocks.writeFile, chmod: mocks.chmod } },
}));
vi.mock("../../logger.js", () => ({ global: { info: vi.fn(), warn: vi.fn(), debug: vi.fn(), error: vi.fn() } }));
vi.mock("../../models/access_list.js", () => ({ default: {} }));
vi.mock("../../models/proxy_host.js", () => ({
	default: {
		query: () => {
			const query = { where: () => query, withGraphFetched: mocks.hosts };
			return query;
		},
	},
}));

import oauth2 from "../../internal/oauth2-proxy.js";

const makeChild = () => {
	const child = Object.assign(new EventEmitter(), { stdout: new EventEmitter(), stderr: new EventEmitter() });
	child.kill = vi.fn((signal) => {
		queueMicrotask(() => child.emit("exit", null, signal));
		return true;
	});
	return child;
};
const list = (id, meta = {}) => ({
	id,
	meta: {
		oauth2_provider: "oidc",
		oauth2_client_id: "client",
		oauth2_client_secret: "secret",
		oauth2_cookie_secret: "cookie",
		...meta,
	},
});

describe("OAuth2 proxy configuration and process lifecycle", () => {
	beforeEach(() => {
		vi.clearAllMocks();
		vi.useFakeTimers();
		mocks.mkdir.mockResolvedValue(undefined);
		mocks.writeFile.mockResolvedValue(undefined);
		mocks.chmod.mockResolvedValue(undefined);
		mocks.hosts.mockResolvedValue([{ host_domains: [{ domain_name: "app.example.com" }] }]);
	});
	afterEach(async () => {
		for (let id = 501; id <= 510; id++) {
			const stopped = oauth2.stop(id);
			await vi.advanceTimersByTimeAsync(500);
			await stopped;
		}
		vi.useRealTimers();
	});

	it("writes one redirect allowlist from assigned hosts independently of email domains", () => {
		const config = oauth2.generateConfig(
			list(501, { oauth2_allowed_email_domains: "mail.example.com, other.example.com" }),
			["app.example.com", "second.example.com", "app.example.com"],
		);
		expect(config.match(/^whitelist_domains\s*=/gm)).toHaveLength(1);
		expect(config).toContain('whitelist_domains = ["app.example.com", "second.example.com"]');
		expect(config).toContain('email_domains = ["mail.example.com", "other.example.com"]');
		expect(config).not.toContain("$host");
	});

	it("escapes quotes, backslashes and newlines so values cannot inject TOML options", () => {
		const config = oauth2.generateConfig(
			list(501, {
				oauth2_client_secret: 'secret"\nssl_insecure_skip_verify = true\n#\\',
				oauth2_allowed_groups: 'group"\\name,other',
			}),
		);
		expect(config).toContain('client_secret = "secret\\"\\nssl_insecure_skip_verify = true\\n#\\\\"');
		expect(config).not.toMatch(/^ssl_insecure_skip_verify = true$/m);
		expect(config).toContain('allowed_groups = ["group\\"\\\\name", "other"]');
	});

	it("configures an OIDC issuer for Keycloak", () => {
		expect(
			oauth2.generateConfig(
				list(501, {
					oauth2_provider: "keycloak-oidc",
					oauth2_oidc_issuer_url: "https://sso.example.com/realms/test",
				}),
			),
		).toContain('oidc_issuer_url = "https://sso.example.com/realms/test"');
	});

	it("writes private config files and reads redirect domains from host relations", async () => {
		mocks.spawn.mockReturnValue(makeChild());
		await oauth2.start(list(502));
		expect(mocks.writeFile).toHaveBeenCalledWith(
			expect.stringContaining("oauth2-proxy.cfg"),
			expect.stringContaining('whitelist_domains = ["app.example.com"]'),
			{ mode: 0o600 },
		);
		expect(mocks.chmod).toHaveBeenCalledWith(expect.stringContaining("oauth2-proxy.cfg"), 0o600);
	});

	it("does not restart a stopped or deleted access list after a crash", async () => {
		const child = makeChild();
		mocks.spawn.mockReturnValue(child);
		await oauth2.start(list(503));
		child.emit("exit", 1, null);
		await oauth2.stop(503);
		await vi.advanceTimersByTimeAsync(30000);
		expect(mocks.spawn).toHaveBeenCalledTimes(1);
	});

	it("an old process exit cannot erase its replacement", async () => {
		const oldChild = makeChild();
		const replacement = makeChild();
		mocks.spawn.mockReturnValueOnce(oldChild).mockReturnValueOnce(replacement);
		await oauth2.start(list(504));
		const restarted = oauth2.start(list(504));
		await vi.advanceTimersByTimeAsync(500);
		await restarted;
		oldChild.emit("exit", 1, null);
		const stopped = oauth2.stop(504);
		await vi.advanceTimersByTimeAsync(30000);
		await stopped;
		expect(replacement.kill).toHaveBeenCalledWith("SIGTERM");
		expect(mocks.spawn).toHaveBeenCalledTimes(2);
	});

	it("a stop during async preparation prevents a process from spawning", async () => {
		let release;
		mocks.mkdir.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = resolve;
				}),
		);
		const started = oauth2.start(list(505));
		await vi.advanceTimersByTimeAsync(0);
		const stopped = oauth2.stop(505);
		release();
		await started;
		await stopped;
		expect(mocks.spawn).not.toHaveBeenCalled();
	});

	it("serializes competing config writes so obsolete preparation cannot overwrite its replacement", async () => {
		let release;
		mocks.hosts.mockImplementationOnce(
			() =>
				new Promise((resolve) => {
					release = resolve;
				}),
		);
		mocks.spawn.mockReturnValue(makeChild());
		const old = oauth2.start(list(506, { oauth2_client_id: "old-config" }));
		await vi.advanceTimersByTimeAsync(0);
		const replacement = oauth2.start(list(506, { oauth2_client_id: "new-config" }));
		await vi.advanceTimersByTimeAsync(0);
		expect(mocks.spawn).not.toHaveBeenCalled();
		release([]);
		await old;
		await replacement;
		const configs = mocks.writeFile.mock.calls.filter(([path]) => path.endsWith("oauth2-proxy.cfg"));
		expect(configs.at(-1)[1]).toContain('client_id = "new-config"');
		expect(mocks.spawn).toHaveBeenCalledTimes(1);
	});

	it("waits for a terminating process and escalates before starting its replacement", async () => {
		const old = makeChild();
		old.kill.mockImplementation((signal) => {
			if (signal === "SIGKILL") queueMicrotask(() => old.emit("exit", null, signal));
			return true;
		});
		mocks.spawn.mockReturnValueOnce(old).mockReturnValueOnce(makeChild());
		await oauth2.start(list(507));
		const restarted = oauth2.start(list(507));
		await vi.advanceTimersByTimeAsync(4999);
		expect(mocks.spawn).toHaveBeenCalledTimes(1);
		await vi.advanceTimersByTimeAsync(1);
		await restarted;
		expect(old.kill).toHaveBeenCalledWith("SIGKILL");
		expect(mocks.spawn).toHaveBeenCalledTimes(2);
	});
});
