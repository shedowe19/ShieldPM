import fs from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { InstanceBackup } from "../../lib/instance-backup.js";

describe("instance backup filesystem containment", () => {
	let directory;
	let data;
	let engine;
	beforeEach(async () => {
		directory = await fs.mkdtemp(path.join(os.tmpdir(), "shieldpm-backup-containment-"));
		data = path.join(directory, "instance");
		await fs.mkdir(data, { mode: 0o700 });
		engine = new InstanceBackup({ directory: data, config: { engine: "knex-native" } });
		await engine.initialize();
	});
	afterEach(async () => {
		vi.unstubAllEnvs();
		await fs.rm(directory, { recursive: true, force: true });
	});

	it("rejects a chained link whose dot-dot escapes despite a lexically internal target", async () => {
		const outside = path.join(directory, "outside");
		await fs.writeFile(outside, "external fixture remains untouched");
		await fs.symlink(".", path.join(data, "d"));
		await fs.symlink("d/../outside", path.join(data, "a"));
		expect(await fs.realpath(path.join(data, "a"))).toBe(outside);
		await expect(engine.copyData(path.join(directory, "snapshot"))).rejects.toThrow(/link|escape/i);
		await expect(engine.describeData(data)).rejects.toThrow(/link|escape/i);
		expect(await fs.readFile(outside, "utf8")).toBe("external fixture remains untouched");
	});

	it("rejects link cycles during capture and activation description", async () => {
		await fs.symlink("b", path.join(data, "a"));
		await fs.symlink("a", path.join(data, "b"));
		await expect(engine.copyData(path.join(directory, "snapshot"))).rejects.toThrow(/link|cycle|hop/i);
		await expect(engine.describeData(data)).rejects.toThrow(/link|cycle|hop/i);
	});

	it("retains working Certbot links, safe chains and internal dangling links", async () => {
		const archive = "tls/certbot/archive/npm-1";
		const live = "tls/certbot/live/npm-1";
		await fs.mkdir(path.join(data, archive), { recursive: true });
		await fs.mkdir(path.join(data, live), { recursive: true });
		await fs.writeFile(path.join(data, archive, "fullchain1.pem"), "synthetic-certificate");
		await fs.symlink("../../archive/npm-1/fullchain1.pem", path.join(data, live, "fullchain.pem"));
		await fs.symlink(live, path.join(data, "certificate-alias"));
		await fs.symlink("missing/future-file", path.join(data, "safe-dangling"));
		const snapshot = path.join(directory, "snapshot");
		const entries = await engine.copyData(snapshot);
		expect(entries.filter((entry) => entry.type === "symlink")).toHaveLength(3);
		expect(await fs.readlink(path.join(snapshot, live, "fullchain.pem"))).toBe(
			"../../archive/npm-1/fullchain1.pem",
		);
		expect(await fs.readFile(path.join(snapshot, "certificate-alias/fullchain.pem"), "utf8")).toBe(
			"synthetic-certificate",
		);
		expect(await fs.readlink(path.join(snapshot, "safe-dangling"))).toBe("missing/future-file");
		expect((await engine.describeData(snapshot)).filter((entry) => entry.type === "symlink")).toHaveLength(3);
	});

	const prepareNginx = async () => {
		const work = path.join(directory, "restore");
		const staged = path.join(work, "data");
		const master = path.join(work, "master");
		for (const target of ["logs", "nginx", "custom_nginx"])
			await fs.mkdir(path.join(staged, target), { recursive: true });
		await fs.mkdir(path.join(data, "logs"));
		await fs.mkdir(master, { recursive: true });
		await fs.writeFile(
			path.join(master, "nginx.conf"),
			"user root;\nerror_log stderr;\nevents {}\nhttp { include /data/nginx/*.conf; }\n",
		);
		vi.stubEnv("NGINX_CONF_DIRECTORY", master);
		return { work, staged, master, liveLog: path.join(data, "logs/preflight-live.log") };
	};

	it.skipIf(!process.env.NGINX_BIN)(
		"keeps a relative included configuration link inside the validation copy during real nginx -t",
		async () => {
			const { work, staged, liveLog } = await prepareNginx();
			const source = `server { listen 127.0.0.1:48891; access_log ${liveLog}; location / { return 200; } }\n`;
			await fs.writeFile(path.join(staged, "custom_nginx/linked.conf"), source);
			await fs.symlink("../custom_nginx/linked.conf", path.join(staged, "nginx/linked.conf"));
			await engine.nginxCheck(staged, work);
			expect(await fs.readlink(path.join(work, "validation-data/nginx/linked.conf"))).toBe(
				"../custom_nginx/linked.conf",
			);
			expect(await fs.readFile(path.join(staged, "custom_nginx/linked.conf"), "utf8")).toBe(source);
			await expect(fs.stat(liveLog)).rejects.toMatchObject({ code: "ENOENT" });
		},
	);

	it.skipIf(!process.env.NGINX_BIN)(
		"rewrites included .inc files before real nginx -t without opening a live log",
		async () => {
			const { work, staged, liveLog } = await prepareNginx();
			const include = `access_log ${liveLog};\n`;
			const server =
				"server { listen 127.0.0.1:48892; include /data/custom_nginx/extra.inc; location / { return 200; } }\n";
			await fs.writeFile(path.join(staged, "nginx/host.conf"), server);
			await fs.writeFile(path.join(staged, "custom_nginx/extra.inc"), include);
			await engine.nginxCheck(staged, work);
			expect(await fs.readFile(path.join(staged, "custom_nginx/extra.inc"), "utf8")).toBe(include);
			expect(await fs.readFile(path.join(staged, "nginx/host.conf"), "utf8")).toBe(server);
			await expect(fs.stat(liveLog)).rejects.toMatchObject({ code: "ENOENT" });
		},
	);

	it("rejects global configuration links outside the copied tree before starting Nginx", async () => {
		const { work, staged, master } = await prepareNginx();
		const outside = path.join(directory, "external-master.inc");
		await fs.writeFile(outside, "# fixture owned by another configuration tree\n");
		await fs.symlink(outside, path.join(master, "external.inc"));
		const command = vi.fn().mockResolvedValue("");
		engine.command = command;
		await expect(engine.nginxCheck(staged, work)).rejects.toThrow(/link|escape/i);
		expect(command).not.toHaveBeenCalled();
		expect(await fs.readFile(outside, "utf8")).toBe("# fixture owned by another configuration tree\n");
	});
});
