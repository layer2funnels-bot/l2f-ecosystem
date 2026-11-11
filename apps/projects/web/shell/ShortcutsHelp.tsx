import { Fragment } from 'react';
import { Modal } from '../ui/Dialog.tsx';
import { Kbd } from '../ui/Feedback.tsx';
import { Button } from '../ui/Button.tsx';
import { GROUP_ORDER, isMac, keyLabel, SHORTCUTS } from './shortcuts.ts';
import type { ShortcutDef } from './shortcuts.ts';

/** Renders one key combination with the existing Kbd component; "then" is plain text between keys. */
export function KeyCombo({ keys }: { keys: string[] }) {
  return (
    <span className="pm-keycombo">
      {keys.map((k, i) => (
        <Fragment key={i}>
          {k === 'then' ? <span className="pm-faint pm-keycombo__then">then</span> : <Kbd>{keyLabel(k)}</Kbd>}
        </Fragment>
      ))}
    </span>
  );
}

export function ShortcutKeys({ def }: { def: ShortcutDef }) {
  return (
    <span className="pm-keyalts">
      {def.keys.map((k, i) => (
        <Fragment key={i}>
          {i > 0 && <span className="pm-faint pm-keycombo__then">or</span>}
          <KeyCombo keys={k} />
        </Fragment>
      ))}
    </span>
  );
}

export function ShortcutsHelp({ open, onClose }: { open: boolean; onClose: () => void }) {
  return (
    <Modal
      open={open}
      onClose={onClose}
      title="Keyboard shortcuts"
      description={`Single-key shortcuts are ignored while you type in a field. ${isMac ? '⌘' : 'Ctrl'} means ${isMac ? 'Command' : 'Control'}.`}
      size="lg"
      className="pm-shortcuts"
      footer={<Button variant="primary" onClick={onClose}>Done</Button>}
    >
      <div className="pm-shortcuts__grid">
        {GROUP_ORDER.map((g) => {
          const list = SHORTCUTS.filter((s) => s.group === g);
          if (!list.length) return null;
          return (
            <section key={g} className="pm-shortcuts__group" aria-label={g}>
              <h3>{g}{g === 'Project views' && <span className="pm-faint"> (inside a project)</span>}</h3>
              <ul>
                {list.map((s) => (
                  <li key={s.id}>
                    <span>{s.label}</span>
                    <ShortcutKeys def={s} />
                  </li>
                ))}
              </ul>
            </section>
          );
        })}
      </div>
    </Modal>
  );
}
