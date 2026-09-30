import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import type { AcmeOptions } from "src/api/backend/acmeOptions";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import AcmeOptionsCard, { acmeServers } from "./AcmeOptionsCard";

const api = vi.hoisted(() => ({ getAcmeOptions: vi.fn(), updateAcmeOptions: vi.fn() }));
const certificates = vi.hoisted(() => ({
	data: [
		{ id: 7, niceName: "Active certificate", domainNames: ["example.test"], expiresOn: "2099-01-01T00:00:00Z" },
		{ id: 8, niceName: "Expired certificate", domainNames: ["old.test"], expiresOn: "2000-01-01T00:00:00Z" },
	],
	isLoading: false,
	error: null as Error | null,
}));
vi.mock("src/api/backend/acmeOptions", () => api);
vi.mock("src/hooks/useCertificates", () => ({ useCertificates: () => certificates }));
vi.mock("src/locale", () => ({ T: ({ id }: { id: string }) => id }));
vi.mock("src/notifications", () => ({ showObjectSuccess: vi.fn() }));
vi.mock("src/components/Loading", () => ({ Loading: () => <div role="status">Loading ACME options</div> }));
vi.mock("src/components/ui/select", () => ({
	Select: ({
		value,
		onValueChange,
		disabled,
		children,
	}: PropsWithChildren<{ value: string; onValueChange: (value: string) => void; disabled?: boolean }>) => (
		<select
			id={/^\d+$/.test(value) ? "acmeDefaultCertificate" : "acmeServerChoice"}
			value={value}
			disabled={disabled}
			onChange={(event) => onValueChange(event.target.value)}
		>
			{children}
		</select>
	),
	SelectContent: ({ children }: PropsWithChildren) => children,
	SelectItem: ({ children, value, disabled }: PropsWithChildren<{ value: string; disabled?: boolean }>) => (
		<option value={value} disabled={disabled}>
			{children}
		</option>
	),
	SelectTrigger: () => null,
	SelectValue: () => null,
}));

const initial: AcmeOptions = {
	server: "https://ca.example.test/directory",
	email: "admin@example.test",
	accountId: "",
	eabKid: "kid-1",
	eabHmacKeySet: true,
	agreeTos: true,
	mustStaple: false,
	ocspStapling: false,
	serverTlsVerify: true,
	customOcspStapling: false,
	defaultCertificateId: 0,
};
const clients: QueryClient[] = [];
function setup() {
	const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
	clients.push(client);
	render(
		<QueryClientProvider client={client}>
			<AcmeOptionsCard />
		</QueryClientProvider>,
	);
	return client;
}
const saveButton = () => screen.getByRole("button", { name: "save" });
const input = (label: string) => screen.getByLabelText(label);
beforeEach(() => {
	vi.resetAllMocks();
	api.getAcmeOptions.mockResolvedValue(initial);
	api.updateAcmeOptions.mockImplementation(async (request) => {
		const { eabHmacKey, ...ordinary } = request;
		return {
			...ordinary,
			eabHmacKeySet: eabHmacKey === null ? false : Boolean(eabHmacKey || initial.eabHmacKeySet),
		};
	});
	certificates.error = null;
	certificates.isLoading = false;
});
afterEach(() => {
	cleanup();
	for (const client of clients.splice(0)) client.clear();
});

describe("ACME account settings", () => {
	it("offers no guessed account data or Save before the initial GET completes", async () => {
		let resolve: (value: AcmeOptions) => void = () => undefined;
		api.getAcmeOptions.mockReturnValue(
			new Promise((done) => {
				resolve = done;
			}),
		);
		setup();
		expect(screen.getByRole("status")).toBeInTheDocument();
		expect(screen.queryByLabelText("email-address")).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
		await act(async () => resolve(initial));
		expect(await screen.findByLabelText("email-address")).toHaveValue(initial.email);
		expect(saveButton()).toBeDisabled();
	});
	it("shows initial GET errors without an editable replacement configuration", async () => {
		api.getAcmeOptions.mockRejectedValue(new Error("Options unavailable"));
		setup();
		expect(await screen.findByText("Options unavailable")).toBeInTheDocument();
		expect(screen.queryByLabelText("email-address")).not.toBeInTheDocument();
	});
	it("starts with a blank password, retains the saved key for ordinary edits, and excludes its presence marker", async () => {
		setup();
		await screen.findByLabelText("email-address");
		expect(input("settings.acme.eab-key")).toHaveValue("");
		expect(screen.getByText("settings.acme.key-retained")).toBeInTheDocument();
		fireEvent.change(input("email-address"), { target: { value: "updated@example.test" } });
		fireEvent.click(saveButton());
		await waitFor(() => expect(api.updateAcmeOptions).toHaveBeenCalled());
		const { eabHmacKeySet: _marker, ...ordinary } = initial;
		expect(api.updateAcmeOptions.mock.calls[0][0]).toEqual({ ...ordinary, email: "updated@example.test" });
	});
	it("saves a secret-only replacement and clears the successful password draft", async () => {
		let resolve: (value: AcmeOptions) => void = () => undefined;
		api.updateAcmeOptions.mockReturnValue(
			new Promise((done) => {
				resolve = done;
			}),
		);
		const client = setup();
		const key = await screen.findByLabelText("settings.acme.eab-key");
		fireEvent.change(key, { target: { value: "synthetic-replacement" } });
		expect(saveButton()).toBeEnabled();
		fireEvent.click(saveButton());
		await waitFor(() => expect(api.updateAcmeOptions).toHaveBeenCalled());
		expect(api.updateAcmeOptions.mock.calls[0][0].eabHmacKey).toBe("synthetic-replacement");
		expect(key).toBeDisabled();
		expect(input("email-address")).toBeDisabled();
		expect(saveButton()).toBeDisabled();
		await act(async () => resolve(initial));
		await waitFor(() => expect(key).toHaveValue(""));
		expect(saveButton()).toBeDisabled();
		expect(client.getQueryData(["acme-options"])).toEqual(initial);
	});
	it("clears both EAB fields only through the explicit clear action", async () => {
		setup();
		await screen.findByLabelText("settings.acme.eab-key");
		fireEvent.click(screen.getByRole("button", { name: "settings.acme.clear-eab" }));
		expect(input("settings.acme.eab-kid")).toHaveValue("");
		fireEvent.click(saveButton());
		await waitFor(() => expect(api.updateAcmeOptions).toHaveBeenCalled());
		expect(api.updateAcmeOptions.mock.calls[0][0]).toMatchObject({ eabKid: "", eabHmacKey: null });
	});
	it.each(["settings.acme.eab-kid", "settings.acme.directory-url"])(
		"requires replacement or clearing after changing %s with a saved key",
		async (label) => {
			setup();
			await screen.findByLabelText(label);
			fireEvent.change(input(label), {
				target: { value: label.includes("kid") ? "different-kid" : "https://new-ca.example.test/directory" },
			});
			expect(screen.getByText("settings.acme.eab-error")).toBeInTheDocument();
			expect(saveButton()).toBeDisabled();
			fireEvent.change(input("settings.acme.eab-key"), { target: { value: "synthetic-replacement" } });
			expect(saveButton()).toBeEnabled();
		},
	);
	it("requires a complete EAB pair for newly entered credentials", async () => {
		api.getAcmeOptions.mockResolvedValue({ ...initial, eabKid: "", eabHmacKeySet: false });
		setup();
		await screen.findByLabelText("settings.acme.eab-key");
		fireEvent.change(input("settings.acme.eab-kid"), { target: { value: "new-kid" } });
		expect(saveButton()).toBeDisabled();
		fireEvent.change(input("settings.acme.eab-key"), { target: { value: "synthetic-new-key" } });
		expect(saveButton()).toBeEnabled();
		fireEvent.change(input("settings.acme.eab-kid"), { target: { value: "" } });
		expect(saveButton()).toBeDisabled();
	});
	it("preserves account and replacement-key drafts across refreshes and failed saves", async () => {
		const client = setup();
		await screen.findByLabelText("email-address");
		fireEvent.change(input("email-address"), { target: { value: "draft@example.test" } });
		fireEvent.change(input("settings.acme.eab-key"), { target: { value: "synthetic-replacement" } });
		api.getAcmeOptions.mockResolvedValue({ ...initial, email: "background@example.test" });
		await act(async () => {
			await client.refetchQueries({ queryKey: ["acme-options"] });
		});
		api.updateAcmeOptions.mockRejectedValue(new Error("Registration failed"));
		fireEvent.click(saveButton());
		expect(await screen.findByText("Registration failed")).toBeInTheDocument();
		expect(input("email-address")).toHaveValue("draft@example.test");
		expect(input("settings.acme.eab-key")).toHaveValue("synthetic-replacement");
		expect(saveButton()).toBeEnabled();
	});
	it("keeps the original account identity when a secret-only draft is followed by a background server change", async () => {
		const client = setup();
		await screen.findByLabelText("settings.acme.eab-key");
		fireEvent.change(input("settings.acme.eab-key"), { target: { value: "synthetic-replacement" } });
		api.getAcmeOptions.mockResolvedValue({
			...initial,
			server: "https://other-ca.example.test/directory",
			eabKid: "other-kid",
		});
		await act(async () => {
			await client.refetchQueries({ queryKey: ["acme-options"] });
		});
		expect(input("settings.acme.directory-url")).toHaveValue(initial.server);
		expect(input("settings.acme.eab-kid")).toHaveValue(initial.eabKid);
		fireEvent.click(saveButton());
		await waitFor(() => expect(api.updateAcmeOptions).toHaveBeenCalled());
		expect(api.updateAcmeOptions.mock.calls[0][0]).toMatchObject({
			server: initial.server,
			eabKid: initial.eabKid,
			eabHmacKey: "synthetic-replacement",
		});
	});
	it.each(["not-a-url", "ftp://ca.example.test/directory", "https://user:password@ca.example.test/directory"])(
		"does not submit the invalid directory URL %s",
		async (server) => {
			setup();
			await screen.findByLabelText("settings.acme.directory-url");
			fireEvent.change(input("settings.acme.directory-url"), { target: { value: server } });
			fireEvent.change(input("settings.acme.eab-key"), { target: { value: "synthetic-replacement" } });
			expect(saveButton()).toBeDisabled();
			expect(api.updateAcmeOptions).not.toHaveBeenCalled();
		},
	);
	it.each(Object.entries(acmeServers))("selects the %s CA and sends its directory URL", async (choice, server) => {
		api.getAcmeOptions.mockResolvedValue({ ...initial, eabKid: "", eabHmacKeySet: false });
		setup();
		await screen.findByLabelText("settings.acme.server");
		fireEvent.change(input("settings.acme.server"), { target: { value: choice } });
		fireEvent.click(saveButton());
		await waitFor(() => expect(api.updateAcmeOptions).toHaveBeenCalled());
		expect(api.updateAcmeOptions.mock.calls[0][0].server).toBe(server);
	});
	it("couples Must-Staple and ACME OCSP while allowing custom OCSP independently", async () => {
		setup();
		await screen.findByLabelText("settings.acme.must-staple");
		fireEvent.click(input("settings.acme.must-staple"));
		expect(input("settings.acme.ocsp")).toBeChecked();
		fireEvent.click(input("settings.acme.custom-ocsp"));
		fireEvent.click(input("settings.acme.ocsp"));
		expect(input("settings.acme.must-staple")).not.toBeChecked();
		expect(input("settings.acme.custom-ocsp")).toBeChecked();
		fireEvent.click(saveButton());
		await waitFor(() => expect(api.updateAcmeOptions).toHaveBeenCalled());
		expect(api.updateAcmeOptions.mock.calls[0][0]).toMatchObject({
			mustStaple: false,
			ocspStapling: false,
			customOcspStapling: true,
		});
	});
	it("warns and blocks unsupported Let's Encrypt Must-Staple until corrected", async () => {
		api.getAcmeOptions.mockResolvedValue({ ...initial, server: acmeServers.production });
		setup();
		await screen.findByLabelText("settings.acme.must-staple");
		fireEvent.click(input("settings.acme.must-staple"));
		expect(screen.getByText("settings.acme.must-staple-error")).toBeInTheDocument();
		expect(saveButton()).toBeDisabled();
		fireEvent.click(input("settings.acme.must-staple"));
		expect(saveButton()).toBeEnabled();
	});
	it("offers the built-in certificate and unexpired certificates without guessing an unavailable selection", async () => {
		api.getAcmeOptions.mockResolvedValue({ ...initial, defaultCertificateId: 8 });
		setup();
		await screen.findByLabelText("settings.acme.default-certificate");
		expect(screen.getByRole("option", { name: "Active certificate" })).toBeInTheDocument();
		expect(screen.queryByRole("option", { name: "Expired certificate" })).not.toBeInTheDocument();
		expect(input("settings.acme.default-certificate")).toHaveValue("8");
		fireEvent.change(input("settings.acme.default-certificate"), { target: { value: "7" } });
		fireEvent.click(saveButton());
		await waitFor(() => expect(api.updateAcmeOptions).toHaveBeenCalled());
		expect(api.updateAcmeOptions.mock.calls[0][0].defaultCertificateId).toBe(7);
	});
	it.each(["account id", "../account", "account:id"])("rejects unsafe account ID %s", async (accountId) => {
		setup();
		await screen.findByLabelText("settings.acme.account-id");
		fireEvent.change(input("settings.acme.account-id"), { target: { value: accountId } });
		expect(saveButton()).toBeDisabled();
		expect(api.updateAcmeOptions).not.toHaveBeenCalled();
	});
	it("allows a safe explicit account ID and stores the agreement and TLS-verification choices", async () => {
		setup();
		await screen.findByLabelText("settings.acme.account-id");
		fireEvent.change(input("settings.acme.account-id"), { target: { value: "account_2-safe" } });
		fireEvent.click(input("settings.acme.agree-tos"));
		fireEvent.click(input("settings.acme.tls-verify"));
		fireEvent.click(saveButton());
		await waitFor(() => expect(api.updateAcmeOptions).toHaveBeenCalled());
		expect(api.updateAcmeOptions.mock.calls[0][0]).toMatchObject({
			accountId: "account_2-safe",
			agreeTos: false,
			serverTlsVerify: false,
		});
	});
	it.each(["bad+key", "key with spaces", "key#tag"])("rejects a non-base64url replacement key %s", async (secret) => {
		setup();
		await screen.findByLabelText("settings.acme.eab-key");
		fireEvent.change(input("settings.acme.eab-key"), { target: { value: secret } });
		expect(screen.getByText("settings.acme.eab-error")).toBeInTheDocument();
		expect(saveButton()).toBeDisabled();
	});
	it.each(["kid[section]", "kid'quoted", "kid#comment", "kid;comment"])(
		"rejects unsafe EAB ID %s even with a replacement key",
		async (eabKid) => {
			setup();
			await screen.findByLabelText("settings.acme.eab-key");
			fireEvent.change(input("settings.acme.eab-kid"), { target: { value: eabKid } });
			fireEvent.change(input("settings.acme.eab-key"), { target: { value: "synthetic-replacement" } });
			expect(saveButton()).toBeDisabled();
		},
	);
	it("requires an email for retained EAB credentials and allows explicit clearing to remove that requirement", async () => {
		api.getAcmeOptions.mockResolvedValue({ ...initial, email: "" });
		setup();
		await screen.findByLabelText("email-address");
		fireEvent.change(input("settings.acme.account-id"), { target: { value: "account-2" } });
		expect(saveButton()).toBeDisabled();
		fireEvent.click(screen.getByRole("button", { name: "settings.acme.clear-eab" }));
		expect(saveButton()).toBeEnabled();
	});
	it("rejects account IDs longer than 128 characters and directory URLs containing whitespace", async () => {
		setup();
		await screen.findByLabelText("settings.acme.account-id");
		fireEvent.change(input("settings.acme.account-id"), { target: { value: "a".repeat(129) } });
		expect(saveButton()).toBeDisabled();
		fireEvent.change(input("settings.acme.account-id"), { target: { value: "a".repeat(128) } });
		expect(saveButton()).toBeEnabled();
		fireEvent.change(input("settings.acme.directory-url"), {
			target: { value: "https://ca.example.test/white space" },
		});
		fireEvent.change(input("settings.acme.eab-key"), { target: { value: "synthetic-replacement" } });
		expect(saveButton()).toBeDisabled();
	});
});
