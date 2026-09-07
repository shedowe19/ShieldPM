import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { TorOnionServices } from "./TorOnionServices";
import { changeLocale } from "@/locale";

const mocks = vi.hoisted(() => ({
	useHealth: vi.fn(),
	toast: vi.fn(),
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
	useToast: () => ({ toast: mocks.toast }),
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
	mocks.toast.mockReset();
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

	it("reports clipboard rejection and never claims the address was copied", async () => {
		const original = Object.getOwnPropertyDescriptor(navigator, "clipboard");
		Object.defineProperty(navigator, "clipboard", {
			configurable: true,
			value: { writeText: vi.fn().mockRejectedValue(new Error("Clipboard denied")) },
		});
		render(<TorOnionServices />);
		fireEvent.click(screen.getAllByRole("button", { name: /copy onion address/i })[0]);
		await waitFor(() =>
			expect(mocks.toast).toHaveBeenCalledWith({ variant: "destructive", description: "Clipboard denied" }),
		);
		expect(mocks.toast).toHaveBeenCalledTimes(1);
		if (original) Object.defineProperty(navigator, "clipboard", original);
		else Reflect.deleteProperty(navigator, "clipboard");
	});

	it("distinguishes request failure from an unavailable Tor daemon", () => {
		mocks.useTorOnions.mockReturnValue({
			error: new Error("Tor request failed"),
			isLoading: false,
			refetch: vi.fn(),
		});
		render(<TorOnionServices />);
		expect(screen.getByText("Tor request failed")).toBeInTheDocument();
		expect(screen.queryByText(/Tor daemon is not available/i)).not.toBeInTheDocument();
	});
});
