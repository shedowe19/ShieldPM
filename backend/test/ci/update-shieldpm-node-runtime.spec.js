import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const nodePackageVersionVariable = "$" + "{NODE_PACKAGE_VERSION}";
const updater = fs.readFileSync(backendSourcePath("..", "rootfs", "usr", "local", "bin", "update-shieldpm"), "utf8");
const nativeInstaller = fs.readFileSync(backendSourcePath("..", "scripts", "install.sh"), "utf8");

describe("update-shieldpm Node 26 runtime contract", () => {
	it("replaces an existing NodeSource major source with Node 26 before installing Node.js", () => {
		expect(updater).toContain("NODE_MAJOR=26");
		expect(updater).toContain("https://deb.nodesource.com/node_%s.x nodistro main");
		expect(updater).toContain("deb[.]nodesource[.]com/node_[0-9]+[.]x");
		expect(updater).toContain("apt-cache madison nodejs");
		expect(updater).toContain(`"nodejs=\${NODE_PACKAGE_VERSION}"`);
	});

	it("uses the signed NodeSource repository instead of Debian npm packages", () => {
		expect(updater).toContain("https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key");
		expect(updater).toContain("gpg --dearmor");
		expect(updater).not.toContain("apt-get install -y npm");
	});

	it("also configures NodeSource Node 26 for fresh native installations", () => {
		expect(nativeInstaller).toContain("NODE_MAJOR=26");
		expect(nativeInstaller).toContain("https://deb.nodesource.com/gpgkey/nodesource-repo.gpg.key");
		expect(nativeInstaller).toContain(`"nodejs=${nodePackageVersionVariable}"`);
	});

	it("uses Node's system CA store for the Yarn bootstrap without weakening TLS", () => {
		for (const script of [updater, nativeInstaller]) {
			expect(script).toContain("enable_node_system_ca()");
			expect(script).toMatch(/install_node_26\(\) \{[\s\S]*enable_node_system_ca/);
			expect(script).toMatch(/export NODE_OPTIONS=.*--use-system-ca/);
			expect(script).not.toContain("NODE_TLS_REJECT_UNAUTHORIZED=0");
			expect(script).not.toContain("strict-ssl=false");
		}
	});

	it("removes only stale Corepack shims before the npm Yarn fallback", () => {
		for (const script of [updater, nativeInstaller]) {
			expect(script).toContain("remove_stale_corepack_shims()");
			expect(script).toContain("*corepack/dist/*");
			expect(script).toContain('rm -f "$shim"');
			expect(script).toContain('[ -x "$COREPACK_BIN" ]');
			expect(script).toMatch(/else[\s\S]*remove_stale_corepack_shims[\s\S]*npm install --global yarn@1\.22\.22/);
		}
	});

	it("pins Yarn Classic through Corepack when available and npm otherwise", () => {
		expect(updater).toContain("command -v corepack");
		expect(updater).toContain("npm install --global yarn@1.22.22");
		expect(nativeInstaller).toContain("npm install --global yarn@1.22.22");
		expect(updater).toContain('[[ ! "$NODE_VERSION" =~ ^v26\\. ]]');
		expect(updater).toContain("yarn --version");
	});

	it("rebuilds existing installations exactly from committed lockfiles", () => {
		expect(updater).toContain("yarn install --frozen-lockfile --production --silent");
		expect(updater).toContain("yarn install --frozen-lockfile --silent");
		expect(updater).toContain("find \"$BACKEND_DIR\" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +");
		expect(updater).toContain('cp -a "$TEMP_DIR/backend/." "$BACKEND_DIR/"');
		expect(updater).toContain("find \"$FRONTEND_DIR\" -mindepth 1 -maxdepth 1 -exec rm -rf -- {} +");
		expect(updater).toContain('cp -a "$TEMP_DIR/frontend/dist/." "$FRONTEND_DIR/"');
	});

	it("updates optional runtime binaries and waits for migrations to become healthy", () => {
		expect(updater).toContain('ANUBIS_VERSION="1.27.0"');
		expect(updater).toContain('OAUTH2_VERSION="7.15.3"');
		expect(updater).toContain("wait_for_backend_health()");
		expect(updater).toContain("--unix-socket /run/shieldpm.sock");
		expect(updater).toContain(".status == \"OK\"");
		expect(updater).toContain("systemctl restart shieldpm");
		expect(updater).toContain("local max_attempts=120");
		expect(updater).toContain("jq");
		expect(updater).toContain("journalctl --no-pager -u shieldpm -n 100");
		expect(nativeInstaller).toContain('VERSION="1.27.0"');
		expect(nativeInstaller).toContain('OAUTH2_VERSION="7.15.3"');
		expect(nativeInstaller).not.toContain("SHOULD_UPDATE_OAUTH2");
	});
});
