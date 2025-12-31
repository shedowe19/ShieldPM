import { download } from "./base";

export function downloadRootCa() {
	return download({ url: "/nginx/certificates/root-ca" }, "root_ca.crt");
}
