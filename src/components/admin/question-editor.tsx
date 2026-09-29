import { useForm } from '@tanstack/react-form'
import { PlusIcon, Trash2Icon } from 'lucide-react'
import type { ReactNode } from 'react'

import { ChoiceList } from '#/components/question/choice-list'
import { moduleStyle } from '#/components/question/module-tag'
import { QuestionBody } from '#/components/question/question-view'
import { RationalePanel } from '#/components/question/rationale-panel'
import { Button } from '#/components/ui/button'
import { Checkbox } from '#/components/ui/checkbox'
import { Label } from '#/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '#/components/ui/select'
import { Switch } from '#/components/ui/switch'
import { Textarea } from '#/components/ui/textarea'
import {
  CHOICE_KEYS,
  FLAG_LABELS,
  FORMAT_LABELS,
  QUESTION_FLAGS,
  QUESTION_FORMAT,
  QUESTION_STATUS,
  STATEMENT_LABELS,
  STATUS_LABELS,
  type ChoiceKey,
  type QuestionFlag,
  type QuestionFormat,
  type QuestionStatus,
} from '#/lib/schemas/enums'
import { type QuestionEditorValues, questionEditorSchema } from '#/lib/schemas/question'
import { cn } from '#/lib/utils'
import type { getTaxonomy } from '#/server/taxonomy.functions'
import type { ImageMeta } from '#/server/question-payload.server'

type Taxonomy = Awaited<ReturnType<typeof getTaxonomy>>

function errorText(errors: unknown[]) {
  const msgs = errors
    .map((e) => (typeof e === 'string' ? e : e && typeof e === 'object' && 'message' in e ? String(e.message) : null))
    .filter(Boolean)
  return msgs.length ? <p className="text-sm font-medium text-destructive">{[...new Set(msgs)].join('. ')}</p> : null
}

function Section({ title, children, hint }: { title: string; children: ReactNode; hint?: string }) {
  return (
    <fieldset className="space-y-3 rounded-2xl border bg-card p-5">
      <legend className="sr-only">{title}</legend>
      <div>
        <h3 className="font-bold">{title}</h3>
        {hint ? <p className="text-sm text-muted-foreground">{hint}</p> : null}
      </div>
      {children}
    </fieldset>
  )
}

export function QuestionEditor({
  initial,
  taxonomy,
  images = [],
  context,
  onSave,
  saving,
  submitLabel = 'Save question',
  aside,
}: {
  initial: QuestionEditorValues
  taxonomy: Taxonomy
  images?: ImageMeta[]
  context?: string | null
  onSave: (values: QuestionEditorValues) => unknown
  saving?: boolean
  submitLabel?: string
  aside?: ReactNode
}) {
  const form = useForm({
    defaultValues: initial,
    validators: { onSubmit: questionEditorSchema },
    onSubmit: async ({ value }) => {
      await onSave(value)
    },
  })

  const relabel = (choices: { key: ChoiceKey; text: string }[]) =>
    choices.map((c, i) => ({ ...c, key: CHOICE_KEYS[i] }))

  return (
    <form
      onSubmit={(e) => {
        e.preventDefault()
        form.handleSubmit()
      }}
      className="grid gap-6 xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]"
    >
      <div className="space-y-5">
        <Section title="Where it belongs">
          <div className="grid gap-4 sm:grid-cols-3">
            <form.Field name="moduleId">
              {(field) => (
                <div className="space-y-1.5">
                  <Label htmlFor={field.name}>Module</Label>
                  <Select
                    value={field.state.value ? String(field.state.value) : undefined}
                    onValueChange={(v) => {
                      field.handleChange(Number(v))
                      form.setFieldValue('topicId', null)
                    }}
                  >
                    <SelectTrigger id={field.name} className="w-full">
                      <SelectValue placeholder="Choose" />
                    </SelectTrigger>
                    <SelectContent>
                      {taxonomy.modules.map((m) => (
                        <SelectItem key={m.id} value={String(m.id)}>
                          {m.code} {m.shortName}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errorText(field.state.meta.errors)}
                </div>
              )}
            </form.Field>
            <form.Subscribe selector={(s) => s.values.moduleId}>
              {(moduleId) => (
                <form.Field name="topicId">
                  {(field) => {
                    const mod = taxonomy.modules.find((m) => m.id === moduleId)
                    return (
                      <div className="space-y-1.5">
                        <Label htmlFor={field.name}>Topic</Label>
                        <Select
                          value={field.state.value ? String(field.state.value) : 'none'}
                          onValueChange={(v) => field.handleChange(v === 'none' ? null : Number(v))}
                        >
                          <SelectTrigger id={field.name} className="w-full">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="none">Unsorted</SelectItem>
                            {mod?.subjects.map((s) =>
                              s.topics.map((t) => (
                                <SelectItem key={t.id} value={String(t.id)}>
                                  {t.name}
                                </SelectItem>
                              )),
                            )}
                          </SelectContent>
                        </Select>
                      </div>
                    )
                  }}
                </form.Field>
              )}
            </form.Subscribe>
            <form.Field name="sourceId">
              {(field) => (
                <div className="space-y-1.5">
                  <Label htmlFor={field.name}>Source</Label>
                  <Select value={field.state.value ? String(field.state.value) : undefined} onValueChange={(v) => field.handleChange(Number(v))}>
                    <SelectTrigger id={field.name} className="w-full">
                      <SelectValue placeholder="Choose" />
                    </SelectTrigger>
                    <SelectContent>
                      {taxonomy.sources.map((s) => (
                        <SelectItem key={s.id} value={String(s.id)}>
                          {s.name}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  {errorText(field.state.meta.errors)}
                </div>
              )}
            </form.Field>
          </div>
        </Section>

        <Section title="Question" hint="Markdown works: **bold**, lists, tables.">
          <form.Field name="format">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor={field.name}>Format</Label>
                <Select value={field.state.value} onValueChange={(v) => field.handleChange(v as QuestionFormat)}>
                  <SelectTrigger id={field.name} className="w-full sm:w-72">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    {QUESTION_FORMAT.map((f) => (
                      <SelectItem key={f} value={f}>
                        {FORMAT_LABELS[f]}
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            )}
          </form.Field>
          <form.Field name="stem">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor={field.name}>Stem</Label>
                <Textarea
                  id={field.name}
                  rows={4}
                  value={field.state.value}
                  onChange={(e) => field.handleChange(e.target.value)}
                  onBlur={field.handleBlur}
                />
                {errorText(field.state.meta.errors)}
              </div>
            )}
          </form.Field>

          <form.Field name="statements" mode="array">
            {(field) => (
              <div className="space-y-2">
                <div className="flex items-center justify-between">
                  <Label>Roman numeral statements</Label>
                  <Button
                    type="button"
                    size="sm"
                    variant="ghost"
                    disabled={field.state.value.length >= STATEMENT_LABELS.length}
                    onClick={() => field.pushValue({ label: STATEMENT_LABELS[field.state.value.length], text: '' })}
                  >
                    <PlusIcon /> Add statement
                  </Button>
                </div>
                {field.state.value.map((s, i) => (
                  <form.Field key={s.label} name={`statements[${i}].text`}>
                    {(sub) => (
                      <div className="flex gap-2">
                        <span className="w-8 pt-2 text-right font-bold text-muted-foreground">{s.label}.</span>
                        <Textarea
                          rows={1}
                          aria-label={`Statement ${s.label}`}
                          value={sub.state.value}
                          onChange={(e) => sub.handleChange(e.target.value)}
                          className="min-h-9"
                        />
                        <Button
                          type="button"
                          size="icon"
                          variant="ghost"
                          aria-label={`Remove statement ${s.label}`}
                          onClick={() =>
                            form.setFieldValue(
                              'statements',
                              field.state.value
                                .filter((_, j) => j !== i)
                                .map((st, j) => ({ ...st, label: STATEMENT_LABELS[j] })),
                            )
                          }
                        >
                          <Trash2Icon />
                        </Button>
                      </div>
                    )}
                  </form.Field>
                ))}
                {errorText(field.state.meta.errors)}
              </div>
            )}
          </form.Field>
        </Section>

        <Section title="Choices and answer" hint="Click a letter to mark it as the correct answer.">
          <form.Field name="choices" mode="array">
            {(field) => (
              <div className="space-y-2">
                <form.Subscribe selector={(s) => s.values.answerKey}>
                  {(answerKey) =>
                    field.state.value.map((c, i) => (
                      <form.Field key={c.key} name={`choices[${i}].text`}>
                        {(sub) => (
                          <div className="flex gap-2">
                            <button
                              type="button"
                              aria-pressed={answerKey === c.key}
                              aria-label={`Mark ${c.key} as the answer`}
                              onClick={() => form.setFieldValue('answerKey', c.key)}
                              className={cn(
                                'flex size-9 shrink-0 items-center justify-center rounded-md border font-bold',
                                answerKey === c.key ? 'border-success bg-success text-success-foreground' : 'bg-secondary',
                              )}
                            >
                              {c.key}
                            </button>
                            <Textarea
                              rows={1}
                              aria-label={`Choice ${c.key}`}
                              value={sub.state.value}
                              onChange={(e) => sub.handleChange(e.target.value)}
                              className="min-h-9"
                            />
                            <Button
                              type="button"
                              size="icon"
                              variant="ghost"
                              aria-label={`Remove choice ${c.key}`}
                              disabled={field.state.value.length <= 2}
                              onClick={() => {
                                if (answerKey === c.key) form.setFieldValue('answerKey', null)
                                form.setFieldValue('choices', relabel(field.state.value.filter((_, j) => j !== i)))
                              }}
                            >
                              <Trash2Icon />
                            </Button>
                          </div>
                        )}
                      </form.Field>
                    ))
                  }
                </form.Subscribe>
                <Button
                  type="button"
                  size="sm"
                  variant="ghost"
                  disabled={field.state.value.length >= 5}
                  onClick={() => field.pushValue({ key: CHOICE_KEYS[field.state.value.length], text: '' })}
                >
                  <PlusIcon /> Add choice
                </Button>
                {errorText(field.state.meta.errors)}
              </div>
            )}
          </form.Field>
          <form.Field name="answerKey">{(field) => errorText(field.state.meta.errors)}</form.Field>
        </Section>

        <Section title="Explanation">
          <form.Field name="rationale">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor={field.name}>Rationale</Label>
                <Textarea id={field.name} rows={8} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
              </div>
            )}
          </form.Field>
          <form.Field name="mnemonic">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor={field.name}>Memory aid</Label>
                <Textarea id={field.name} rows={2} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
              </div>
            )}
          </form.Field>
        </Section>

        <Section title="Status">
          <div className="grid gap-4 sm:grid-cols-2">
            <form.Field name="status">
              {(field) => (
                <div className="space-y-1.5">
                  <Label htmlFor={field.name}>Status</Label>
                  <Select value={field.state.value} onValueChange={(v) => field.handleChange(v as QuestionStatus)}>
                    <SelectTrigger id={field.name} className="w-full">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {QUESTION_STATUS.map((s) => (
                        <SelectItem key={s} value={s}>
                          {STATUS_LABELS[s]}
                        </SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <p className="text-xs text-muted-foreground">Only Imported and Verified questions appear in study.</p>
                </div>
              )}
            </form.Field>
            <form.Field name="requiresImage">
              {(field) => (
                <div className="flex items-center gap-3 pt-6">
                  <Switch id={field.name} checked={field.state.value} onCheckedChange={field.handleChange} />
                  <Label htmlFor={field.name}>Can’t be answered without an image</Label>
                </div>
              )}
            </form.Field>
          </div>
          <form.Field name="flags">
            {(field) => (
              <div className="space-y-2">
                <Label>Flags</Label>
                <div className="grid gap-2 sm:grid-cols-2">
                  {QUESTION_FLAGS.map((f) => (
                    <div key={f} className="flex items-center gap-2 text-sm">
                      <Checkbox
                        id={`flag-${f}`}
                        checked={field.state.value.includes(f)}
                        onCheckedChange={(v) =>
                          field.handleChange(
                            v ? [...field.state.value, f] : field.state.value.filter((x: QuestionFlag) => x !== f),
                          )
                        }
                      />
                      <Label htmlFor={`flag-${f}`} className="font-normal">
                        {FLAG_LABELS[f]}
                      </Label>
                    </div>
                  ))}
                </div>
              </div>
            )}
          </form.Field>
          <form.Field name="reviewNote">
            {(field) => (
              <div className="space-y-1.5">
                <Label htmlFor={field.name}>Review note</Label>
                <Textarea id={field.name} rows={2} value={field.state.value} onChange={(e) => field.handleChange(e.target.value)} />
              </div>
            )}
          </form.Field>
        </Section>

        {aside}

        <div className="sticky bottom-20 z-10 flex justify-end md:bottom-4">
          <form.Subscribe selector={(s) => [s.isSubmitting, s.canSubmit] as const}>
            {([isSubmitting, canSubmit]) => (
              <Button type="submit" size="lg" className="shadow-lg" disabled={saving || isSubmitting || !canSubmit}>
                {saving || isSubmitting ? 'Saving…' : submitLabel}
              </Button>
            )}
          </form.Subscribe>
        </div>
      </div>

      <form.Subscribe selector={(s) => s.values}>
        {(v) => {
          const mod = taxonomy.modules.find((m) => m.id === v.moduleId)
          const topic = mod?.subjects.flatMap((s) => s.topics).find((t) => t.id === v.topicId)
          const source = taxonomy.sources.find((s) => s.id === v.sourceId)
          const view = {
            id: 0,
            format: v.format,
            stem: v.stem || '_(stem)_',
            statements: v.statements.filter((s) => s.text.trim()),
            choices: v.choices.map((c) => ({ ...c, text: c.text || '_(empty)_' })),
            context: context ?? null,
            groupId: null,
            groupOrder: null,
            module: { slug: mod?.slug ?? '', code: mod?.code ?? '?', shortName: mod?.shortName ?? '', accentHue: mod?.accentHue ?? 200 },
            topic: topic?.name ?? null,
            source: source?.shortName ?? '',
            printedNumber: null,
            images,
            bookmarked: false,
          }
          return (
            <aside aria-label="Preview" data-module style={moduleStyle(view.module.accentHue)} className="space-y-4 xl:sticky xl:top-20 xl:self-start">
              <p className="text-sm font-semibold text-muted-foreground">Preview</p>
              <div className="space-y-4 rounded-2xl border bg-card p-5">
                <QuestionBody question={view} size="md" />
                <ChoiceList choices={view.choices} images={images} selectedKey={null} answerKey={v.answerKey} disabled />
              </div>
              {v.answerKey ? (
                <RationalePanel question={view} answerKey={v.answerKey} rationale={v.rationale} mnemonic={v.mnemonic} />
              ) : (
                <p className="rounded-xl border border-dashed p-4 text-sm text-muted-foreground">No answer selected yet.</p>
              )}
            </aside>
          )
        }}
      </form.Subscribe>
    </form>
  )
}
