import { IconNote, IconPlus, IconTrash } from "@tabler/icons-react";
import { useQueryClient } from "@tanstack/react-query";
import { Loader2 } from "lucide-react";
import type React from "react";
import { deleteDashboardNote } from "src/api/backend";
import { Button } from "src/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "src/components/ui/card";
import { useDashboardNotes } from "src/hooks/useDashboardNotes";
import { cn } from "src/lib/utils";
import { intl, T } from "src/locale";
import { showObjectSuccess } from "src/notifications";
import { showDashboardNoteModal } from "./lazy";

const COLOR_MAP: Record<string, string> = {
	yellow: "bg-yellow-200/50 dark:bg-yellow-900/20 border-yellow-200 dark:border-yellow-900/50",
	blue: "bg-blue-200/50 dark:bg-blue-900/20 border-blue-200 dark:border-blue-900/50",
	green: "bg-green-200/50 dark:bg-green-900/20 border-green-200 dark:border-green-900/50",
	red: "bg-red-200/50 dark:bg-red-900/20 border-red-200 dark:border-red-900/50",
	purple: "bg-purple-200/50 dark:bg-purple-900/20 border-purple-200 dark:border-purple-900/50",
	gray: "bg-gray-200/50 dark:bg-gray-800/50 border-gray-200 dark:border-gray-800",
};

export const DashboardNotesWidget = () => {
	const { data: notes, isLoading } = useDashboardNotes();
	const queryClient = useQueryClient();

	const handleDelete = async (e: React.MouseEvent, id: number) => {
		e.stopPropagation();
		if (confirm("Are you sure?")) {
			await deleteDashboardNote(id);
			showObjectSuccess("note", "deleted");
			queryClient.invalidateQueries({ queryKey: ["dashboard-notes"] });
		}
	};

	return (
		<Card className="h-full border-dashed relative min-h-[300px]">
			<CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
				<CardTitle className="text-xl font-bold flex items-center gap-2">
					<IconNote className="h-5 w-5" />
					<T id="dashboard.notes.title" />
				</CardTitle>
				<Button
					size="sm"
					variant="ghost"
					className="h-8 w-8 p-0"
					aria-label={intl.formatMessage({ id: "dashboard.notes.add" })}
					onClick={() => showDashboardNoteModal()}
				>
					<IconPlus className="h-5 w-5" />
				</Button>
			</CardHeader>
			<CardContent className="pt-4 h-full">
				{isLoading ? (
					<div className="flex justify-center items-center h-40">
						<Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
					</div>
				) : notes && notes.length > 0 ? (
					<div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
						{notes.map((note) => {
							const contentId = `dashboard-note-${note.id}-content`;
							const editActionId = `dashboard-note-${note.id}-edit-action`;
							const deleteActionId = `dashboard-note-${note.id}-delete-action`;

							return (
								<div
									key={note.id}
									className={cn(
										"p-4 rounded-lg border shadow-sm transition-all hover:shadow-md relative group",
										COLOR_MAP[note.color || "yellow"],
									)}
								>
									<button
										type="button"
										className="absolute inset-0 cursor-pointer rounded-lg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring focus-visible:ring-offset-2"
										aria-labelledby={`${editActionId} ${contentId}`}
										onClick={() => showDashboardNoteModal(note)}
									>
										<span id={editActionId} className="sr-only">
											<T id="action.edit" />
										</span>
									</button>
									<div
										id={contentId}
										className="relative pointer-events-none whitespace-pre-wrap break-all text-sm font-medium leading-relaxed"
									>
										{note.content}
									</div>

									<div className="absolute top-2 right-2 z-10 opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 transition-opacity">
										<Button
											variant="ghost"
											size="icon"
											className="h-6 w-6 hover:bg-destructive/20 hover:text-destructive"
											aria-labelledby={`${deleteActionId} ${contentId}`}
											onClick={(e) => handleDelete(e, note.id)}
										>
											<span id={deleteActionId} className="sr-only">
												<T id="action.delete" />
											</span>
											<IconTrash className="h-3 w-3" />
										</Button>
									</div>
								</div>
							);
						})}
					</div>
				) : (
					<div className="flex flex-col items-center justify-center h-40 text-muted-foreground border-2 border-dashed rounded-lg">
						<IconNote className="h-8 w-8 mb-2 opacity-50" />
						<p className="text-sm">
							<T id="dashboard.notes.empty" />
						</p>
						<Button variant="link" className="mt-2" onClick={() => showDashboardNoteModal()}>
							<T id="dashboard.notes.add" />
						</Button>
					</div>
				)}
			</CardContent>
		</Card>
	);
};
