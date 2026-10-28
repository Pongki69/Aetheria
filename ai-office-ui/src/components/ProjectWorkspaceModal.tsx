import { useMemo, useState } from 'react';
import type { CSSProperties, FormEvent } from 'react';
import { createPortal } from 'react-dom';
import { Check, FileCode2, FolderOpen, LoaderCircle, Save, X } from 'lucide-react';
import type { AgentData } from '../types';
import { authRequest, getAuthToken } from '../services/authClient';

type DirectoryHandleLike = FileSystemDirectoryHandle & { values(): AsyncIterable<FileSystemHandle> };
type WorkspaceFile = { path: string; handle: FileSystemFileHandle; content: string };
type FileChange = { path: string; content: string; reason?: string };
type EditResponse = { summary?: string; changes: FileChange[] };
type ChatResult = { text: string; providerUsed?: string };
type Props = { isOpen: boolean; agent: AgentData; onClose: () => void };

const ignoredDirectories = new Set(['.git', 'node_modules', '.next', 'dist', 'build', 'coverage', '.venv', 'venv', 'vendor']);
const sensitiveFileName = /(?:^\.env(?:\.|$)|private.?key|secrets?|credentials?|\.(?:pem|p12|pfx|key)$)/i;
const MAX_FILES = 250;
const MAX_FILE_BYTES = 256 * 1024;
const MAX_CONTEXT_CHARS = 140_000;

async function readDirectory(root: DirectoryHandleLike): Promise<WorkspaceFile[]> {
  const output: WorkspaceFile[] = [];
  const visit = async (directory: DirectoryHandleLike, prefix: string) => {
    for await (const entry of directory.values()) {
      if (output.length >= MAX_FILES) return;
      if (entry.kind === 'directory') {
        if (!ignoredDirectories.has(entry.name)) await visit(entry as DirectoryHandleLike, `${prefix}${entry.name}/`);
        continue;
      }
      const fileHandle = entry as FileSystemFileHandle;
      if (sensitiveFileName.test(fileHandle.name)) continue;
      const file = await fileHandle.getFile();
      if (file.size > MAX_FILE_BYTES) continue;
      const content = await file.text();
      if (content.includes('\0')) continue;
      output.push({ path: `${prefix}${entry.name}`, handle: fileHandle, content });
    }
  };
  await visit(root, '');
  return output.sort((a, b) => a.path.localeCompare(b.path));
}

function decodeChanges(response: string): EditResponse {
  const cleaned = response.trim().replace(/^```(?:json)?\s*/i, '').replace(/\s*```$/, '');
  const start = cleaned.indexOf('{');
  const end = cleaned.lastIndexOf('}');
  if (start < 0 || end <= start) throw new Error('The model did not return the requested structured file changes. Try a more specific request.');
  const data = JSON.parse(cleaned.slice(start, end + 1)) as EditResponse;
  if (!Array.isArray(data.changes)) throw new Error('The model response did not include a changes list. Try again with a more specific request.');
  return data;
}

async function createTargetHandle(root: DirectoryHandleLike, path: string): Promise<FileSystemFileHandle> {
  const parts = path.replaceAll('\\', '/').split('/').filter(Boolean);
  if (!parts.length || parts.some((part) => part === '.' || part === '..' || part.includes(':'))) throw new Error(`Unsafe file path: ${path}`);
  if (sensitiveFileName.test(parts[parts.length - 1]) || parts.some((part) => ignoredDirectories.has(part))) throw new Error(`This protected path cannot be changed: ${path}`);
  let directory = root;
  for (const part of parts.slice(0, -1)) directory = await directory.getDirectoryHandle(part, { create: true }) as DirectoryHandleLike;
  return directory.getFileHandle(parts[parts.length - 1], { create: true });
}

const buttonStyle: CSSProperties = { border: '1px solid rgba(148,163,184,.2)', borderRadius: 7, background: 'rgba(15,23,42,.9)', color: '#cbd5e1', padding: '8px 10px', cursor: 'pointer', display: 'inline-flex', alignItems: 'center', gap: 7, fontSize: 12 };

export function ProjectWorkspaceModal({ isOpen, agent, onClose }: Props) {
  const [root, setRoot] = useState<DirectoryHandleLike | null>(null);
  const [files, setFiles] = useState<WorkspaceFile[]>([]);
  const [selectedPath, setSelectedPath] = useState('');
  const [request, setRequest] = useState('');
  const [changes, setChanges] = useState<FileChange[]>([]);
  const [changeIndex, setChangeIndex] = useState(0);
  const [notice, setNotice] = useState('');
  const [busy, setBusy] = useState(false);
  const [providerUsed, setProviderUsed] = useState('');
  const [saving, setSaving] = useState(false);
  const selectedFile = files.find((file) => file.path === selectedPath);
  const proposedChange = changes[changeIndex];
  const projectCharLimit = agent.aiProvider === 'lmstudio'
    ? ({ high: 48_000, medium: 20_000, low: 8_000, lowest: 3_000 } as const)[agent.localModelProfile || 'medium']
    : MAX_CONTEXT_CHARS;
  const editMaxTokens = agent.aiProvider === 'lmstudio'
    ? ({ high: 5_000, medium: 3_000, low: 1_500, lowest: 1_200 } as const)[agent.localModelProfile || 'medium']
    : 8_000;
  const availableContext = useMemo(() => {
    let remaining = projectCharLimit;
    return files.flatMap((file) => {
      if (remaining <= 0) return [];
      const content = file.content.slice(0, remaining);
      remaining -= content.length;
      return [`--- FILE: ${file.path} ---\n${content}`];
    }).join('\n\n');
  }, [files, projectCharLimit]);

  const chooseFolder = async () => {
    const picker = (window as Window & { showDirectoryPicker?: (options?: { mode?: 'read' | 'readwrite' }) => Promise<DirectoryHandleLike> }).showDirectoryPicker;
    if (!picker) {
      setNotice('Folder editing needs a Chromium browser such as Chrome or Edge.');
      return;
    }
    setBusy(true); setNotice(''); setChanges([]);
    try {
      const directory = await picker({ mode: 'readwrite' });
      const loaded = await readDirectory(directory);
      setRoot(directory); setFiles(loaded); setSelectedPath(loaded[0]?.path || '');
      setNotice(loaded.length ? `Imported ${loaded.length} text files. Large files and generated folders are skipped.` : 'No readable text files found in that folder.');
    } catch (error) {
      if (error instanceof DOMException && error.name === 'AbortError') return;
      setNotice(error instanceof Error ? error.message : 'Could not open that folder.');
    } finally { setBusy(false); }
  };

  const askAgent = async (event: FormEvent) => {
    event.preventDefault();
    if (!root || !files.length || !request.trim() || busy) return;
    const token = getAuthToken();
    if (!token) { setNotice('Sign in again before asking the agent to edit files.'); return; }
    setBusy(true); setNotice('Reading the project and preparing a reviewable edit…'); setChanges([]); setProviderUsed('');
    try {
      const prompt = [
        `Project editing request: ${request.trim()}`,
        'You are editing a user-selected local project. Use the supplied files as the source of truth.',
        'Return ONLY valid JSON with this shape: {"summary":"short summary","changes":[{"path":"relative/path","content":"complete replacement file contents","reason":"short reason"}]}.',
        'Only include files that need changes. Use complete file contents, not diffs. Do not use markdown fences. Do not include paths outside the project. If no change is needed, return an empty changes array.',
        `Project files:\n${availableContext}`
      ].join('\n\n');
      const result = await authRequest<ChatResult>('/api/ai/chat', {
        method: 'POST',
        body: JSON.stringify({
          provider: agent.aiProvider || 'openrouter',
          modelId: agent.aiModelId || 'openrouter/free',
          localModelProfile: agent.localModelProfile || 'medium',
          maxTokens: editMaxTokens,
          prompt,
          systemInstruction: `You are ${agent.name}, a careful software engineering agent. Follow the user's requested change and preserve unrelated behavior. ${agent.instructions || ''}`
        })
      }, token);
      const parsed = decodeChanges(result.text);
      const safeChanges = parsed.changes.filter((change): change is FileChange => !!change && typeof change === 'object' && typeof change.path === 'string' && !!change.path.trim() && typeof change.content === 'string' && !change.path.startsWith('/') && !/^[a-z]:/i.test(change.path) && !change.path.split(/[\\/]/).includes('..'));
      setChanges(safeChanges); setChangeIndex(0); setProviderUsed(result.providerUsed || 'Assigned model');
      setNotice(safeChanges.length ? parsed.summary || `${safeChanges.length} file change${safeChanges.length === 1 ? '' : 's'} ready to review.` : 'The agent proposed no file changes.');
    } catch (error) {
      setNotice(error instanceof Error ? error.message : 'The agent could not prepare file changes.');
    } finally { setBusy(false); }
  };

  const saveChanges = async () => {
    if (!root || !changes.length || saving) return;
    setSaving(true); setNotice('Saving reviewed changes to your selected folder…');
    try {
      for (const change of changes) {
        const handle = await createTargetHandle(root, change.path);
        const writable = await handle.createWritable();
        await writable.write(change.content);
        await writable.close();
      }
      const refreshed = await readDirectory(root);
      setFiles(refreshed); setChanges([]); setSelectedPath(refreshed[0]?.path || '');
      setNotice(`Saved ${changes.length} file${changes.length === 1 ? '' : 's'} to ${root.name}.`);
    } catch (error) {
      setNotice(error instanceof Error ? `Save stopped: ${error.message}` : 'Could not save all changes.');
    } finally { setSaving(false); }
  };

  if (!isOpen) return null;
  return createPortal(<div onMouseDown={(event) => { if (event.target === event.currentTarget) onClose(); }} style={{ position: 'fixed', inset: 0, zIndex: 150, background: 'rgba(2,6,23,.78)', backdropFilter: 'blur(9px)', display: 'grid', placeItems: 'center', padding: 18 }}>
    <section style={{ width: 'min(1180px, 96vw)', height: 'min(820px, 92vh)', display: 'flex', flexDirection: 'column', overflow: 'hidden', borderRadius: 14, border: '1px solid rgba(56,189,248,.28)', background: '#0b1220', color: '#e2e8f0', boxShadow: '0 24px 90px rgba(0,0,0,.55)' }}>
      <header style={{ display: 'flex', alignItems: 'center', gap: 12, padding: '14px 17px', borderBottom: '1px solid rgba(148,163,184,.14)' }}>
        <div style={{ width: 34, height: 34, borderRadius: 9, display: 'grid', placeItems: 'center', color: '#7dd3fc', background: 'rgba(14,165,233,.13)' }}><FileCode2 size={18}/></div>
        <div style={{ flex: 1, minWidth: 0 }}><strong style={{ fontSize: 14 }}>Project workspace</strong><div style={{ color: '#8292aa', fontSize: 11, marginTop: 3 }}>{root ? `${root.name} · ${files.length} files · ${agent.name} using assigned model` : `Import a folder for ${agent.name} to inspect and edit`}</div></div>
        <button type="button" onClick={() => void chooseFolder()} disabled={busy || saving} style={{ ...buttonStyle, color: '#bae6fd', borderColor: 'rgba(56,189,248,.3)' }}><FolderOpen size={14}/>{root ? 'Change folder' : 'Import folder'}</button>
        <button type="button" onClick={onClose} aria-label="Close project workspace" style={{ border: 0, background: 'transparent', color: '#94a3b8', cursor: 'pointer', padding: 6 }}><X size={18}/></button>
      </header>
      {!root ? <div style={{ flex: 1, display: 'grid', placeItems: 'center', padding: 32, textAlign: 'center' }}><div style={{ maxWidth: 460 }}><div style={{ width: 56, height: 56, margin: '0 auto 15px', borderRadius: 15, display: 'grid', placeItems: 'center', background: 'rgba(14,165,233,.12)', color: '#7dd3fc' }}><FolderOpen size={26}/></div><h2 style={{ margin: '0 0 8px', fontSize: 20 }}>Bring a project into Aetheria</h2><p style={{ color: '#94a3b8', fontSize: 13, lineHeight: 1.65, margin: '0 0 18px' }}>Choose a folder to let {agent.name} read its text files, prepare edits, and save approved changes back into that folder. Files stay on your device until you ask the model to work on them.</p><button type="button" onClick={() => void chooseFolder()} disabled={busy} style={{ ...buttonStyle, background: '#0284c7', color: 'white', border: 0, padding: '10px 15px' }}>{busy ? <LoaderCircle size={15} className="animate-spin"/> : <FolderOpen size={15}/>}Choose project folder</button><div style={{ color: '#64748b', fontSize: 10, lineHeight: 1.5, marginTop: 12 }}>The browser will ask you to grant access. Generated folders such as node_modules and .git are skipped.</div></div></div> : <div style={{ flex: 1, minHeight: 0, display: 'grid', gridTemplateColumns: 'minmax(180px, 260px) minmax(0,1fr)' }}>
        <aside style={{ overflowY: 'auto', borderRight: '1px solid rgba(148,163,184,.12)', padding: '10px 8px' }}><div style={{ padding: '5px 8px 10px', color: '#64748b', fontSize: 10, fontWeight: 800, textTransform: 'uppercase' }}>Project files · {files.length}</div>{files.map((file) => <button key={file.path} type="button" onClick={() => { setSelectedPath(file.path); setChanges([]); }} title={file.path} style={{ width: '100%', padding: '7px 8px', textAlign: 'left', border: 0, borderRadius: 6, color: selectedPath === file.path ? '#bae6fd' : '#a8b3c4', background: selectedPath === file.path ? 'rgba(14,165,233,.14)' : 'transparent', cursor: 'pointer', fontSize: 11, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}><FileCode2 size={12} style={{ verticalAlign: 'middle', marginRight: 7 }}/>{file.path}</button>)}</aside>
        <main style={{ minWidth: 0, minHeight: 0, display: 'flex', flexDirection: 'column' }}>
          <div style={{ minHeight: 0, flex: 1, display: 'flex', flexDirection: 'column', padding: 12, gap: 8 }}><div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: 10, color: '#94a3b8', fontSize: 11 }}><span style={{ color: '#dbeafe' }}>{proposedChange ? `Review · ${proposedChange.path}` : selectedFile?.path || 'Select a file'}</span>{proposedChange && <span>{changeIndex + 1} of {changes.length} · {providerUsed}</span>}</div><textarea spellCheck={false} value={proposedChange ? proposedChange.content : selectedFile?.content || ''} onChange={(event) => proposedChange && setChanges((current) => current.map((change, index) => index === changeIndex ? { ...change, content: event.target.value } : change))} readOnly={!proposedChange} style={{ width: '100%', flex: 1, minHeight: 120, resize: 'none', boxSizing: 'border-box', borderRadius: 8, border: '1px solid rgba(148,163,184,.16)', background: '#070d18', color: '#cbd5e1', padding: 12, font: '12px/1.6 ui-monospace,SFMono-Regular,Consolas,monospace', outline: 'none' }}/>{proposedChange?.reason && <div style={{ color: '#93c5fd', fontSize: 11 }}>{proposedChange.reason}</div>}</div>
          <form onSubmit={(event) => void askAgent(event)} style={{ borderTop: '1px solid rgba(148,163,184,.14)', padding: 12, display: 'grid', gap: 9 }}><label htmlFor="project-edit-request" style={{ fontSize: 11, fontWeight: 700, color: '#cbd5e1' }}>Ask {agent.name} to change this project</label><textarea id="project-edit-request" value={request} onChange={(event) => setRequest(event.target.value)} placeholder="For example: fix the mobile navigation and add a test for the updated behavior" rows={3} style={{ resize: 'vertical', minHeight: 66, maxHeight: 150, borderRadius: 8, border: '1px solid rgba(148,163,184,.18)', background: '#111b2b', color: 'white', padding: 10, fontSize: 12, lineHeight: 1.5 }}/><div style={{ display: 'flex', alignItems: 'center', gap: 8 }}><span role="status" style={{ flex: 1, color: changes.length ? '#6ee7b7' : '#8593a8', fontSize: 10, lineHeight: 1.4 }}>{notice}{!notice && `${Math.min(availableContext.length, MAX_CONTEXT_CHARS).toLocaleString()} project characters available to the agent.`}</span>{changes.length > 0 && <button type="button" onClick={saveChanges} disabled={saving} style={{ ...buttonStyle, color: '#6ee7b7', borderColor: 'rgba(16,185,129,.35)' }}>{saving ? <LoaderCircle size={14}/> : <Save size={14}/>}Apply {changes.length} change{changes.length === 1 ? '' : 's'}</button>}<button type="submit" disabled={busy || saving || !request.trim()} style={{ ...buttonStyle, border: 0, background: busy ? '#334155' : '#0284c7', color: 'white', opacity: !request.trim() ? .55 : 1 }}>{busy ? <LoaderCircle size={14} className="animate-spin"/> : changes.length ? <Check size={14}/> : <FileCode2 size={14}/>} {busy ? 'Working…' : changes.length ? 'Regenerate' : 'Ask agent'}</button></div></form>
        </main>
      </div>}
      <footer style={{ borderTop: '1px solid rgba(148,163,184,.12)', padding: '8px 14px', color: '#66758c', fontSize: 10 }}>Only the folder you choose is accessible. Review proposed content before applying it. Project text is sent to the assigned AI provider when you ask for edits; with LM Studio it stays on your PC. Credential files, generated folders, binary files, and files over 256 KB are skipped.</footer>
    </section>
  </div>, document.body);
}
