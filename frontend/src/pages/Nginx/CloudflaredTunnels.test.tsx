import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { CloudflaredTunnels } from "./CloudflaredTunnels";
import { changeLocale } from "@/locale";

const mocks = vi.hoisted(() => ({
	useHealth: vi.fn(),
	useCloudflaredTunnels: vi.fn(),
}));

vi.mock("@/hooks/useCloudflaredTunnel", () => ({
	useCloudflaredTunnel: () => ({ remove: { mutate: vi.fn() } }),
	useCloudflaredTunnels: mocks.useCloudflaredTunnels,
}));

vi.mock("@/hooks/useHealth", () => ({
	useHealth: mocks.useHealth,
}));

vi.mock("@/components/Nginx/CloudflaredTunnelModal", () => ({
	CloudflaredTunnelModal: () => null,
}));

vi.mock("@/components/HasPermission", () => ({
	HasPermission: ({ children }: { children: React.ReactNode }) => children,
}));

beforeEach(() => {
	mocks.useCloudflaredTunnels.mockReturnValue({ data: [], isLoading: true, refetch: vi.fn() });
});

afterEach(async () => {
	cleanup();
	mocks.useHealth.mockReset();
	mocks.useCloudflaredTunnels.mockReset();
	await changeLocale("en-US");
});

describe("CloudflaredTunnels", () => {
	it("renders the demo restriction state in the active locale", async () => {
		mocks.useHealth.mockReturnValue({ data: { demo: true } });
		await changeLocale("de-DE");

		render(<CloudflaredTunnels />);

		expect(screen.getByRole("heading", { name: "Zugriff verweigert" })).toBeInTheDocument();
		expect(screen.getByText("Diese Funktion ist im Demo-Modus deaktiviert.")).toBeInTheDocument();
		expect(screen.getByText("Cloudflare-Tunnel sind aus Sicherheitsgründen eingeschränkt.")).toBeInTheDocument();
	});

	it("labels the refresh control in the active locale", async () => {
		mocks.useHealth.mockReturnValue({ data: { demo: false } });
		mocks.useCloudflaredTunnels.mockReturnValue({ data: [], isLoading: true, refetch: vi.fn() });
		await changeLocale("de-DE");

		render(<CloudflaredTunnels />);

		expect(screen.getByRole("button", { name: "Cloudflare-Tunnel aktualisieren" })).toBeInTheDocument();
	});

	it("labels the help and tunnel row actions in the active locale", async () => {
		mocks.useHealth.mockReturnValue({ data: { demo: false } });
		mocks.useCloudflaredTunnels.mockReturnValue({
			data: [{ id: 1, name: "example", status: 0, createdOn: "2026-07-11T12:00:00Z", meta: {} }],
			isLoading: false,
			refetch: vi.fn(),
		});
		await changeLocale("de-DE");

		render(<CloudflaredTunnels />);

		expect(screen.getByRole("button", { name: "Hilfe" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Tunnel bearbeiten" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Löschen" })).toBeInTheDocument();
	});
});
