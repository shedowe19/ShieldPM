import fs from "node:fs";
import { describe, expect, it } from "vitest";
import { backendSourcePath } from "../helpers/source-path.js";

const startScript = fs.readFileSync(backendSourcePath("..", "rootfs", "usr", "local", "bin", "start.sh"), "utf8");
const maintenanceCommand = fs.readFileSync(
	backendSourcePath("..", "rootfs", "usr", "local", "bin", "shieldpm-vacuum"),
	"utf8",
);

describe("SQLite maintenance lifecycle", () => {
	it("does not block every container startup with a full VACUUM", () => {
		expect(startScript).not.toContain("sqlite-vaccum.js");
	});

	it("keeps full VACUUM available as an explicit operator command", () => {
		expect(maintenanceCommand).toContain("sqlite-vaccum.js");
		expect(maintenanceCommand).toContain("DATA_PATH");
	});
});
