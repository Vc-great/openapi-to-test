import type { GetWidgetPathParams, GetWidgetQueryParams, GetWidgetResponse } from "./get-widget.types.ts";
import { request } from "../../../request.ts";
import type { RequestOptions } from "../../../request.ts";

/**
 * @summary Get a widget
 */
export async function getWidgetService(widgetId: GetWidgetPathParams['widgetId'], params?: GetWidgetQueryParams, requestConfig?: Partial<RequestOptions>) {
  const res = await request<GetWidgetResponse>({
    method: 'GET',
    url: `/widgets/${widgetId}`,
    params,
    ...requestConfig
  });
  return res.data;
}
