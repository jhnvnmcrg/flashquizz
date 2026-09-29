import { useEffect, useState } from 'react'

import { cn } from '#/lib/utils'
import type { ImageMeta } from '#/server/question-payload.server'

/**
 * Owner-gated image URL. In `vite dev`, Nitro treats <img> requests
 * (Sec-Fetch-Dest: image) as static assets and never reaches the app route,
 * so dev loads the bytes with fetch() and shows a blob URL instead.
 */
export function useImageSrc(id: number) {
  const direct = `/api/images/${id}`
  const [src, setSrc] = useState<string | null>(import.meta.env.DEV ? null : direct)
  useEffect(() => {
    if (!import.meta.env.DEV) return
    let url: string | null = null
    let cancelled = false
    fetch(direct)
      .then((r) => (r.ok ? r.blob() : null))
      .then((blob) => {
        if (blob && !cancelled) {
          url = URL.createObjectURL(blob)
          setSrc(url)
        }
      })
      .catch(() => undefined)
    return () => {
      cancelled = true
      if (url) URL.revokeObjectURL(url)
    }
  }, [direct])
  return src
}

export function GatedImg({
  id,
  alt,
  className,
  width,
  height,
}: {
  id: number
  alt: string
  className?: string
  width?: number
  height?: number
}) {
  const src = useImageSrc(id)
  if (!src) return <span aria-hidden className={cn('block min-h-24 animate-pulse rounded bg-secondary', className)} />
  return <img src={src} alt={alt} loading="lazy" decoding="async" width={width} height={height} className={className} />
}

export function QuestionImage({ image, className }: { image: ImageMeta; className?: string }) {
  return (
    <figure className={cn('overflow-hidden rounded-md border bg-white p-2', className)}>
      <GatedImg
        id={image.id}
        alt={image.alt || 'Question figure'}
        width={image.width ?? undefined}
        height={image.height ?? undefined}
        className="mx-auto h-auto max-h-80 w-auto max-w-full object-contain"
      />
      {image.alt ? <figcaption className="mt-1.5 text-center text-xs text-slate-500">{image.alt}</figcaption> : null}
    </figure>
  )
}

export function ImageRow({ images, className }: { images: ImageMeta[]; className?: string }) {
  if (!images.length) return null
  return (
    <div className={cn('grid gap-3', images.length > 1 && 'sm:grid-cols-2', className)}>
      {images.map((img) => (
        <QuestionImage key={img.id} image={img} />
      ))}
    </div>
  )
}
