import type { UserscriptMeta } from "./userscript";

export type ScriptEntry = {
  name: string;
  entry: string;
  meta: UserscriptMeta;
  readme: string;
};
