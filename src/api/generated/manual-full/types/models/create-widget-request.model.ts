import type { WidgetMetadataModel } from "./widget-metadata.model.ts";
import type { WidgetDetailsModel } from "./widget-details.model.ts";
import type { CreateWidgetRequestStatusEnumValue } from "../enum.model.ts";
export interface CreateWidgetRequestModel {
  name: string;
  status: CreateWidgetRequestStatusEnumValue;
  tags: Array<string>;
  metadata: WidgetMetadataModel;
  details: WidgetDetailsModel;
}
