import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, expect, it, vi } from "vitest";
import AiConfigPage from "./Ai";

vi.mock("react-intl", () => ({ useIntl: () => ({ formatMessage: ({ id }: { id: string }) => id }) }));
vi.mock("src/locale", () => ({ T: ({ id }: { id: string }) => id }));
vi.mock("src/notifications", () => ({ showObjectSuccess: vi.fn() }));
const config = {
	enabled: true,
	provider: "local",
	api_key: "test-key",
	base_url: "https://ai.example.test",
	model: "model-a",
	num_ctx: 16384,
	num_batch: 256,
	num_thread: 8,
	keep_alive: "10m",
	system_prompt: "A custom prompt",
};
afterEach(() => {
	cleanup();
	vi.unstubAllGlobals();
});

it("loads and saves every persisted AI setting through the actual API casing conversion", async () => {
	vi.stubGlobal(
		"fetch",
		vi.fn().mockImplementation(() => Promise.resolve(new Response(JSON.stringify(config)))),
	);
	render(<AiConfigPage />);
	expect(await screen.findByLabelText("ai.base_url")).toHaveValue(config.base_url);
	expect(screen.getByLabelText("ai.api_key (Optional)")).toHaveValue(config.api_key);
	expect(screen.getByLabelText("ai.context_window")).toHaveValue(config.num_ctx);
	expect(screen.getByLabelText("ai.batch_size")).toHaveValue(config.num_batch);
	expect(screen.getByLabelText("ai.cpu_threads")).toHaveValue(config.num_thread);
	expect(screen.getByLabelText("ai.keep_alive")).toHaveValue(config.keep_alive);
	expect(screen.getByLabelText("ai.system_prompt")).toHaveValue(config.system_prompt);
	fireEvent.change(screen.getByLabelText("ai.context_window"), { target: { value: "32768" } });
	fireEvent.click(screen.getByRole("button", { name: "save" }));
	await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2));
	expect(JSON.parse(String(vi.mocked(fetch).mock.calls[1][1]?.body))).toEqual({ ...config, num_ctx: 32768 });
});

it("does not allow a failed initial request to overwrite saved settings with defaults", async () => {
	vi.stubGlobal(
		"fetch",
		vi
			.fn()
			.mockResolvedValue(
				new Response(JSON.stringify({ error: { message: "Config unavailable" } }), { status: 503 }),
			),
	);
	render(<AiConfigPage />);
	expect(await screen.findByText("Config unavailable")).toBeInTheDocument();
	expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
});

it("ignores model lists fetched for a provider that is no longer selected", async () => {
	let finishModels: (response: Response) => void = () => undefined;
	const pendingModels = new Promise<Response>((resolve) => {
		finishModels = resolve;
	});
	const fetchMock = vi
		.fn()
		.mockResolvedValueOnce(new Response(JSON.stringify(config)))
		.mockReturnValueOnce(pendingModels);
	vi.stubGlobal("fetch", fetchMock);
	render(<AiConfigPage />);
	await screen.findByLabelText("ai.base_url");
	fireEvent.click(screen.getByRole("button", { name: "ai.fetch_models" }));
	await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2));
	fireEvent.click(screen.getByRole("radio", { name: "Google Gemini" }));
	finishModels(new Response(JSON.stringify([{ id: "stale-local-model", name: "Stale local model" }])));
	await waitFor(() => expect(screen.getByRole("radio", { name: "Google Gemini" })).toBeChecked());
	expect(screen.queryByRole("option", { name: "Stale local model" })).not.toBeInTheDocument();
});
