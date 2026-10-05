import { useClerk, useUser } from '@clerk/tanstack-react-start'
import { Link } from '@tanstack/react-router'
import { CloudDownloadIcon, LogOutIcon, UserIcon } from 'lucide-react'
import { useState } from 'react'

import { Button } from '#/components/ui/button'
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuLabel,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '#/components/ui/dropdown-menu'
import { wipeLocalData } from '#/offline/auth'

import { WipeDialog } from './wipe-dialog'

/**
 * Replaces Clerk's UserButton: works offline (Clerk's UI needs a connection),
 * and signing out also removes the device copy.
 */
export function AccountMenu() {
  const { user } = useUser()
  const clerk = useClerk()
  const [confirming, setConfirming] = useState(false)
  const email = user?.primaryEmailAddress?.emailAddress
  const initial = (user?.firstName ?? email ?? '').slice(0, 1).toUpperCase()

  const signOut = async () => {
    await wipeLocalData()
    if (navigator.onLine && clerk.loaded) await clerk.signOut({ redirectUrl: '/sign-in' })
    else window.location.assign('/sign-in')
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="ghost" size="icon" className="rounded-full" aria-label="Account">
            {initial ? (
              <span className="grid size-8 place-items-center rounded-full bg-primary/10 text-sm font-bold text-primary">
                {initial}
              </span>
            ) : (
              <UserIcon />
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-64">
          <DropdownMenuLabel className="font-normal">
            <span className="block text-sm font-semibold">{user?.fullName || 'Your account'}</span>
            {email ? <span className="block truncate text-xs text-muted-foreground">{email}</span> : null}
          </DropdownMenuLabel>
          <DropdownMenuSeparator />
          <DropdownMenuItem asChild>
            <Link to="/offline">
              <CloudDownloadIcon /> Offline &amp; sync
            </Link>
          </DropdownMenuItem>
          <DropdownMenuSeparator />
          <DropdownMenuItem onSelect={() => setConfirming(true)}>
            <LogOutIcon /> Sign out
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>
      <WipeDialog
        open={confirming}
        onOpenChange={setConfirming}
        title="Sign out of FlashQuizz?"
        actionLabel="Sign out and remove"
        onConfirm={() => void signOut()}
      />
    </>
  )
}
