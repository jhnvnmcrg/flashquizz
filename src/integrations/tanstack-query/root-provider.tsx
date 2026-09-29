import { QueryClient } from '@tanstack/react-query'
import { isRedirect } from '@tanstack/react-router'

export function getContext() {
  const queryClient = new QueryClient({
    defaultOptions: {
      queries: {
        staleTime: 30_000,
        refetchOnWindowFocus: false,
        retry: (count, error) => !isRedirect(error) && count < 2,
      },
    },
  })

  return {
    queryClient,
  }
}
