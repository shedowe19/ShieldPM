import { IconPackages } from "@tabler/icons-react";
import { useEffect } from "react";
import { Header } from "src/components";
import { useWasmModules } from "src/hooks";
import { T, useTranslator } from "src/locale";
import TableWrapper from "./TableWrapper";

export default function WasmModules() {
	const { data, isFetching } = useWasmModules();
	const t = useTranslator();

	useEffect(() => {
		document.title = `${t("pages.nginx.wasmModules.title")} - ShieldPM`;
	}, [t]);

	return (
		<div className="flex flex-col h-full overflow-hidden">
			<Header title={<T id="pages.nginx.wasmModules.title" />} icon={IconPackages} />
			<div className="px-6 pb-6 h-full flex flex-col overflow-hidden">
				<TableWrapper data={data} isLoading={isFetching} />
			</div>
		</div>
	);
}
