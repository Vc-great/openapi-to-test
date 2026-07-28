export interface RequestOptions {
  method?: string;
  url?: string;
  params?: unknown;
  data?: unknown;
  headers?: Record<string, string>;
}

export async function request<T>(
  options: RequestOptions,
): Promise<{ data: T }> {
  void options;
  throw new Error("The verification request client does not perform HTTP calls.");
}
