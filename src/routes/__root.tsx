import { TanStackDevtools } from '@tanstack/react-devtools'
import type { QueryClient } from '@tanstack/react-query'
import { createRootRouteWithContext, HeadContent, Scripts } from '@tanstack/react-router'
import { TanStackRouterDevtoolsPanel } from '@tanstack/react-router-devtools'
import type { ReactNode } from 'react'

import { Toaster } from '#/components/ui/sonner'
import { TooltipProvider } from '#/components/ui/tooltip'
import { themeScript } from '#/hooks/use-theme'
import ClerkProvider from '../integrations/clerk/provider'
import TanStackQueryDevtools from '../integrations/tanstack-query/devtools'
import appCss from '../styles.css?url'

interface MyRouterContext {
  queryClient: QueryClient
}

declare module '@tanstack/react-router' {
  interface StaticDataRouteOption {
    /** 'focus' hides the main navigation (study sessions, exams). */
    chrome?: 'focus'
  }
}

export const Route = createRootRouteWithContext<MyRouterContext>()({
  head: () => ({
    meta: [
      { charSet: 'utf-8' },
      { name: 'viewport', content: 'width=device-width, initial-scale=1, viewport-fit=cover' },
      { name: 'robots', content: 'noindex, nofollow' },
      { name: 'theme-color', content: '#f6f8f9' },
      { title: 'FlashQuizz' },
    ],
    links: [
      { rel: 'preconnect', href: 'https://fonts.googleapis.com' },
      { rel: 'preconnect', href: 'https://fonts.gstatic.com', crossOrigin: 'anonymous' },
      { rel: 'stylesheet', href: appCss },
      { rel: 'icon', href: '/favicon.svg', type: 'image/svg+xml' },
    ],
    scripts: [{ children: themeScript }],
  }),
  shellComponent: RootDocument,
})

function RootDocument({ children }: { children: ReactNode }) {
  return (
    <html lang="en" suppressHydrationWarning>
      <head>
        <HeadContent />
      </head>
      <body>
        <ClerkProvider>
          <TooltipProvider delayDuration={300}>{children}</TooltipProvider>
          <Toaster position="top-center" />
          {import.meta.env.DEV ? (
            <TanStackDevtools
              config={{ position: 'bottom-right' }}
              plugins={[
                { name: 'Tanstack Router', render: <TanStackRouterDevtoolsPanel /> },
                TanStackQueryDevtools,
              ]}
            />
          ) : null}
        </ClerkProvider>
        <Scripts />
      </body>
    </html>
  )
}
