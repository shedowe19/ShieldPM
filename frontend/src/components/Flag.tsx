import { IconWorld } from "@tabler/icons-react";
import BGFlag from "country-flag-icons/react/3x2/BG";
import CNFlag from "country-flag-icons/react/3x2/CN";
import DEFlag from "country-flag-icons/react/3x2/DE";
import ESFlag from "country-flag-icons/react/3x2/ES";
import GBFlag from "country-flag-icons/react/3x2/GB";
import ITFlag from "country-flag-icons/react/3x2/IT";
import JPFlag from "country-flag-icons/react/3x2/JP";
import KRFlag from "country-flag-icons/react/3x2/KR";
import NLFlag from "country-flag-icons/react/3x2/NL";
import PLFlag from "country-flag-icons/react/3x2/PL";
import RUFlag from "country-flag-icons/react/3x2/RU";
import SKFlag from "country-flag-icons/react/3x2/SK";
import VNFlag from "country-flag-icons/react/3x2/VN";

const localeFlags = {
	BG: BGFlag,
	CN: CNFlag,
	DE: DEFlag,
	ES: ESFlag,
	GB: GBFlag,
	IT: ITFlag,
	JP: JPFlag,
	KR: KRFlag,
	NL: NLFlag,
	PL: PLFlag,
	RU: RUFlag,
	SK: SKFlag,
	VN: VNFlag,
};

interface FlagProps {
	className?: string;
	countryCode: string;
}
function Flag({ className, countryCode }: FlagProps) {
	countryCode = countryCode.toUpperCase();
	if (countryCode === "EN") {
		return <IconWorld className={className} width={20} />;
	}

	if (Object.getOwnPropertyDescriptor(localeFlags, countryCode)) {
		const FlagElement = localeFlags[countryCode as keyof typeof localeFlags];
		return <FlagElement title={countryCode} className={className} style={{ width: 20 }} />;
	}
	console.error(`No flag for country ${countryCode} found!`);
	return null;
}

export { Flag };
