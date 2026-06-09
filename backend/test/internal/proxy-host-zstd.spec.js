import { describe, expect, it } from "vitest";
import utils from "../../lib/utils.js";

const baseHost = {
	id: 7,
	domain_names: ["vault.example.test"],
	forward_scheme: "http",
	forward_host: "127.0.0.1",
	forward_port: 8000,
	forward_path: null,
	forward_query: null,
	use_default_location: true,
	locations: "",
	advanced_config: "",
	access_list_id: 0,
	access_list: { items: [], clients: [], meta: {} },
	certificate_id: 0,
	certificate: null,
	ssl_forced: false,
	caching_enabled: false,
	block_exploits: false,
	allow_websocket_upgrade: false,
	http2_support: true,
	hsts_enabled: false,
	hsts_subdomains: false,
	maintenance_mode: false,
	maintenance_active: false,
	maintenance_on_failure: false,
	bandwidth_limit: "",
	adv_limit_req_rate: null,
	adv_limit_req_unit: "s",
	adv_limit_req_burst: null,
	disable_buffering: false,
	security_crowdsec: false,
	anubis_enabled: false,
	turbo_loader: false,
	php_enabled: false,
	index_file: "",
	enabled: true,
	env: {},
};

const renderProxyHost = async (overrides = {}) => {
	const renderEngine = utils.getRenderEngine();
	return renderEngine.renderFile("proxy_host.conf", {
		...baseHost,
		...overrides,
	});
};

describe("Proxy host zstd compression toggle", () => {
	it("does not render per-host zstd directives when zstd is enabled", async () => {
		const config = await renderProxyHost({ zstd_enabled: true });

		expect(config).not.toContain("zstd off;");
		expect(config).not.toContain("zstd_static off;");
	});

	it("renders per-host zstd off directives when zstd is disabled", async () => {
		const config = await renderProxyHost({ zstd_enabled: false });

		expect(config).toContain("zstd off;");
		expect(config).toContain("zstd_static off;");
	});
});
