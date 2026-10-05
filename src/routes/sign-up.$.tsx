import { ClerkFailed, SignUp } from '@clerk/tanstack-react-start'
import { createFileRoute } from '@tanstack/react-router'
import { useEffect } from 'react'

import { Logo } from '#/components/app/logo'
import { useOnline } from '#/hooks/use-online'
import { clearLease } from '#/offline/auth'

/** Where invitation emails land (FlashQuizz is invite-only; Clerk refuses sign-ups without one). */
export const Route = createFileRoute('/sign-up/$')({
  head: () => ({ meta: [{ title: 'Join · FlashQuizz' }] }),
  component: SignUpPage,
})

function SignUpPage() {
  const online = useOnline()
  useEffect(() => {
    // Whoever signs up here, the next visit checks with the server before opening a copy.
    if (navigator.onLine) void clearLease().catch(() => undefined)
  }, [])
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12">
      <div className="text-center">
        <Logo className="text-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">You’ve been invited to FlashQuizz, a PhLE reviewer.</p>
      </div>
      {online ? (
        <>
          <SignUp routing="path" path="/sign-up" signInUrl="/sign-in" forceRedirectUrl="/" />
          <ClerkFailed>
            <NeedsConnection />
          </ClerkFailed>
        </>
      ) : (
        <NeedsConnection />
      )}
    </div>
  )
}

function NeedsConnection() {
  return (
    <p className="max-w-sm rounded-xl border bg-card px-5 py-4 text-center text-muted-foreground">
      Signing up needs an internet connection. Connect, then reload this page.
    </p>
  )
}
