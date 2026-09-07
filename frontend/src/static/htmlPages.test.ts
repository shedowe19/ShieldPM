import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { fireEvent } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";

afterEach(() => {
	document.body.innerHTML = "";
	vi.useRealTimers();
});
it("filters directory entries after paste/input events and tolerates a single sorting link", () => {
	document.body.innerHTML =
		'<h1>Directory</h1><table id="list"><thead><tr><th><a href="?sort=asc">Name</a></th></tr></thead><tbody><tr><td>alpha.zip</td></tr><tr><td>beta.zip</td></tr></tbody></table>';
	const html = readFileSync(resolve("../rootfs/html/fancyindex/footer.html"), "utf8");
	new Function(html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || "")();
	const input = document.getElementById("search") as HTMLInputElement;
	fireEvent.input(input, { target: { value: "beta" } });
	const rows = document.querySelectorAll("#list tbody tr");
	expect(rows[0]).not.toBeVisible();
	expect(rows[1]).toBeVisible();
	fireEvent.input(input, { target: { value: "" } });
	expect(rows[0]).toBeVisible();
});
it("stops the maintenance interval after scheduling exactly one reload", async () => {
	vi.useFakeTimers();
	const end = new Date(Date.now() + 1000).toISOString();
	document.body.innerHTML = `<div id="m-data" data-end="${end}"></div><div id="maintenance-timer"></div>`;
	const html = readFileSync(resolve("../rootfs/html/maintenance.html"), "utf8");
	const scripts = [...html.matchAll(/<script>([\s\S]*?)<\/script>/g)];
	const reload = vi.fn();
	new Function("window", scripts[1]?.[1] || "")({ location: { reload } });
	await vi.advanceTimersByTimeAsync(7000);
	expect(reload).toHaveBeenCalledTimes(1);
	expect(vi.getTimerCount()).toBe(0);
});
