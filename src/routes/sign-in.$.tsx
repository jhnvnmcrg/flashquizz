import { ClerkFailed, SignIn } from '@clerk/tanstack-react-start'
import { createFileRoute } from '@tanstack/react-router'

import { Logo } from '#/components/app/logo'
import { useOnline } from '#/hooks/use-online'

export const Route = createFileRoute('/sign-in/$')({
  component: SignInPage,
})

function SignInPage() {
  const online = useOnline()
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12">
      <div className="text-center">
        <Logo className="text-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">Your PhLE reviewer. Sign in to continue.</p>
      </div>
      {online ? (
        <>
          <SignIn routing="path" path="/sign-in" forceRedirectUrl="/" />
          {/* The browser can claim to be online with no real connection. */}
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
      Signing in needs an internet connection. Connect, then reload this page.
    </p>
  )
}
