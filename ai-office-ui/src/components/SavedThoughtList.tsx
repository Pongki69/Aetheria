import { Trash2 } from 'lucide-react';

export function SavedThoughtList({thoughts, onRemove}: {thoughts: string[]; onRemove: (text: string) => void}) {
  return <section className="agent-saved-thoughts" aria-label="Saved thoughts">
    <header><h3>Saved thoughts</h3><span>{thoughts.length} kept</span></header>
    <p>Saved automatically on this device. Generate again to add more. Remove any you don’t want in the random rotation.</p>
    {thoughts.length ? <ol>{thoughts.map((text, index) => <li key={text}>
      <span className="thought-number" aria-hidden="true">{index + 1}</span><span>{text}</span>
      <button type="button" aria-label={`Remove thought ${index + 1}`} title="Remove from saved thoughts" onClick={() => onRemove(text)}><Trash2 size={14}/></button>
    </li>)}</ol> : <div className="agent-thought-empty">No saved thoughts yet. Generate a batch to start your collection.</div>}
  </section>;
}
