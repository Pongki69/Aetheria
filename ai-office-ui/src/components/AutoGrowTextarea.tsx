import { useLayoutEffect, useRef } from 'react';
import type { TextareaHTMLAttributes } from 'react';

export function AutoGrowTextarea(props: TextareaHTMLAttributes<HTMLTextAreaElement>) {
  const ref = useRef<HTMLTextAreaElement>(null);
  useLayoutEffect(() => {
    const resize = () => {
      const input = ref.current;
      if (!input) return;
      input.style.height = 'auto';
      input.style.height = `${Math.min(input.scrollHeight + 2, 280)}px`;
      input.style.overflowY = input.scrollHeight > 278 ? 'auto' : 'hidden';
    };
    resize();
    window.addEventListener('resize', resize);
    return () => window.removeEventListener('resize', resize);
  }, [props.value]);
  return <textarea {...props} ref={ref} rows={1} style={{ ...props.style, resize: 'none' }} />;
}
