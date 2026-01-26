import { AlertTriangle } from "lucide-react";

interface NoteWarningProps {
	content?: string | null;
}

const NoteWarning = ({ content }: NoteWarningProps) => {
	if (!content) return null;

	return (
		<div className="mb-4 rounded-md border-l-4 border-yellow-400 bg-yellow-50 p-4 dark:bg-yellow-900/20">
			<div className="flex">
				<div className="flex-shrink-0">
					<AlertTriangle className="h-5 w-5 text-yellow-400" aria-hidden="true" />
				</div>
				<div className="ml-3">
					<p className="text-sm text-yellow-700 dark:text-yellow-200 whitespace-pre-wrap">{content}</p>
				</div>
			</div>
		</div>
	);
};

export default NoteWarning;
