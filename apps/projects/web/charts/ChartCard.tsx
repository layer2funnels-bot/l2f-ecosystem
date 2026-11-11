import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { copyText } from '../lib/clipboard.ts';
import { cx } from '../lib/util.ts';
import { Button } from '../ui/Button.tsx';
import { EmptyState, ErrorState, Skeleton } from '../ui/Feedback.tsx';
import { Menu } from '../ui/Menu.tsx';
import type { MenuItem } from '../ui/Menu.tsx';
import { toast } from '../ui/Toast.tsx';
import { chartToPng, downloadBlob, toCsv } from './export.ts';
import type { Cell } from './export.ts';
import { slug } from './format.ts';

export interface ChartCardProps {
  title: string;
  /** One sentence on what the chart measures. */
  subtitle: string;
  children?: ReactNode;
  loading?: boolean;
  error?: { message: string } | null;
  onRetry?: () => void;
  /** Text for the empty state; when set the chart is replaced by it. */
  empty?: string | false;
  /** Rows (header first) for "Copy data as CSV". */
  csv?: () => Cell[][];
  /** File name prefix for the PNG, e.g. the project name. */
  fileBase?: string;
  /** Offer "Download as PNG" (default when a chart SVG is drawn). */
  png?: boolean;
  /** True while a newer answer is being fetched; the old picture stays and dims a little. */
  busy?: boolean;
  skeletonHeight?: number;
  className?: string;
}

/** Frame for every chart: title, one-line explanation, a ... menu (PNG / CSV) and the loading / empty / error states. */
export function ChartCard({ title, subtitle, children, loading, error, onRetry, empty, csv, fileBase, png = true, busy, skeletonHeight = 200, className }: ChartCardProps) {
  const body = useRef<HTMLDivElement>(null);
  const [exporting, setExporting] = useState(false);
  const ready = !loading && !error && !empty;

  const savePng = async () => {
    if (!body.current || exporting) return;
    setExporting(true);
    try {
      const blob = await chartToPng(body.current, { title, subtitle });
      const name = `${slug(fileBase ?? 'projects')}-${slug(title)}.png`;
      downloadBlob(blob, name);
      toast.success(`Saved ${name}`);
    } catch (e) {
      toast.error(e instanceof Error ? e.message : 'Could not create the image');
    } finally {
      setExporting(false);
    }
  };
  const copyCsv = () => {
    if (!csv) return;
    void copyText(toCsv(csv()), 'Chart data copied as CSV');
  };

  const items: MenuItem[] = [
    ...(png ? [{ id: 'png', label: 'Download as PNG', icon: 'download' as const, disabled: !ready || exporting, onSelect: () => void savePng() }] : []),
    ...(csv ? [{ id: 'csv', label: 'Copy data as CSV', icon: 'copy' as const, disabled: !ready, onSelect: copyCsv }] : []),
  ];

  return (
    <section className={cx('pm-card pm-chartcard', busy && 'is-busy', className)} aria-label={title}>
      <header className="pm-chartcard__head">
        <div className="pm-chartcard__titles">
          <h3 className="pm-chartcard__title">{title}</h3>
          <p className="pm-chartcard__sub">{subtitle}</p>
        </div>
        {items.length > 0 && (
          <Menu
            align="end"
            label={`${title} options`}
            items={items}
            trigger={(t) => <Button {...t} variant="ghost" size="sm" icon="more" aria-label={`${title}: more options`} title="More options" />}
          />
        )}
      </header>
      <div className="pm-chartcard__body" ref={body} aria-busy={busy || loading || undefined}>
        {loading ? (
          <div className="pm-chartcard__skel" role="status" aria-label={`Loading ${title}`}>
            <Skeleton height={skeletonHeight * 0.16} radius={6} />
            <Skeleton height={skeletonHeight * 0.16} radius={6} width="82%" />
            <Skeleton height={skeletonHeight * 0.16} radius={6} width="64%" />
            <Skeleton height={skeletonHeight * 0.16} radius={6} width="40%" />
          </div>
        ) : error ? (
          <ErrorState compact title="Couldn't load this chart" message={error.message} onRetry={onRetry} />
        ) : empty ? (
          <EmptyState compact icon="bars" title={empty} text="Try a wider date range or fewer filters." />
        ) : children}
      </div>
    </section>
  );
}
