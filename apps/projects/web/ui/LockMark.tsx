import { Icon } from './icons.tsx';

/** Small lock shown next to a personal project's name. */
export function LockMark({ size = 12 }: { size?: number }) {
  return (
    <span className="pm-lockmark" role="img" aria-label="Personal project, private to you" title="Personal project, private to you">
      <Icon name="lock" size={size} />
    </span>
  );
}
