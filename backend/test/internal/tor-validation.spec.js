import { describe, expect, it, vi } from "vitest";

const mocks = vi.hoisted(() => ({ connect: vi.fn() }));
vi.mock("node:net", () => ({ createConnection: mocks.connect }));
vi.mock("../../models/proxy_host.js", () => ({ default: {} }));
vi.mock("../../models/tor_onion.js", () => ({ default: {} }));
vi.mock("../../internal/gitops.js", () => ({ default: {} }));
vi.mock("../../internal/nginx.js", () => ({ default: {} }));
vi.mock("../../internal/anubis.js", () => ({ default: {} }));
vi.mock("../../internal/oauth2-proxy.js", () => ({ default: {} }));
vi.mock("../../logger.js", () => ({ global: { info: vi.fn(), error: vi.fn(), debug: vi.fn(), warn: vi.fn() } }));

import tor from "../../internal/tor.js";

describe("Tor control protocol validation", () => {
	it.each(["80\r\nQUIT", "80garbage", "1.5", -1, 65536])(
		"rejects a partially numeric port %s before opening a control socket",
		async (port) => {
			const patch = vi.fn().mockResolvedValue();
			const result = await tor.create({
				id: 1,
				name: "test",
				virtual_port: port,
				target_port: 80,
				$query: () => ({ patch }),
			});
			expect(result).toBeNull();
			expect(patch).toHaveBeenCalledWith({ status: 3 });
			expect(mocks.connect).not.toHaveBeenCalled();
		},
	);
});
