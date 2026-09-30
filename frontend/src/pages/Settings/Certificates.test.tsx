import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import type { PropsWithChildren } from "react";
import type { AcmeProfileSettings } from "src/api/backend/acmeProfile";
import { acmeProfileQueryKey } from "src/hooks/useAcmeProfile";
import { AUDIT_LOG_OBJECT_TYPE } from "src/types/enums";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import Certificates from "./Certificates";

const mocks = vi.hoisted(() => ({ get: vi.fn(), update: vi.fn(), success: vi.fn() }));

vi.mock("src/api/backend/acmeProfile", () => ({
	getAcmeProfile: mocks.get,
	updateAcmeProfile: mocks.update,
}));
vi.mock("src/locale", () => ({ T: ({ id }: { id: string }) => id }));
vi.mock("src/notifications", () => ({ showObjectSuccess: mocks.success }));
vi.mock("src/components/Loading", () => ({ Loading: () => <div role="status">Loading certificates</div> }));
vi.mock("src/components/ui/select", () => ({
	Select: ({
		value,
		onValueChange,
		disabled,
	}: PropsWithChildren<{ value: string; onValueChange: (value: string) => void; disabled?: boolean }>) => (
		<select
			id="defaultCertificateProfile"
			value={value}
			disabled={disabled}
			onChange={(event) => onValueChange(event.target.value)}
		>
			<option value="standard">Standard</option>
			<option value="shortlived">Short-lived</option>
		</select>
	),
	SelectContent: () => null,
	SelectItem: () => null,
	SelectTrigger: () => null,
	SelectValue: () => null,
}));

const clients: QueryClient[] = [];

function renderCertificates() {
	const client = new QueryClient({
		defaultOptions: { queries: { retry: false, gcTime: Number.POSITIVE_INFINITY }, mutations: { retry: false } },
	});
	clients.push(client);
	render(
		<QueryClientProvider client={client}>
			<Certificates />
		</QueryClientProvider>,
	);
	return client;
}

function deferred<T>() {
	let resolve!: (value: T) => void;
	const promise = new Promise<T>((finish) => {
		resolve = finish;
	});
	return { promise, resolve };
}

beforeEach(() => {
	vi.resetAllMocks();
	mocks.get.mockResolvedValue({ profile: "standard", source: "settings" });
});

afterEach(() => {
	cleanup();
	for (const client of clients.splice(0)) client.clear();
});

describe("global ACME profile settings", () => {
	it("waits for the server before offering an editable profile or saving guessed defaults", async () => {
		const initial = deferred<AcmeProfileSettings>();
		mocks.get.mockReturnValue(initial.promise);
		renderCertificates();

		expect(screen.getByRole("status")).toHaveTextContent("Loading certificates");
		expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
		expect(mocks.update).not.toHaveBeenCalled();

		initial.resolve({ profile: "shortlived", source: "environment" });
		expect(await screen.findByLabelText("settings.certificates.profile")).toHaveValue("shortlived");
		expect(screen.queryByRole("status")).not.toBeInTheDocument();
	});

	it("shows a failed initial request without a profile selector or save action", async () => {
		mocks.get.mockRejectedValue(new Error("ACME settings unavailable"));
		renderCertificates();

		expect(await screen.findByText("ACME settings unavailable")).toBeInTheDocument();
		expect(screen.queryByRole("combobox")).not.toBeInTheDocument();
		expect(screen.queryByRole("button", { name: "save" })).not.toBeInTheDocument();
		expect(mocks.update).not.toHaveBeenCalled();
	});

	it.each<AcmeProfileSettings>([
		{ profile: "standard", source: "settings" },
		{ profile: "shortlived", source: "settings" },
		{ profile: "standard", source: "environment" },
		{ profile: "shortlived", source: "environment" },
	])("loads $profile from $source and allows persisting an environment override", async (settings) => {
		mocks.get.mockResolvedValue(settings);
		renderCertificates();

		expect(await screen.findByLabelText("settings.certificates.profile")).toHaveValue(settings.profile);
		expect(screen.getByText(`certificates.profile.${settings.profile}-description`)).toBeInTheDocument();
		expect(screen.getByText(`settings.certificates.source-${settings.source}`)).toBeInTheDocument();
		const save = screen.getByRole("button", { name: "save" });
		if (settings.source === "environment") {
			mocks.update.mockResolvedValue({ profile: settings.profile, source: "settings" });
			expect(save).toBeEnabled();
			fireEvent.click(save);
			await waitFor(() => expect(mocks.update).toHaveBeenCalledOnce());
			expect(mocks.update.mock.calls[0][0]).toEqual({ profile: settings.profile });
			expect(await screen.findByText("settings.certificates.source-settings")).toBeInTheDocument();
			expect(save).toBeDisabled();
		} else {
			expect(save).toBeDisabled();
			fireEvent.click(save);
			expect(mocks.update).not.toHaveBeenCalled();
		}
	});

	it("preserves a selected draft across changed background settings and a failed refresh", async () => {
		mocks.get.mockResolvedValueOnce({ profile: "shortlived", source: "settings" });
		const client = renderCertificates();
		const profile = await screen.findByLabelText("settings.certificates.profile");
		fireEvent.change(profile, { target: { value: "standard" } });

		mocks.get.mockResolvedValueOnce({ profile: "shortlived", source: "environment" });
		await act(async () => {
			await client.refetchQueries({ queryKey: acmeProfileQueryKey });
		});
		expect(profile).toHaveValue("standard");
		expect(await screen.findByText("settings.certificates.source-environment")).toBeInTheDocument();

		mocks.get.mockRejectedValueOnce(new Error("Background refresh failed"));
		await act(async () => {
			await client.refetchQueries({ queryKey: acmeProfileQueryKey });
		});
		expect(await screen.findByText("Background refresh failed")).toBeInTheDocument();
		expect(profile).toHaveValue("standard");
		expect(screen.getByRole("button", { name: "save" })).toBeEnabled();
		expect(mocks.update).not.toHaveBeenCalled();
	});

	it("retains the draft after a save failure and clears the mutation error when the selection changes", async () => {
		mocks.update.mockRejectedValue(new Error("Saving the ACME profile failed"));
		renderCertificates();
		const profile = await screen.findByLabelText("settings.certificates.profile");
		fireEvent.change(profile, { target: { value: "shortlived" } });
		fireEvent.click(screen.getByRole("button", { name: "save" }));

		expect(await screen.findByText("Saving the ACME profile failed")).toBeInTheDocument();
		expect(profile).toHaveValue("shortlived");
		expect(screen.getByRole("button", { name: "save" })).toBeEnabled();
		expect(mocks.success).not.toHaveBeenCalled();

		fireEvent.change(profile, { target: { value: "standard" } });
		await waitFor(() => expect(screen.queryByText("Saving the ACME profile failed")).not.toBeInTheDocument());
		expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
	});

	it("saves the selected profile, updates the shared cache, and clears the draft after success", async () => {
		mocks.update.mockResolvedValue({ profile: "shortlived", source: "settings" });
		const client = renderCertificates();
		const profile = await screen.findByLabelText("settings.certificates.profile");
		fireEvent.change(profile, { target: { value: "shortlived" } });
		fireEvent.click(screen.getByRole("button", { name: "save" }));

		await waitFor(() => expect(mocks.success).toHaveBeenCalledWith(AUDIT_LOG_OBJECT_TYPE.SETTING, "saved"));
		expect(mocks.update).toHaveBeenCalledOnce();
		expect(mocks.update.mock.calls[0][0]).toEqual({ profile: "shortlived" });
		expect(client.getQueryData(acmeProfileQueryKey)).toEqual({ profile: "shortlived", source: "settings" });
		expect(screen.getByRole("button", { name: "save" })).toBeDisabled();

		act(() => {
			client.setQueryData(acmeProfileQueryKey, { profile: "standard", source: "settings" });
		});
		await waitFor(() => expect(profile).toHaveValue("standard"));
		expect(screen.getByRole("button", { name: "save" })).toBeDisabled();
	});

	it("disables the selector and save action while a save is pending", async () => {
		const saved = deferred<AcmeProfileSettings>();
		mocks.update.mockReturnValue(saved.promise);
		renderCertificates();
		const profile = await screen.findByLabelText("settings.certificates.profile");
		const save = screen.getByRole("button", { name: "save" });
		fireEvent.change(profile, { target: { value: "shortlived" } });
		fireEvent.click(save);

		await waitFor(() => expect(profile).toBeDisabled());
		expect(save).toBeDisabled();
		fireEvent.click(save);
		expect(mocks.update).toHaveBeenCalledOnce();

		saved.resolve({ profile: "shortlived", source: "settings" });
		await waitFor(() => expect(profile).toBeEnabled());
		expect(save).toBeDisabled();
	});
});
