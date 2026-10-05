import { SignOutButton, useUser } from '@clerk/tanstack-react-start'
import { createFileRoute } from '@tanstack/react-router'
import { CopyIcon } from 'lucide-react'
import { toast } from 'sonner'

import { Logo } from '#/components/app/logo'
import { Button } from '#/components/ui/button'

export const Route = createFileRoute('/forbidden')({
  component: ForbiddenPage,
})

function ForbiddenPage() {
  const { user, isLoaded } = useUser()
  return (
    <div className="mx-auto flex min-h-dvh max-w-lg flex-col justify-center gap-6 px-4 py-12">
      <Logo />
      <div>
        <h1 className="text-2xl font-bold">You don’t have access yet</h1>
        <p className="mt-2 text-muted-foreground">
          FlashQuizz is invite-only. Ask the owner for an invitation, then sign up from the link in the email.
        </p>
        <p className="mt-2 text-sm text-muted-foreground">
          Setting up FlashQuizz yourself? Add the user ID below to{' '}
          <code className="rounded bg-secondary px-1.5 py-0.5 text-sm">ADMIN_CLERK_USER_IDS</code> in the environment
          and restart the server.
        </p>
      </div>
      {isLoaded && user ? (
        <div className="flex items-center gap-2 rounded-lg border bg-card p-3">
          <code className="min-w-0 flex-1 truncate text-sm">{user.id}</code>
          <Button
            variant="outline"
            size="sm"
            onClick={() => {
              navigator.clipboard.writeText(user.id)
              toast.success('User ID copied')
            }}
          >
            <CopyIcon /> Copy
          </Button>
        </div>
      ) : null}
      <SignOutButton redirectUrl="/sign-in">
        <Button variant="secondary" className="self-start">
          Sign out
        </Button>
      </SignOutButton>
    </div>
  )
}
