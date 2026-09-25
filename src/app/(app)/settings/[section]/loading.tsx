import { SettingsBones } from "@/components/settings/bones";

/** The same page as every section: the list solid at no entry in particular, since the address is not known here. */
export default function SettingsSectionLoading() {
  return <SettingsBones current={-1} />;
}
