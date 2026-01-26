import { IconNote } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import EasyModal, { type InnerModalProps } from "ez-modal-react";
import { Field, Form, Formik } from "formik";
import { AlertCircle } from "lucide-react";
import { type ReactNode, useState } from "react";
import { createDashboardNote, updateDashboardNote } from "src/api/backend";
import { Alert, AlertDescription, AlertTitle } from "src/components/ui/alert";
import { Button } from "src/components/ui/button";
import { Dialog, DialogContent, DialogFooter, DialogHeader, DialogTitle } from "src/components/ui/dialog";
import { Label } from "src/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "src/components/ui/select";
import { Textarea } from "src/components/ui/textarea";
import { cn } from "src/lib/utils";
import { intl, T } from "src/locale";
import { validateString } from "src/modules/Validations";
import { showObjectSuccess } from "src/notifications";

const showDashboardNoteModal = (note?: any) => {
	EasyModal.show(DashboardNoteModal, { note });
};

interface Props extends InnerModalProps {
	note?: {
		id: number;
		content: string;
		color?: string;
		position?: number;
	};
}

const COLORS = [
	{ value: "yellow", label: "Yellow", class: "bg-yellow-100 dark:bg-yellow-900/20" },
	{ value: "blue", label: "Blue", class: "bg-blue-100 dark:bg-blue-900/20" },
	{ value: "green", label: "Green", class: "bg-green-100 dark:bg-green-900/20" },
	{ value: "red", label: "Red", class: "bg-red-100 dark:bg-red-900/20" },
	{ value: "purple", label: "Purple", class: "bg-purple-100 dark:bg-purple-900/20" },
	{ value: "gray", label: "Gray", class: "bg-gray-100 dark:bg-gray-800" },
];

const DashboardNoteModal = EasyModal.create(({ note, visible, remove }: Props) => {
	const queryClient = useQueryClient();
	const [errorMsg, setErrorMsg] = useState<ReactNode | null>(null);
	const [isSubmitting, setIsSubmitting] = useState(false);

	const onSubmit = async (values: any, { setSubmitting }: any) => {
		if (isSubmitting) return;
		setIsSubmitting(true);
		setErrorMsg(null);

		try {
			if (note?.id) {
				await updateDashboardNote(note.id, values);
				showObjectSuccess("note", "saved");
			} else {
				await createDashboardNote(values);
				showObjectSuccess("note", "saved");
			}

			queryClient.invalidateQueries({ queryKey: ["dashboard-notes"] });
			remove();
		} catch (err: any) {
			setErrorMsg(<T id={err.message} />);
		} finally {
			setIsSubmitting(false);
			setSubmitting(false);
		}
	};

	return (
		<Dialog open={visible} onOpenChange={(open) => !open && remove()}>
			<DialogContent className="sm:max-w-[425px]">
				<DialogHeader>
					<DialogTitle className="flex items-center gap-2">
						<IconNote className="h-5 w-5" />
						<T id={note?.id ? "dashboard.notes.edit" : "dashboard.notes.add"} />
					</DialogTitle>
				</DialogHeader>

				<Formik
					initialValues={{
						content: note?.content || "",
						color: note?.color || "yellow",
						position: note?.position || 0,
					}}
					onSubmit={onSubmit}
				>
					{({ setFieldValue, errors, touched }: any) => (
						<Form className="space-y-4">
							{errorMsg && (
								<Alert variant="destructive">
									<AlertCircle className="h-4 w-4" />
									<AlertTitle>Error</AlertTitle>
									<AlertDescription>{errorMsg}</AlertDescription>
								</Alert>
							)}

							<div className="space-y-2">
								<Label htmlFor="content">
									<T id="dashboard.notes.content" />
								</Label>
								<Field name="content" validate={validateString(1, 65535)}>
									{({ field }: any) => (
										<Textarea
											{...field}
											id="content"
											placeholder={intl.formatMessage({
												id: "dashboard.notes.placeholder",
											})}
											className={cn(
												"min-h-[150px]",
												errors.content && touched.content ? "border-destructive" : "",
											)}
										/>
									)}
								</Field>
							</div>

							<div className="space-y-2">
								<Label htmlFor="color">
									<T id="dashboard.notes.color" />
								</Label>
								<Field name="color">
									{({ field }: any) => (
										<Select
											value={field.value}
											onValueChange={(val) => setFieldValue("color", val)}
										>
											<SelectTrigger>
												<SelectValue />
											</SelectTrigger>
											<SelectContent>
												{COLORS.map((c) => (
													<SelectItem key={c.value} value={c.value}>
														<div className="flex items-center gap-2">
															<div
																className={cn("w-4 h-4 rounded-full border", c.class)}
															/>
															{c.label}
														</div>
													</SelectItem>
												))}
											</SelectContent>
										</Select>
									)}
								</Field>
							</div>

							<DialogFooter>
								<Button type="button" variant="ghost" onClick={remove} disabled={isSubmitting}>
									<T id="cancel" />
								</Button>
								<Button type="submit" disabled={isSubmitting}>
									{isSubmitting ? "..." : <T id="save" />}
								</Button>
							</DialogFooter>
						</Form>
					)}
				</Formik>
			</DialogContent>
		</Dialog>
	);
});

export { DashboardNoteModal, showDashboardNoteModal };
