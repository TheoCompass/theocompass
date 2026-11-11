/**
 * Small-caps metadata line: `FOUNDED 1609 · LONDON · ~1.2M`.
 *
 * Replaces the rainbow pill badges. Neutral dividers come from CSS so callers
 * only pass the values.
 */
export function MetaRow({
  items,
  className = "",
}: {
  items: (string | null | undefined | false)[];
  className?: string;
}) {
  const shown = items.filter(Boolean) as string[];
  if (shown.length === 0) return null;

  return (
    <div className={`meta flex flex-wrap items-center gap-x-2 gap-y-1 ${className}`}>
      {shown.map((item, index) => (
        <span key={`${item}-${index}`} className="flex items-center gap-2">
          {index > 0 && (
            <span aria-hidden="true" className="text-rule-strong">
              ·
            </span>
          )}
          <span>{item}</span>
        </span>
      ))}
    </div>
  );
}
