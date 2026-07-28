import type { WidgetModel } from "../types/models/widget.model.ts";
export type GetWidgetPathParams = {
  /**
   * @descriptionUnique widget identifier
   */
  widgetId: string;
};
export type GetWidgetQueryParams = {
  /**
   * @descriptionInclude extended details in the response
   */
  includeDetails?: boolean;
};
/**
 * @description The requested widget
 */
export type GetWidgetResponse = WidgetModel;
export type GetWidgetResponseError = unknown;
