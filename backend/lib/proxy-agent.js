import { protocols } from "get-uri";
import { ProxyAgent } from "proxy-agent";
import { getFtpUri } from "./ftp-uri.js";

// Public get-uri protocol registry shared with pac-proxy-agent. Other PAC
// schemes keep their upstream handlers; all ShieldPM consumers use this facade.
protocols.ftp = getFtpUri;

export { ProxyAgent };
