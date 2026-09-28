import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { changeLocale, intl } from "src/locale";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { MonitorDialog } from "./MonitorDialog";

const mocks = vi.hoisted(() => ({
	check: vi.fn(),
	query: vi.fn(),
	update: vi.fn(),
}));

vi.mock("src/hooks/useProxyHostMonitor", () => ({
	useProxyHostMonitor: mocks.query,
	useUpdateProxyHostMonitor: () => ({ mutate: mocks.update, isPending: false }),
	useCheckProxyHostMonitor: () => ({ mutate: mocks.check, isPending: false }),
}));
vi.mock("src/components", () => ({
	HasPermission: ({ children }: { children: React.ReactNode }) => <>{children}</>,
}));

const savedConfig = {
	enabled: true,
	type: "http" as const,
	path: "/health",
	intervalSeconds: 60,
	timeoutMs: 5000,
	expectedStatus: 200,
	alertEnabled: false,
	skipCertificateVerification: false,
	upstreamCa: null,
	upstreamServerName: null,
};

function renderMonitor(forwardScheme = "https") {
	return render(
		<MonitorDialog
			hostId={7}
			domain="app.example.test"
			forwardScheme={forwardScheme}
			hostEnabled
			targetSupported
			onClose={vi.fn()}
		/>,
	);
}

describe("Host monitor settings", () => {
	beforeEach(async () => {
		vi.clearAllMocks();
		mocks.query.mockReturnValue({ data: { config: null, status: null, history: [] }, isLoading: false });
		await changeLocale("de");
	});
	afterEach(async () => {
		cleanup();
		await changeLocale("en");
	});

	it("creates HTTP monitoring with the selected path and status code", () => {
		render(
			<MonitorDialog
				hostId={7}
				domain="app.example.test"
				forwardScheme="http"
				hostEnabled
				targetSupported
				onClose={vi.fn()}
			/>,
		);

		fireEvent.change(screen.getByLabelText("HTTP-Pfad"), { target: { value: "/health/ready" } });
		fireEvent.change(screen.getByLabelText("Erwarteter HTTP-Status"), { target: { value: "204" } });
		fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

		expect(mocks.update).toHaveBeenCalledWith(
			{ ...savedConfig, path: "/health/ready", expectedStatus: 204, intervalSeconds: 60 },
			expect.any(Object),
		);
		expect(mocks.check).not.toHaveBeenCalled();
		expect(screen.queryByLabelText("Benutzerdefinierte CA für den Zielserver (PEM)")).not.toBeInTheDocument();
		expect(screen.queryByLabelText("Zertifikatsprüfung für HTTPS-Monitor überspringen")).not.toBeInTheDocument();
	});

	it("saves and restores the public CA and SNI name for an HTTPS monitor", () => {
		const publicCert = "-----BEGIN CERTIFICATE-----\nAQID\n-----END CERTIFICATE-----";
		mocks.query.mockReturnValue({
			data: {
				config: { ...savedConfig, upstreamCa: publicCert, upstreamServerName: "backend.example.test" },
				status: null,
				history: [],
			},
			isLoading: false,
		});
		renderMonitor();

		const caField = screen.getByLabelText("Benutzerdefinierte CA für den Zielserver (PEM)");
		const nameField = screen.getByLabelText("TLS-Servername des Zielservers");
		expect(caField).toHaveValue(publicCert);
		expect(caField).toHaveAttribute("maxLength", "65535");
		expect(nameField).toHaveValue("backend.example.test");
		fireEvent.change(nameField, { target: { value: "new.example.test" } });
		fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

		expect(mocks.update).toHaveBeenCalledWith(
			{ ...savedConfig, upstreamCa: publicCert, upstreamServerName: "new.example.test" },
			expect.any(Object),
		);
	});

	it("clears the optional TLS settings using null and does not apply them to a TCP check", () => {
		const publicCert = "-----BEGIN CERTIFICATE-----\nAQID\n-----END CERTIFICATE-----";
		mocks.query.mockReturnValue({
			data: {
				config: { ...savedConfig, upstreamCa: publicCert, upstreamServerName: "backend.example.test" },
				status: null,
				history: [],
			},
			isLoading: false,
		});
		renderMonitor();
		fireEvent.change(screen.getByLabelText("Benutzerdefinierte CA für den Zielserver (PEM)"), {
			target: { value: "" },
		});
		fireEvent.change(screen.getByLabelText("TLS-Servername des Zielservers"), { target: { value: "" } });
		fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
		expect(mocks.update).toHaveBeenLastCalledWith(
			{ ...savedConfig, upstreamCa: null, upstreamServerName: null },
			expect.any(Object),
		);

		fireEvent.change(screen.getByLabelText("Prüfart"), { target: { value: "tcp" } });
		expect(screen.queryByLabelText("Benutzerdefinierte CA für den Zielserver (PEM)")).not.toBeInTheDocument();
		expect(screen.queryByLabelText("Zertifikatsprüfung für HTTPS-Monitor überspringen")).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
		expect(mocks.update).toHaveBeenLastCalledWith(
			{ ...savedConfig, type: "tcp", upstreamCa: null, upstreamServerName: null },
			expect.any(Object),
		);
	});

	it("explicitly skips certificate verification only for HTTPS while preserving CA and SNI configuration", () => {
		const publicCert = "-----BEGIN CERTIFICATE-----\nAQID\n-----END CERTIFICATE-----";
		mocks.query.mockReturnValue({
			data: {
				config: { ...savedConfig, upstreamCa: publicCert, upstreamServerName: "backend.example.test" },
				status: null,
				history: [],
			},
			isLoading: false,
		});
		renderMonitor();
		const skip = screen.getByLabelText("Zertifikatsprüfung für HTTPS-Monitor überspringen");
		const caField = screen.getByLabelText("Benutzerdefinierte CA für den Zielserver (PEM)");
		expect(skip).not.toBeChecked();
		fireEvent.click(skip);
		expect(caField).toBeDisabled();
		expect(caField).toHaveValue(publicCert);
		expect(screen.getByText(/Verbindung bleibt verschlüsselt/)).toBeInTheDocument();
		expect(screen.getByText(/nicht mit dem Zertifikat verglichen/)).toBeInTheDocument();
		fireEvent.change(screen.getByLabelText("TLS-Servername des Zielservers"), {
			target: { value: "virtual.example.test" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
		expect(mocks.update).toHaveBeenCalledWith(
			{
				...savedConfig,
				skipCertificateVerification: true,
				upstreamCa: publicCert,
				upstreamServerName: "virtual.example.test",
			},
			expect.any(Object),
		);
		fireEvent.change(screen.getByLabelText("Prüfart"), { target: { value: "tcp" } });
		expect(screen.queryByLabelText("Zertifikatsprüfung für HTTPS-Monitor überspringen")).not.toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
		expect(mocks.update).toHaveBeenLastCalledWith(
			{
				...savedConfig,
				type: "tcp",
				upstreamCa: null,
				upstreamServerName: null,
			},
			expect.any(Object),
		);
	});

	it("restores an explicitly enabled skip switch from persisted settings", () => {
		mocks.query.mockReturnValue({
			data: {
				config: { ...savedConfig, skipCertificateVerification: true },
				status: null,
				history: [],
			},
			isLoading: false,
		});
		renderMonitor();
		const skip = screen.getByLabelText("Zertifikatsprüfung für HTTPS-Monitor überspringen");
		expect(skip).toBeChecked();
		fireEvent.click(skip);
		expect(screen.getByLabelText("Benutzerdefinierte CA für den Zielserver (PEM)")).not.toBeDisabled();
		fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
		expect(mocks.update).toHaveBeenCalledWith(savedConfig, expect.any(Object));
	});

	it("rejects private keys and invalid DNS names before saving an HTTPS check", () => {
		renderMonitor();
		fireEvent.change(screen.getByLabelText("Benutzerdefinierte CA für den Zielserver (PEM)"), {
			target: { value: "-----BEGIN PRIVATE KEY-----\nAQID\n-----END PRIVATE KEY-----" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
		expect(screen.getByRole("alert")).toHaveTextContent("private Schlüssel sind nicht erlaubt");
		expect(mocks.update).not.toHaveBeenCalled();

		fireEvent.change(screen.getByLabelText("Benutzerdefinierte CA für den Zielserver (PEM)"), {
			target: { value: "" },
		});
		fireEvent.change(screen.getByLabelText("TLS-Servername des Zielservers"), {
			target: { value: "invalid_hostname.example.test" },
		});
		fireEvent.click(screen.getByRole("button", { name: "Speichern" }));
		expect(screen.getByRole("alert")).toHaveTextContent("gültigen DNS-Namen");
		expect(mocks.update).not.toHaveBeenCalled();
	});

	it("explains an unverifiable HTTPS check in the current status and history", () => {
		const tlsFailure = {
			state: "unknown",
			checkedAt: "2026-09-23T12:00:00Z",
			responseMs: 20,
			message: "TLS certificate could not be verified",
		};
		mocks.query.mockReturnValue({
			data: {
				config: savedConfig,
				status: tlsFailure,
				history: [{ ...tlsFailure, id: 1, transition: false }],
			},
			isLoading: false,
		});
		renderMonitor();
		expect(screen.getAllByText("Nicht prüfbar")).toHaveLength(2);
		expect(
			screen.getAllByText(/TLS-Zertifikat nicht verifizierbar.*Zertifikatsprüfung bewusst überspringen/),
		).toHaveLength(2);
	});

	it("rejects a timeout greater than or equal to the interval", () => {
		render(
			<MonitorDialog
				hostId={7}
				domain="app.example.test"
				forwardScheme="http"
				hostEnabled
				targetSupported
				onClose={vi.fn()}
			/>,
		);
		fireEvent.change(screen.getByLabelText(intl.formatMessage({ id: "proxy-host.monitor.interval" })), {
			target: { value: "15" },
		});
		fireEvent.change(screen.getByLabelText("Zeitlimit (Millisekunden)"), { target: { value: "15000" } });
		fireEvent.click(screen.getByRole("button", { name: "Speichern" }));

		expect(screen.getByRole("alert")).toHaveTextContent("Das Zeitlimit muss kürzer als das Prüfintervall sein.");
		expect(mocks.update).not.toHaveBeenCalled();
	});

	it("shows recorded state changes and allows a manual check of an existing monitor", () => {
		mocks.query.mockReturnValue({
			data: {
				config: savedConfig,
				status: { state: "up", checkedAt: "2026-01-01T12:00:00Z", responseMs: 14, statusCode: 200 },
				history: [
					{
						id: 1,
						state: "up",
						checkedAt: "2026-01-01T12:00:00Z",
						responseMs: 14,
						statusCode: 200,
						transition: true,
					},
				],
			},
			isLoading: false,
		});
		render(
			<MonitorDialog
				hostId={7}
				domain="app.example.test"
				forwardScheme="http"
				hostEnabled
				targetSupported
				onClose={vi.fn()}
			/>,
		);
		expect(screen.getByText("Statuswechsel")).toBeInTheDocument();
		fireEvent.click(screen.getByRole("button", { name: "Jetzt prüfen" }));
		expect(mocks.check).toHaveBeenCalledWith(undefined, expect.any(Object));
	});

	it("offers TCP monitoring by default when the host scheme does not support HTTP", () => {
		render(
			<MonitorDialog
				hostId={7}
				domain="app.example.test"
				forwardScheme="grpc"
				hostEnabled
				targetSupported
				onClose={vi.fn()}
			/>,
		);
		expect(screen.getByLabelText("Prüfart")).toHaveValue("tcp");
		expect(screen.queryByLabelText("HTTP-Pfad")).not.toBeInTheDocument();
	});

	it("does not offer a monitor for file-system upstreams", () => {
		mocks.query.mockReturnValue({
			data: {
				config: { ...savedConfig, enabled: false },
				status: { state: "paused", checkedAt: null, responseMs: null },
				history: [],
			},
			isLoading: false,
		});
		render(
			<MonitorDialog
				hostId={7}
				domain="app.example.test"
				forwardScheme="path"
				hostEnabled
				targetSupported={false}
				onClose={vi.fn()}
			/>,
		);
		expect(screen.getByText(/Dateisystem/)).toBeInTheDocument();
		expect(screen.getByText(/automatisch deaktiviert/)).toBeInTheDocument();
		expect(screen.getByText("Pausiert")).toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "Speichern" })).not.toBeInTheDocument();
	});
});
