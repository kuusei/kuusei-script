export type UserscriptMeta = {
  name: string;
  namespace: string;
  version: string;
  description: string;
  author: string;
  match: string[];
  grant: string[];
  connect?: string[];
  downloadURL?: string;
  updateURL?: string;
  runAt?: "document-start" | "document-body" | "document-end" | "document-idle";
};
