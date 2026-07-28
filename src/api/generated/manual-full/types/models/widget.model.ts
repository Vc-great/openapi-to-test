import type { WidgetMetadataModel } from "./widget-metadata.model.ts";
import type { WidgetDetailsModel } from "./widget-details.model.ts";
import type { WidgetStatusEnumValue } from "../enum.model.ts";
export interface WidgetModel {
  id: string;
  name: string;
  status: WidgetStatusEnumValue;
  tags: Array<string>;
  metadata: WidgetMetadataModel;
  details: WidgetDetailsModel;
}
