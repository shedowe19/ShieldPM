import { cleanup, fireEvent, render, screen, waitFor } from "@testing-library/react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import StepUpDialog from "./StepUpDialog";

const mocks = vi.hoisted(() => ({ stepUpAuthentication: vi.fn() }));

vi.mock("src/api/backend", () => ({ stepUpAuthentication: mocks.stepUpAuthentication }));
vi.mock("src/pages/Login/TwoFAStep", () => ({
	default: ({ onSuccess }: { onSuccess: (value: { expires: number }) => void }) => (
		<button type="button" onClick={() => onSuccess({ expires: Date.now() + 60_000 })}>
			Complete second factor
		</button>
	),
}));

describe("StepUpDialog", () => {
	beforeEach(() => vi.clearAllMocks());
	afterEach(cleanup);

	it("verifies the current password and completes a password-only step-up", async () => {
		const onComplete = vi.fn();
		mocks.stepUpAuthentication.mockResolvedValue({ expires: Date.now() + 60_000, user: { id: 1 } });
		render(<StepUpDialog open onOpenChange={vi.fn()} onComplete={onComplete} />);

		fireEvent.change(screen.getByLabelText("Current Password"), { target: { value: "correct password" } });
		fireEvent.click(screen.getByRole("button", { name: "Continue" }));

		await waitFor(() => expect(mocks.stepUpAuthentication).toHaveBeenCalledWith("correct password"));
		expect(onComplete).toHaveBeenCalledOnce();
	});

	it("continues with the configured second factor when required", async () => {
		const onComplete = vi.fn();
		mocks.stepUpAuthentication.mockResolvedValue({
			requires2fa: true,
			pendingToken: "pending-step-up-token",
			methods: ["totp"],
		});
		render(<StepUpDialog open onOpenChange={vi.fn()} onComplete={onComplete} />);

		fireEvent.change(screen.getByLabelText("Current Password"), { target: { value: "correct password" } });
		fireEvent.click(screen.getByRole("button", { name: "Continue" }));
		fireEvent.click(await screen.findByRole("button", { name: "Complete second factor" }));

		expect(onComplete).toHaveBeenCalledOnce();
	});
});
