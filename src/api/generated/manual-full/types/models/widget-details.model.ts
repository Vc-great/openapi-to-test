import type { WidgetDetailsCategoryEnumValue } from "../enum.model.ts";
export interface WidgetDetailsModel {
  category: WidgetDetailsCategoryEnumValue;
  /**
   * @minimum 0 - stockCount≥0
   */
  stockCount: number;
}
