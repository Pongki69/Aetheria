export function parseThoughtBatch(text: string): string[] {
  const start = text.indexOf('[');
  const end = text.lastIndexOf(']');
  let parsed: unknown;
  try { parsed = JSON.parse(text.slice(start, end + 1)); }
  catch {
    parsed = text.split(/\r?\n/).map((line) => line.trim()).filter((line) => /^(?:\d+[.)\]:-]|[-*•])\s*/.test(line)).map((line) => line.replace(/^(?:\d+[.)\]:-]|[-*•])\s*/, '').replace(/^["“]|["”]$/g, ''));
  }
  if (!Array.isArray(parsed)) throw new Error('The model did not return a list of thoughts.');
  const thoughts: string[] = [];
  const seen = new Set<string>();
  for (const value of parsed) {
    if (typeof value !== 'string') continue;
    const thought = value.trim().split(/\s+/).slice(0, 30).join(' ');
    const key = thought.toLowerCase();
    if (!thought || seen.has(key)) continue;
    seen.add(key);
    thoughts.push(thought);
    if (thoughts.length === 10) break;
  }
  if (thoughts.length < 10) throw new Error('The model returned fewer than 10 distinct thoughts. Generate a new batch to retry.');
  return thoughts;
}

export function shuffleThoughts(thoughts: string[], previous: string): string[] {
  const shuffled = [...thoughts];
  for (let i = shuffled.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [shuffled[i], shuffled[j]] = [shuffled[j], shuffled[i]];
  }
  if (shuffled.length > 1 && shuffled[0] === previous) {
    [shuffled[0], shuffled[1]] = [shuffled[1], shuffled[0]];
  }
  return shuffled;
}
