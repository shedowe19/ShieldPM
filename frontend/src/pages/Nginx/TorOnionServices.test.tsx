import { cleanup, render, screen } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TorOnionServices } from "./TorOnionServices";
import { changeLocale } from "@/locale";

const mocks = vi.hoisted(() => ({
	useHealth: vi.fn(),
	useTorOnion: vi.fn(),
	useTorOnions: vi.fn(),
}));

vi.mock("@/hooks/useHealth", () => ({
	useHealth: mocks.useHealth,
}));

vi.mock("@/hooks/useTorOnion", () => ({
	useTorOnion: mocks.useTorOnion,
	useTorOnions: mocks.useTorOnions,
}));

vi.mock("@/hooks/use-toast", () => ({
	useToast: () => ({ toast: vi.fn() }),
}));

vi.mock("@/components/HasPermission", () => ({
	HasPermission: ({ children }: { children: React.ReactNode }) => children,
}));

vi.mock("@/components/Nginx/TorOnionModal", () => ({
	TorOnionModal: () => null,
}));

vi.mock("./TorOnionServices.lazy", () => ({
	showTorOnionServicesHelpModal: vi.fn(),
}));

beforeEach(() => {
	mocks.useHealth.mockReturnValue({ data: { demo: false } });
	mocks.useTorOnion.mockReturnValue({
		remove: { mutate: vi.fn() },
		start: { isPending: false, mutate: vi.fn() },
		stop: { isPending: false, mutate: vi.fn() },
	});
	mocks.useTorOnions.mockReturnValue({
		data: {
			services: [
				{
					id: 1,
					name: "stopped-service",
					onionAddress: "stoppedservice.onion",
					status: 0,
					targetPort: 8080,
					virtualPort: 80,
				},
				{
					id: 2,
					name: "running-service",
					onionAddress: "runningservice.onion",
					status: 2,
					targetPort: 8081,
					virtualPort: 443,
				},
			],
			tor: { available: true, version: "0.4.8" },
		},
		isLoading: false,
		refetch: vi.fn(),
	});
});

afterEach(async () => {
	cleanup();
	mocks.useHealth.mockReset();
	mocks.useTorOnion.mockReset();
	mocks.useTorOnions.mockReset();
	await changeLocale("en-US");
});

describe("TorOnionServices", () => {
	it("labels Tor Onion icon controls in the active locale", async () => {
		await changeLocale("de-DE");

		render(<TorOnionServices />);

		expect(screen.getByRole("button", { name: "Tor-Onion-Dienste aktualisieren" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Hilfe" })).toBeInTheDocument();
		expect(screen.getAllByRole("button", { name: "Onion-Adresse kopieren" })).toHaveLength(2);
		expect(screen.getByRole("button", { name: "Onion-Dienst starten" })).toBeInTheDocument();
		expect(screen.getByRole("button", { name: "Onion-Dienst stoppen" })).toBeInTheDocument();
		expect(screen.getAllByRole("button", { name: "Onion-Dienst bearbeiten" })).toHaveLength(2);
		expect(screen.getAllByRole("button", { name: "Löschen" })).toHaveLength(2);
	});
});
