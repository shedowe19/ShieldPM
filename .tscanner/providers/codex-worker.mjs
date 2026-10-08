import { executeCodexReview } from "./codex.mjs";

const controller = new AbortController();
let started = false;

// The native scanner cancels providers with SIGKILL. IPC closes automatically even without parent signal handlers.
process.once("disconnect", () => {
	controller.abort();
	if (!started) process.exitCode = 1;
});
if (!process.connected) controller.abort();

process.on("message", async (message) => {
	if (message?.type === "cancel") {
		controller.abort();
		return;
	}
	if (message?.type !== "review" || started) return;
	started = true;
	if (!process.connected) controller.abort();
	let response;
	try {
		const report = await executeCodexReview(message.prompt, {
			...message.options,
			env: process.env,
			signal: controller.signal,
		});
		response = { ok: true, report };
	} catch (error) {
		response = { ok: false, reason: typeof error?.reason === "string" ? error.reason : "provider" };
		process.exitCode = 1;
	}
	if (process.connected) {
		process.send(response, () => {
			if (process.connected) process.disconnect();
		});
	}
});
