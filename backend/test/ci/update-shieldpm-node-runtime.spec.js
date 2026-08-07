import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const nodePackageVersionVariable = "$" + "{NODE_PACKAGE_VERSION}";
const updater = fs.readFileSync(backendSourcePath("..", "rootfs", "usr", "local", "bin", "update-shieldpm"), "utf8");
const nativeInstaller = fs.readFileSync(backendSourcePath("..", "scripts", "install.sh"), "utf8");
const dockerWorkflow = fs.readFileSync(backendSourcePath("..", ".github", "workflows", "docker.yml"), "utf8");

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

	it("verifies the NodeSource signing key before trusting the native APT repository", () => {
		for (const script of [updater, nativeInstaller]) {
			expect(script).toContain("install_nodesource_key");
			expect(script).toContain("gpg --show-keys --with-colons");
			expect(script).toContain("6F71F525282841EEDAF851B42F59B5F99B1BE0B4");
			expect(script).toContain("--proto '=https'");
		}
	});

	it("keeps native artifact updates aligned with the verified production releases", () => {
		for (const script of [updater, nativeInstaller]) {
			expect(script).toContain("download_verified()");
			expect(script).toContain("sha256sum --check --status");
			expect(script).toContain('ANUBIS_VERSION="1.26.2"');
			expect(script).toContain('OAUTH2_VERSION="7.15.3"');
			expect(script).toContain("8d1792d69c4a6e360fbfa0657ac252dcbce5639e6441b09252cd8ae1474ea306");
			expect(script).toContain("6caed9d09729b0fa1b4d23a6e55b491d24c81901c105e10ccd95b7e8db3a4620");
			expect(script).toContain("0ae5a43adde4d6c5081ba018e70a76041f496377b12a173da36b419082dd1ab6");
			expect(script).toContain("62452322a71e958d4d6911f799bc07921212a5f3bc45e39b63746e422d52ea33");
			expect(script).not.toContain('ANUBIS_VERSION="1.25.0"');
		}
		expect(nativeInstaller).not.toContain('OAUTH2_VERSION="7.14.2"');
		expect(nativeInstaller).toContain('if [[ "$oauth2_choice" =~ ^[Yy]$ ]]; then');
		expect(updater).toContain("1e2e78e7e2f0be8774e3ae89040cf4b3804f1500bba3eb99aa5e48f4d1b807c8");
		expect(updater).toContain("39956e68ea850bf46a95e03c6bcb1ffee5d20a679a71eae821fe3686fe65b376");
		expect(dockerWorkflow).toContain(
			'NGINX_SHA256="1e2e78e7e2f0be8774e3ae89040cf4b3804f1500bba3eb99aa5e48f4d1b807c8"',
		);
		expect(dockerWorkflow).toContain(
			'NGINX_SHA256="39956e68ea850bf46a95e03c6bcb1ffee5d20a679a71eae821fe3686fe65b376"',
		);
		expect(dockerWorkflow).toContain("sha256sum --check --status");
	});

	it("pins and verifies runtime package remediation artifacts", () => {
		const dockerfile = fs.readFileSync(backendSourcePath("..", "Dockerfile"), "utf8");
		expect(dockerfile).toContain("ARG NPM_VERSION=12.0.2");
		expect(dockerfile).toContain("ARG CRYPTOGRAPHY_VERSION=50.0.0");
		expect(dockerfile).toContain("ARG NPM_BRACE_EXPANSION_VERSION=5.0.9");
		expect(dockerfile).toContain("ARG NPM_IP_ADDRESS_VERSION=10.3.1");
		expect(dockerfile).toContain('tar -xzf "$brace_tarball"');
		expect(dockerfile).toContain('tar -xzf "$ip_address_tarball"');
		expect(dockerfile).toContain("sha512sum -c -");
		expect(dockerfile).toContain("sha256sum -c -");
		expect(dockerfile).toContain("npm install --global --ignore-scripts");
		expect(dockerfile).toContain("python3 -m pip install --no-cache-dir --no-deps");
	});

	it("pins Yarn Classic through Corepack when available and npm otherwise", () => {
		expect(updater).toContain("command -v corepack");
		expect(updater).toContain("npm install --global yarn@1.22.22");
		expect(nativeInstaller).toContain("npm install --global yarn@1.22.22");
		expect(updater).toContain('[[ ! "$NODE_VERSION" =~ ^v26\\. ]]');
		expect(updater).toContain("yarn --version");
	});
});
