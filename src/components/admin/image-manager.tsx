import { useMutation } from '@tanstack/react-query'
import { useServerFn } from '@tanstack/react-start'
import { Trash2Icon, UploadIcon } from 'lucide-react'
import { useRef, useState } from 'react'
import { toast } from 'sonner'

import { GatedImg } from '#/components/question/question-image'
import { Button } from '#/components/ui/button'
import { Input } from '#/components/ui/input'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import type { ChoiceKey, ImageRole } from '#/lib/schemas/enums'
import { deleteQuestionImage, updateQuestionImage, uploadQuestionImage } from '#/server/images.functions'

type Img = { id: number; role: ImageRole; choiceKey: string | null; alt: string; width: number | null; height: number | null }

const ROLE_LABEL: Record<ImageRole, string> = { stem: 'With the question', choice: 'As a choice', rationale: 'With the rationale' }

/** Resize to at most 1600px wide and re-encode as WebP before upload. */
async function prepare(file: File) {
  const bitmap = await createImageBitmap(file)
  const scale = Math.min(1, 1600 / bitmap.width)
  const canvas = document.createElement('canvas')
  canvas.width = Math.round(bitmap.width * scale)
  canvas.height = Math.round(bitmap.height * scale)
  const ctx = canvas.getContext('2d')
  if (!ctx) throw new Error('Your browser can’t process images')
  ctx.fillStyle = '#fff'
  ctx.fillRect(0, 0, canvas.width, canvas.height)
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height)
  const blob = await new Promise<Blob>((resolve, reject) =>
    canvas.toBlob((b) => (b ? resolve(b) : reject(new Error('Could not encode image'))), 'image/webp', 0.9),
  )
  return { blob, width: canvas.width, height: canvas.height }
}

export function ImageManager({
  questionId,
  images,
  choiceKeys,
  onChange,
}: {
  questionId: number
  images: Img[]
  choiceKeys: ChoiceKey[]
  onChange: () => void
}) {
  const input = useRef<HTMLInputElement>(null)
  const [role, setRole] = useState<ImageRole>('stem')
  const [alt, setAlt] = useState('')
  const upload = useServerFn(uploadQuestionImage)
  const update = useServerFn(updateQuestionImage)
  const remove = useServerFn(deleteQuestionImage)

  const uploadMutation = useMutation({
    mutationFn: async (file: File) => {
      const { blob, width, height } = await prepare(file)
      const fd = new FormData()
      fd.set('file', new File([blob], 'image.webp', { type: 'image/webp' }))
      fd.set('questionId', String(questionId))
      fd.set('role', role)
      fd.set('alt', alt)
      fd.set('width', String(width))
      fd.set('height', String(height))
      return upload({ data: fd })
    },
    onSuccess: () => {
      toast.success('Image added')
      setAlt('')
      onChange()
    },
    onError: (e) => toast.error(e.message),
  })
  const updateMutation = useMutation({ mutationFn: update, onSuccess: onChange, onError: (e) => toast.error(e.message) })
  const removeMutation = useMutation({
    mutationFn: remove,
    onSuccess: () => {
      toast.success('Image removed')
      onChange()
    },
    onError: (e) => toast.error(e.message),
  })

  return (
    <fieldset className="space-y-4 rounded-2xl border bg-card p-5">
      <legend className="sr-only">Images</legend>
      <div>
        <h3 className="font-bold">Images</h3>
        <p className="text-sm text-muted-foreground">Structures, prescriptions or figures. Stored privately with the question.</p>
      </div>
      {images.length ? (
        <ul className="grid gap-3 sm:grid-cols-2">
          {images.map((img) => (
            <li key={img.id} className="space-y-2 rounded-xl border p-3">
              <GatedImg id={img.id} alt={img.alt} className="mx-auto max-h-40 w-auto rounded bg-white object-contain" />
              <div className="flex gap-2">
                <Select
                  value={img.role === 'choice' && img.choiceKey ? `choice:${img.choiceKey}` : img.role}
                  onValueChange={(v) => {
                    const [r, k] = v.split(':')
                    updateMutation.mutate({ data: { id: img.id, role: r as ImageRole, choiceKey: (k as ChoiceKey) ?? null, alt: img.alt } })
                  }}
                >
                  <SelectTrigger aria-label="Where the image shows" className="h-8 flex-1 text-xs">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="stem">{ROLE_LABEL.stem}</SelectItem>
                    <SelectItem value="rationale">{ROLE_LABEL.rationale}</SelectItem>
                    {choiceKeys.map((k) => (
                      <SelectItem key={k} value={`choice:${k}`}>
                        As choice {k}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <Button
                  type="button"
                  size="icon"
                  variant="ghost"
                  aria-label="Remove image"
                  onClick={() => removeMutation.mutate({ data: { id: img.id } })}
                >
                  <Trash2Icon />
                </Button>
              </div>
              {img.alt ? <p className="text-xs text-muted-foreground">{img.alt}</p> : null}
            </li>
          ))}
        </ul>
      ) : null}
      <div className="grid gap-3 sm:grid-cols-[1fr_12rem_auto] sm:items-end">
        <div className="space-y-1.5">
          <Label htmlFor="img-alt">Description</Label>
          <Input id="img-alt" value={alt} onChange={(e) => setAlt(e.target.value)} placeholder="e.g. Structure of cisplatin" />
        </div>
        <div className="space-y-1.5">
          <Label htmlFor="img-role">Show it</Label>
          <Select value={role} onValueChange={(v) => setRole(v as ImageRole)}>
            <SelectTrigger id="img-role" className="w-full">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="stem">{ROLE_LABEL.stem}</SelectItem>
              <SelectItem value="rationale">{ROLE_LABEL.rationale}</SelectItem>
            </SelectContent>
          </Select>
        </div>
        <Button type="button" variant="outline" disabled={uploadMutation.isPending} onClick={() => input.current?.click()}>
          <UploadIcon /> {uploadMutation.isPending ? 'Uploading…' : 'Upload image'}
        </Button>
        <input
          ref={input}
          type="file"
          accept="image/png,image/jpeg,image/webp"
          className="hidden"
          onChange={(e) => {
            const file = e.target.files?.[0]
            if (file) uploadMutation.mutate(file)
            e.target.value = ''
          }}
        />
      </div>
    </fieldset>
  )
}
