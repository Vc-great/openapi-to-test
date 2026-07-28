import type { CreateWidgetMutationRequest, CreateWidgetMutationResponse } from "./create-widget.types.ts";
import { request } from "../../../request.ts";
import type { RequestOptions } from "../../../request.ts";

/**
 * @summary Create a widget
 */
export async function createWidgetService(data: CreateWidgetMutationRequest, requestConfig?: Partial<RequestOptions>) {
  const res = await request<CreateWidgetMutationResponse>({
    method: 'POST',
    url: '/widgets',
    data,
    ...requestConfig
  });
  return res.data;
}
