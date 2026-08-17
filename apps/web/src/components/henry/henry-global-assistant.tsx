'use client';

import { useState } from 'react';
import { AnimatePresence, motion, useReducedMotion } from 'motion/react';
import { Bot, Maximize2, Minimize2, X } from 'lucide-react';
import type { HenryActivityStatus, HenryExperienceRole } from '@/lib/henry';
import { HenryConversation } from './henry-conversation';

const STATUS_LABELS: Record<HenryActivityStatus, string> = {
  online: 'En línea',
  thinking: 'Pensando',
  action: 'Ejecutando acción',
  escalating: 'Escalando a humano',
  error: 'Error seguro',
};

export function HenryGlobalAssistant({
  internal = false,
  storageScope = 'public',
  role = internal ? 'CLIENT' : 'PUBLIC',
}: {
  internal?: boolean;
  storageScope?: string;
  role?: HenryExperienceRole;
}) {
  const [open, setOpen] = useState(false);
  const [expanded, setExpanded] = useState(false);
  const [status, setStatus] = useState<HenryActivityStatus>('online');
  const reduced = useReducedMotion();
  return (
    <div className={`henry-global ${open ? 'is-open' : ''}`} data-testid="henry-global-assistant">
      <button
        type="button"
        className="henry-launcher"
        onClick={() => setOpen(true)}
        aria-expanded={open}
        aria-controls="henry-global-panel"
        aria-label={internal ? 'Abrir copiloto Henry' : 'Abrir asistente Henry'}
      >
        <span>H</span>
        <span>
          <strong>Henry</strong>
          <small>{internal ? 'Copiloto' : 'Asistente virtual'}</small>
        </span>
        <span className="sr-only" role="status">
          {STATUS_LABELS[status]}
        </span>
        <i className={`status-${status}`} aria-hidden="true" />
      </button>
      <AnimatePresence>
        {open && (
          <motion.aside
            id="henry-global-panel"
            className={expanded ? 'is-expanded' : ''}
            role="dialog"
            aria-modal="false"
            aria-label="Henry"
            initial={reduced ? false : { opacity: 0, y: 20, scale: 0.98 }}
            animate={{ opacity: 1, y: 0, scale: 1 }}
            exit={{ opacity: 0, y: 12 }}
          >
            <div className="henry-global-controls">
              <span>
                <Bot /> Henry {internal ? 'Copiloto' : 'Global'}
              </span>
              <small className={`henry-global-status status-${status}`} role="status">
                {STATUS_LABELS[status]}
              </small>
              <div>
                <button
                  onClick={() => setExpanded((value) => !value)}
                  aria-label={expanded ? 'Restaurar panel' : 'Ampliar panel'}
                >
                  {expanded ? <Minimize2 /> : <Maximize2 />}
                </button>
                <button onClick={() => setOpen(false)} aria-label="Minimizar Henry">
                  <X />
                </button>
              </div>
            </div>
            <HenryConversation
              variant="global"
              internal={internal}
              storageScope={storageScope}
              role={role}
              onActivity={setStatus}
            />
          </motion.aside>
        )}
      </AnimatePresence>
    </div>
  );
}
