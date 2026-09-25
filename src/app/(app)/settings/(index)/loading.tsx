import { SettingsBones } from "@/components/settings/bones";

/** The profile card and folded cards on a phone; the section list and Profile on a desktop. */
export default function SettingsLoading() {
  return <SettingsBones current={0} rows={1} />;
}
