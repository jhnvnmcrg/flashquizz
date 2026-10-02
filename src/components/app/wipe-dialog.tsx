import { TriangleAlertIcon } from 'lucide-react'
import { useEffect, useState } from 'react'

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '#/components/ui/alert-dialog'
import { countPending } from '#/offline/db'

/** Confirms removing the device copy, and says what would be lost if anything is unsynced. */
export function WipeDialog({
  open,
  onOpenChange,
  title,
  actionLabel,
  onConfirm,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  title: string
  actionLabel: string
  onConfirm: () => void
}) {
  const [unsynced, setUnsynced] = useState(0)
  useEffect(() => {
    if (!open) return
    countPending()
      .then((p) => setUnsynced(p.total))
      .catch(() => setUnsynced(0))
  }, [open])

  return (
    <AlertDialog open={open} onOpenChange={onOpenChange}>
      <AlertDialogContent>
        <AlertDialogHeader>
          <AlertDialogTitle>{title}</AlertDialogTitle>
          <AlertDialogDescription>
            This deletes the question bank, images and your progress copy from this device. Everything already synced
            stays safe on the server.
          </AlertDialogDescription>
        </AlertDialogHeader>
        {unsynced > 0 ? (
          <p className="flex gap-2 rounded-lg border border-warning/50 bg-warning-soft px-3 py-2 text-sm text-warning-foreground">
            <TriangleAlertIcon className="mt-0.5 size-4 shrink-0" aria-hidden />
            {unsynced === 1 ? '1 change' : `${unsynced} changes`} made on this device haven’t synced yet and will be
            lost. Connect and sync first to keep {unsynced === 1 ? 'it' : 'them'}.
          </p>
        ) : null}
        <AlertDialogFooter>
          <AlertDialogCancel>Cancel</AlertDialogCancel>
          <AlertDialogAction variant="destructive" onClick={onConfirm}>
            {actionLabel}
          </AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  )
}
