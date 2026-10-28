import { useCallback, useRef, useState } from 'react';
import { AlertTriangle, X } from 'lucide-react';

interface ConfirmationRequest {
  title: string;
  message: string;
  confirmLabel: string;
  destructive: boolean;
}

export function useConfirmModal() {
  const [request, setRequest] = useState<ConfirmationRequest | null>(null);
  const resolver = useRef<((confirmed: boolean) => void) | null>(null);

  const confirm = useCallback((message: string, options: { title?: string; confirmLabel?: string; destructive?: boolean } = {}) => new Promise<boolean>((resolve) => {
    resolver.current = resolve;
    setRequest({ title: options.title || 'Please confirm', message, confirmLabel: options.confirmLabel || 'Continue', destructive: !!options.destructive });
  }), []);

  const finish = (confirmed: boolean) => {
    setRequest(null);
    resolver.current?.(confirmed);
    resolver.current = null;
  };

  const dialog = request && <div role="presentation" onMouseDown={(event) => { if (event.target === event.currentTarget) finish(false); }} style={{ position: 'fixed', inset: 0, zIndex: 110000, display: 'grid', placeItems: 'center', padding: 18, background: 'rgba(2,6,23,.78)', backdropFilter: 'blur(8px)' }}>
    <section role="alertdialog" aria-modal="true" aria-labelledby="confirm-modal-title" aria-describedby="confirm-modal-message" style={{ width: 'min(420px, 100%)', overflow: 'hidden', border: `1px solid ${request.destructive ? 'rgba(244,63,94,.42)' : 'rgba(56,189,248,.3)'}`, borderRadius: 16, background: '#0d1728', boxShadow: '0 28px 90px rgba(0,0,0,.58)', color: '#f8fafc' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 11, padding: '17px 18px', borderBottom: '1px solid rgba(148,163,184,.12)' }}><span style={{ width: 34, height: 34, display: 'grid', placeItems: 'center', borderRadius: 10, background: request.destructive ? 'rgba(244,63,94,.13)' : 'rgba(56,189,248,.12)', color: request.destructive ? '#fb7185' : '#7dd3fc' }}><AlertTriangle size={17} /></span><h2 id="confirm-modal-title" style={{ flex: 1, margin: 0, fontSize: 14, fontWeight: 800 }}>{request.title}</h2><button onClick={() => finish(false)} aria-label="Close confirmation" style={{ display: 'grid', placeItems: 'center', width: 30, height: 30, borderRadius: 8, border: '1px solid rgba(148,163,184,.16)', background: 'transparent', color: '#94a3b8', cursor: 'pointer' }}><X size={15} /></button></header>
      <p id="confirm-modal-message" style={{ margin: 0, padding: '18px', color: '#cbd5e1', fontSize: 12, lineHeight: 1.6 }}>{request.message}</p>
      <footer style={{ display: 'flex', justifyContent: 'flex-end', gap: 8, padding: '12px 18px 17px' }}><button onClick={() => finish(false)} style={{ padding: '8px 12px', borderRadius: 8, border: '1px solid rgba(148,163,184,.2)', background: 'rgba(15,23,42,.7)', color: '#cbd5e1', fontSize: 11, fontWeight: 700, cursor: 'pointer' }}>Cancel</button><button autoFocus onClick={() => finish(true)} style={{ padding: '8px 13px', borderRadius: 8, border: `1px solid ${request.destructive ? '#e11d48' : '#0284c7'}`, background: request.destructive ? '#be123c' : '#0284c7', color: 'white', fontSize: 11, fontWeight: 750, cursor: 'pointer' }}>{request.confirmLabel}</button></footer>
    </section>
  </div>;

  return { confirm, dialog };
}
