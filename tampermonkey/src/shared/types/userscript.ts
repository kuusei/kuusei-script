export type UserscriptMeta = {
  name: string;
  namespace: string;
  version: string;
  updatedAt?: string;
  description: string;
  author: string;
  icon?: string;
  license?: string;
  match: string[];
  grant: string[];
  connect?: string[];
  homepageURL?: string;
  downloadURL?: string;
  updateURL?: string;
  runAt?: "document-start" | "document-body" | "document-end" | "document-idle";
};
