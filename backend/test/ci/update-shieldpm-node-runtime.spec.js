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

	it("pins Yarn Classic through Corepack when available and npm otherwise", () => {
		expect(updater).toContain("command -v corepack");
		expect(updater).toContain("npm install --global yarn@1.22.22");
		expect(nativeInstaller).toContain("npm install --global yarn@1.22.22");
		expect(updater).toContain('[[ ! "$NODE_VERSION" =~ ^v26\\. ]]');
		expect(updater).toContain("yarn --version");
	});
});
