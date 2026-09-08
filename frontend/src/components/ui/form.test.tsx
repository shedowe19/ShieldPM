import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { useForm } from "react-hook-form";
import { afterEach, expect, it, vi } from "vitest";
import { Form, FormControl, FormField, FormItem, FormLabel, FormMessage } from "./form";

const save = vi.fn();
function RequiredNameForm() {
	const form = useForm({ defaultValues: { name: "" } });
	return (
		<Form {...form}>
			<form onSubmit={form.handleSubmit(save)}>
				<FormField
					control={form.control}
					name="name"
					rules={{ required: "A name is required" }}
					render={({ field }) => (
						<FormItem>
							<FormLabel>Name</FormLabel>
							<FormControl>
								<input {...field} />
							</FormControl>
							<FormMessage />
						</FormItem>
					)}
				/>
				<button type="submit">Save</button>
			</form>
		</Form>
	);
}
afterEach(cleanup);
it("renders the validation error and associates it with the invalid input", async () => {
	render(<RequiredNameForm />);
	fireEvent.click(screen.getByRole("button", { name: "Save" }));
	const message = await screen.findByText("A name is required");
	expect(screen.getByLabelText("Name")).toHaveAttribute("aria-describedby", expect.stringContaining(message.id));
	expect(save).not.toHaveBeenCalled();
});
