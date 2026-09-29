import { SignIn } from '@clerk/tanstack-react-start'
import { createFileRoute } from '@tanstack/react-router'

import { Logo } from '#/components/app/logo'

export const Route = createFileRoute('/sign-in/$')({
  component: SignInPage,
})

function SignInPage() {
  return (
    <div className="flex min-h-dvh flex-col items-center justify-center gap-8 px-4 py-12">
      <div className="text-center">
        <Logo className="text-foreground" />
        <p className="mt-2 text-sm text-muted-foreground">Your PhLE reviewer. Sign in to continue.</p>
      </div>
      <SignIn routing="path" path="/sign-in" forceRedirectUrl="/" />
    </div>
  )
}
