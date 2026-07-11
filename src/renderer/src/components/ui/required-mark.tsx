/**
 * Small red asterisk marking a required form field. Purely visual — the
 * accompanying validation still runs on submit. `aria-hidden` because the
 * label text + validation message carry the meaning for screen readers.
 */
export function RequiredMark(): JSX.Element {
  return (
    <span aria-hidden className="ms-0.5 text-destructive">
      *
    </span>
  )
}
