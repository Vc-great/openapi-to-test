
export const widgetDetailsCategoryEnum = {
  basic: { label: 'basic', value: 'basic' },
  premium: { label: 'premium', value: 'premium' }
} as const;

export type WidgetDetailsCategoryEnumValue = (typeof widgetDetailsCategoryEnum)[keyof typeof widgetDetailsCategoryEnum]['value'];

export type WidgetDetailsCategoryEnumItem = (typeof widgetDetailsCategoryEnum)[keyof typeof widgetDetailsCategoryEnum];

export const widgetStatusEnum = {
  active: { label: 'active', value: 'active' },
  archived: { label: 'archived', value: 'archived' }
} as const;

export type WidgetStatusEnumValue = (typeof widgetStatusEnum)[keyof typeof widgetStatusEnum]['value'];

export type WidgetStatusEnumItem = (typeof widgetStatusEnum)[keyof typeof widgetStatusEnum];

export const createWidgetRequestStatusEnum = widgetStatusEnum;

export type CreateWidgetRequestStatusEnumValue = (typeof createWidgetRequestStatusEnum)[keyof typeof createWidgetRequestStatusEnum]['value'];

export type CreateWidgetRequestStatusEnumItem = (typeof createWidgetRequestStatusEnum)[keyof typeof createWidgetRequestStatusEnum];
