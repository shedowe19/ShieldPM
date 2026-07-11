import { useEffect, useState } from "react";

function useObjectUrl(blob: Blob | null) {
	const [objectUrl, setObjectUrl] = useState<string | undefined>();

	useEffect(() => {
		if (!blob) {
			setObjectUrl(undefined);
			return;
		}

		const url = URL.createObjectURL(blob);
		setObjectUrl(url);

		return () => URL.revokeObjectURL(url);
	}, [blob]);

	return objectUrl;
}

export { useObjectUrl };
