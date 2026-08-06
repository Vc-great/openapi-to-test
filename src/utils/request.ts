import axios, { type AxiosRequestConfig, type AxiosResponse } from "axios";

export function request<T = unknown, R = AxiosResponse<T>, D = unknown>(
  config: AxiosRequestConfig<D>,
): Promise<R> {
  return axios.request<T, R, D>(config) as Promise<R>;
}
