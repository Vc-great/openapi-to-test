declare module "@tanstack/react-query" {
  export interface QueryFunctionContext<TQueryKey extends readonly unknown[] = readonly unknown[]> {
    queryKey: TQueryKey;
    signal: AbortSignal;
  }

  export interface UseQueryOptions<TQueryFnData, TError, TData, TQueryKey extends readonly unknown[]> {
    queryKey?: TQueryKey;
    queryFn?: (context: QueryFunctionContext<TQueryKey>) => TQueryFnData | Promise<TQueryFnData>;
    select?: (data: TQueryFnData) => TData;
    enabled?: boolean;
  }

  export function queryOptions<TQueryFnData, TError, TData, TQueryKey extends readonly unknown[]>(
    options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  ): UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>;

  export function useQuery<TQueryFnData, TError, TData, TQueryKey extends readonly unknown[]>(
    options: UseQueryOptions<TQueryFnData, TError, TData, TQueryKey>,
  ): { data: TData | undefined; error: TError | null; queryKey: TQueryKey | undefined };
}
