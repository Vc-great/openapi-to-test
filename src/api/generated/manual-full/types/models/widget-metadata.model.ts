import type { AuditMetadataModel } from "./audit-metadata.model.ts";
export interface WidgetMetadataModel {
  labels: Array<string>;
  owner?: string;
  audit: AuditMetadataModel;
}
