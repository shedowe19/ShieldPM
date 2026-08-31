import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const updater = fs.readFileSync(backendSourcePath("..", "rootfs", "usr", "local", "bin", "update-shieldpm"), "utf8");
const installer = fs.readFileSync(backendSourcePath("..", "scripts", "install.sh"), "utf8");

describe("transactional native update contract", () => {
	it("uses the pinned Node 24, Corepack 0.36.0 and Yarn 4.18.0 toolchain", () => {
		for (const script of [updater, installer]) {
			expect(script).toMatch(/\^v24\\\./);
			expect(script).toContain("0.36.0");
			expect(script).toContain("4.18.0");
			expect(script).not.toContain("apt-get upgrade");
			expect(script).not.toContain("apt-get dist-upgrade");
			expect(script).not.toContain("yarn@1.22.22");
		}
		expect(installer).toContain("npm install --global --ignore-scripts corepack@0.36.0");
		expect(installer).toContain("corepack install --global yarn@4.18.0");
		expect(updater).not.toContain("npm install --global");
		expect(updater).not.toContain("corepack install --global");
	});

	it("resolves a validated branch to one exact SHA and never self-updates", () => {
		expect(updater).toContain("-b|--branch");
		expect(updater).toContain("refs/heads/$BRANCH");
		expect(updater).toContain("git ls-remote --exit-code --heads");
		expect(updater).toContain('git -C "$WORK_DIR" fetch --quiet --depth=1 origin "$TARGET_SHA"');
		expect(updater).toContain('[ "$(git -C "$WORK_DIR" rev-parse HEAD)" = "$TARGET_SHA" ]');
		expect(updater).not.toContain("SCRIPT_URL");
		expect(updater).not.toContain("SHIELDPM_SELF_UPDATED");
	});

	it("uses immutable installs, same-filesystem swaps and complete rollback assets", () => {
		expect(updater.match(/yarn install --immutable/g)).toHaveLength(2);
		expect(updater).toContain('stat -c %d "$NEW_BACKEND"');
		expect(updater).toContain('mv -T "$NEW_BACKEND" "$BACKEND_DIR"');
		expect(updater).toContain('mv -T "$NEW_FRONTEND" "$FRONTEND_DIR"');
		expect(updater).toContain("create_rootfs_snapshot");
		expect(updater).toContain("restore_rootfs_overlay");
		expect(updater).toContain('--restore "$SQLITE_BACKUP"');
		expect(updater).toContain("for binary in anubis oauth2-proxy");
		expect(updater).toContain("yarn workspaces focus --production");
		expect(updater).toContain('dependenciesMeta["better-sqlite3"].built == true');
	});

	it("requires an explicit external database backup confirmation", () => {
		expect(updater).toContain("--external-db-backup-confirmed");
		expect(updater).toContain("external DB detected");
		expect(updater).toContain("intentionally left STOPPED");
	});

	it("gates success on all native health surfaces for 120 seconds", () => {
		expect(updater).toContain("--unix-socket /run/shieldpm.sock");
		expect(updater).toContain("http://localhost/");
		expect(updater).toContain('.status == "OK"');
		expect(updater).toContain("nginx -tq");
		expect(updater).toContain("http://127.0.0.1:$(frontend_port)/");
		expect(updater).toContain("SECONDS + 120");
	});

	it("requires a checksummed native installer package", () => {
		expect(installer).toContain("sha256sum --check --strict SHA256SUMS");
		expect(installer).toContain("Missing installer prerequisite");
		expect(installer).toContain("setup-node-apt.sh");
		expect(installer).not.toMatch(/curl[^\n]*\|[^\n]*bash/);
		expect(installer).not.toContain("releases/latest");
	});
});
