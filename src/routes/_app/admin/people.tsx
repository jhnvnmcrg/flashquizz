import { useMutation, useQueryClient, useSuspenseQuery } from '@tanstack/react-query'
import { createFileRoute } from '@tanstack/react-router'
import { MailIcon, SendIcon } from 'lucide-react'
import { type FormEvent, useState } from 'react'
import { toast } from 'sonner'
import { z } from 'zod'

import { Badge } from '#/components/ui/badge'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { peopleQuery } from '#/queries'
import { invitePerson, revokeInvitation, setAccess } from '#/server/people.functions'

export const Route = createFileRoute('/_app/admin/people')({
  loader: ({ context }) => context.queryClient.ensureQueryData(peopleQuery),
  head: () => ({ meta: [{ title: 'People · FlashQuizz' }] }),
  component: PeoplePage,
})

const relative = new Intl.RelativeTimeFormat('en', { numeric: 'auto' })
function lastActive(at: number | null) {
  if (!at) return 'Never signed in'
  const days = Math.round((Date.now() - at) / 86_400_000)
  return `Active ${days < 1 ? 'today' : relative.format(-days, 'day')}`
}

function useChange<T>(fn: (args: { data: T }) => Promise<unknown>, message: string) {
  const qc = useQueryClient()
  return useMutation({
    mutationFn: fn,
    onSuccess: () => {
      toast.success(message)
      void qc.invalidateQueries({ queryKey: peopleQuery.queryKey })
    },
    onError: (e) => toast.error(e.message),
  })
}

function PeoplePage() {
  const { data } = useSuspenseQuery(peopleQuery)
  return (
    <div className="max-w-3xl space-y-8">
      <p className="text-muted-foreground">
        FlashQuizz is invite-only. Invited people sign up from the email and study the same question bank with their own
        progress, sessions and bookmarks. Only you can edit the question bank.
      </p>
      <InviteForm />
      {data.invitations.length ? (
        <section className="space-y-3">
          <h2 className="text-xl font-bold">Waiting to sign up</h2>
          <ul className="divide-y rounded-2xl border bg-card">
            {data.invitations.map((i) => (
              <InvitationRow key={i.id} invitation={i} />
            ))}
          </ul>
        </section>
      ) : null}
      <section className="space-y-3">
        <h2 className="text-xl font-bold">People</h2>
        <ul className="divide-y rounded-2xl border bg-card">
          {data.people.map((p) => (
            <PersonRow key={p.id} person={p} />
          ))}
        </ul>
      </section>
    </div>
  )
}

const emailSchema = z.email()

function InviteForm() {
  const [email, setEmail] = useState('')
  const [error, setError] = useState<string | null>(null)
  const invite = useChange(invitePerson, 'Invitation sent')

  const submit = (e: FormEvent) => {
    e.preventDefault()
    const value = email.trim()
    if (!emailSchema.safeParse(value).success) {
      setError('Enter an email address, like name@example.com.')
      return
    }
    setError(null)
    invite.mutate({ data: { email: value } }, { onSuccess: () => setEmail('') })
  }

  return (
    <form onSubmit={submit} noValidate className="space-y-2 rounded-2xl border bg-card p-4">
      <Label htmlFor="invite-email">Invite someone</Label>
      <div className="flex flex-col gap-2 sm:flex-row">
        <Input
          id="invite-email"
          type="email"
          autoComplete="off"
          placeholder="name@example.com"
          value={email}
          onChange={(e) => setEmail(e.target.value)}
          aria-invalid={error ? true : undefined}
          aria-describedby={error ? 'invite-error' : undefined}
          className="sm:max-w-sm"
        />
        <Button type="submit" disabled={invite.isPending}>
          <SendIcon /> {invite.isPending ? 'Sending…' : 'Send invitation'}
        </Button>
      </div>
      {error ? (
        <p id="invite-error" className="text-sm text-destructive">
          {error}
        </p>
      ) : null}
    </form>
  )
}

type Data = Awaited<ReturnType<NonNullable<typeof peopleQuery.queryFn>>>

function InvitationRow({ invitation }: { invitation: Data['invitations'][number] }) {
  const revoke = useChange(revokeInvitation, 'Invitation cancelled')
  return (
    <li className="flex items-center gap-3 px-4 py-3">
      <MailIcon className="size-4 shrink-0 text-muted-foreground" aria-hidden />
      <span className="min-w-0 flex-1 truncate">{invitation.email}</span>
      <Button
        variant="ghost"
        size="sm"
        disabled={revoke.isPending}
        onClick={() => revoke.mutate({ data: { id: invitation.id } })}
      >
        Cancel
      </Button>
    </li>
  )
}

const ACCESS_LABEL = { admin: 'Admin', member: 'Member', none: 'No access' } as const

function PersonRow({ person }: { person: Data['people'][number] }) {
  const change = useChange(setAccess, person.access === 'member' ? 'Access removed' : 'Access given')
  return (
    <li className="flex flex-col gap-2 px-4 py-3 sm:flex-row sm:items-center sm:gap-4">
      <div className="min-w-0 flex-1">
        <p className="truncate font-semibold">
          {person.name ?? person.email ?? person.id}
          {person.isYou ? <span className="font-normal text-muted-foreground"> (you)</span> : null}
        </p>
        <p className="truncate text-sm text-muted-foreground">
          {person.name && person.email ? `${person.email} · ` : ''}
          {lastActive(person.lastActiveAt)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Badge variant={person.access === 'none' ? 'outline' : 'secondary'}>
          {person.removed ? 'Removed' : ACCESS_LABEL[person.access]}
        </Badge>
        {person.access === 'admin' ? null : (
          <Button
            variant="outline"
            size="sm"
            disabled={change.isPending}
            onClick={() =>
              change.mutate({ data: { userId: person.id, access: person.access === 'member' ? 'removed' : 'member' } })
            }
          >
            {person.access === 'member' ? 'Remove access' : 'Give access'}
          </Button>
        )}
      </div>
    </li>
  )
}
