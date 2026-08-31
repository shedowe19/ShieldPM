import crypto from "node:crypto";
import { beforeEach, describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({
	accessList: null,
	certificate: null,
	host: null,
}));

vi.mock("ssh2", () => ({ Client: class Client {} }));
vi.mock("../../lib/encryption.js", () => ({ decrypt: (value) => value }));
vi.mock("../../logger.js", () => ({ internal: { debug: vi.fn() }, debug: vi.fn() }));
vi.mock("../../models/access_list.js", () => ({
	default: {
		query: () => ({
			findById: () => ({
				where: () => ({ withGraphFetched: async () => mocks.accessList }),
			}),
		}),
	},
}));
vi.mock("../../models/certificate.js", () => ({
	default: {
		query: () => ({ findById: () => ({ where: async () => mocks.certificate }) }),
	},
}));
vi.mock("../../models/proxy_host.js", () => ({
	default: {
		query: () => ({
			findById: () => ({
				where: () => ({
					where: () => ({ withGraphFetched: async () => mocks.host }),
				}),
			}),
		}),
	},
}));

import internalTerminal, { __test } from "../../internal/terminal.js";

const fingerprint = "f".repeat(43);
const gatewaySecret = "gateway-secret";

const accessList = (overrides = {}) => ({
	id: 9,
	is_deleted: false,
	items: [{ username: "operator" }],
	clients: [],
	meta: {},
	revision: 4,
	satisfy_any: false,
	...overrides,
});

const terminalHost = (overrides = {}) => ({
	id: 7,
	access_list_id: 9,
	access_list: accessList(),
	certificate_id: 2,
	certificate: { id: 2 },
	domain_names: ["terminal.example.com"],
	enabled: true,
	forward_scheme: "terminal",
	is_deleted: false,
	ssl_forced: true,
	terminal_auth_type: "password",
	terminal_gateway_secret: gatewaySecret,
	terminal_host: "192.0.2.10",
	terminal_host_key_fingerprint: `SHA256:${"A".repeat(43)}`,
	terminal_password: "encrypted-password",
	terminal_port: 22,
	terminal_username: "operator",
	...overrides,
});

const signedHeaders = (host, overrides = {}) => {
	const timestamp = Math.floor(Date.now() / 1000);
	const authority = "terminal.example.com";
	const aclRevision = host.access_list.revision;
	const signature = crypto
		.createHmac("sha1", gatewaySecret)
		.update(
			__test.gatewayPayload({
				timestamp,
				hostId: host.id,
				authority,
				clientFingerprint: fingerprint,
				aclRevision,
			}),
		)
		.digest("base64");
	return {
		authorization: `Bearer ${signature}`,
		"x-shieldpm-terminal-acl-revision": String(aclRevision),
		"x-shieldpm-terminal-authority": authority,
		"x-shieldpm-terminal-host-id": String(host.id),
		"x-shieldpm-terminal-signature": signature,
		"x-shieldpm-terminal-timestamp": String(timestamp),
		...overrides,
	};
};

describe("terminal gateway security", () => {
	beforeEach(() => {
		mocks.accessList = accessList();
		mocks.certificate = { id: 2 };
		mocks.host = terminalHost();
	});

	it("accepts only a fresh assertion bound to host, authority, fingerprint, and ACL revision", () => {
		const host = terminalHost();
		expect(__test.verifyGatewayRequest(signedHeaders(host), host, fingerprint)).toEqual({
			authority: "terminal.example.com",
			aclRevision: 4,
		});

		expect(() =>
			__test.verifyGatewayRequest(
				signedHeaders(host, { "x-shieldpm-terminal-acl-revision": "3" }),
				host,
				fingerprint,
			),
		).toThrow("Invalid terminal gateway assertion");
	});

	it.each(["user@terminal.example.com", "terminal.example.com/path", "terminal.example.com?x=1"])(
		"rejects a malformed authority before HMAC comparison: %s",
		(authority) => {
			const host = terminalHost();
			expect(() =>
				__test.verifyGatewayRequest(
					signedHeaders(host, { "x-shieldpm-terminal-authority": authority }),
					host,
					fingerprint,
				),
			).toThrow("Invalid terminal authority");
		},
	);

	it("issues opaque one-use tickets and consumes them even when a binding check fails", async () => {
		const host = terminalHost();
		mocks.host = host;
		const issued = await internalTerminal.issueTicket(host.id, signedHeaders(host), fingerprint);
		expect(issued).toEqual({
			ticket: expect.stringMatching(/^[A-Za-z0-9_-]{43}$/),
			expiresIn: 30,
			protocol: "shieldpm-terminal",
		});

		expect(() =>
			__test.consumeTicket({
				token: issued.ticket,
				hostId: host.id,
				authority: "wrong.example.com",
				clientFingerprint: fingerprint,
				aclRevision: 4,
			}),
		).toThrow("invalid or expired");
		expect(() =>
			__test.consumeTicket({
				token: issued.ticket,
				hostId: host.id,
				authority: "terminal.example.com",
				clientFingerprint: fingerprint,
				aclRevision: 4,
			}),
		).toThrow("invalid or expired");
	});

	it("rejects cookie-only ticket requests without an explicit gateway bearer", async () => {
		const host = terminalHost();
		mocks.host = host;
		const headers = signedHeaders(host);
		delete headers.authorization;
		headers.cookie = "token=management-cookie";

		await expect(internalTerminal.issueTicket(host.id, headers, fingerprint)).rejects.toThrow(
			"Terminal tickets require explicit gateway bearer authentication",
		);
	});

	it("requires an ACL that cannot bypass authentication through client rules", () => {
		expect(__test.hasAuthenticatedAccessList(accessList())).toBe(true);
		expect(
			__test.hasAuthenticatedAccessList(
				accessList({ clients: [{ directive: "allow", address: "192.0.2.1" }], satisfy_any: true }),
			),
		).toBe(false);
		expect(__test.hasAuthenticatedAccessList(accessList({ items: [], meta: { auth_type: "oauth2_proxy" } }))).toBe(
			true,
		);
	});

	it("validates TLS, ACL, SSH pin, bounds, and credential requirements before storing a terminal host", async () => {
		const data = terminalHost({ access_list: undefined, certificate: undefined });
		await expect(internalTerminal.validateHostConfiguration(data)).resolves.toBeUndefined();
		await expect(internalTerminal.validateHostConfiguration({ ...data, ssl_forced: false })).rejects.toThrow(
			"Force SSL",
		);
		await expect(internalTerminal.validateHostConfiguration({ ...data, terminal_port: 70000 })).rejects.toThrow(
			"1 to 65535",
		);
		await expect(
			internalTerminal.validateHostConfiguration({ ...data, terminal_host_key_fingerprint: "untrusted" }),
		).rejects.toThrow("host-key fingerprint");
	});

	it("parses only the fixed application protocol plus well-formed ticket bindings", () => {
		const ticket = "t".repeat(43);
		expect(__test.parseProtocols(`shieldpm-terminal, ticket.${ticket}, fingerprint.${fingerprint}`)).toEqual({
			ticket,
			clientFingerprint: fingerprint,
		});
		expect(__test.parseProtocols(`ticket.${ticket}, fingerprint.${fingerprint}`)).toBeNull();
	});
});
