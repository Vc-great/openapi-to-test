import type { CreateWidgetRequestModel } from "../types/models/create-widget-request.model.ts";
import type { WidgetModel } from "../types/models/widget.model.ts";
export type CreateWidgetMutationRequest = CreateWidgetRequestModel;
/**
 * @description The created widget
 */
export type CreateWidgetMutationResponse = WidgetModel;
export type CreateWidgetResponseError = unknown;
