import { useState } from 'react';

type Browser = 'Chrome' | 'Edge' | 'Firefox' | 'Safari' | 'Opera' | 'Other browser';

export function detectImportBrowser(userAgent: string): Browser {
  if (/Edg(?:e|A|iOS)?\//i.test(userAgent)) return 'Edge';
  if (/OPR\/|Opera/i.test(userAgent)) return 'Opera';
  if (/Firefox\/|FxiOS\//i.test(userAgent)) return 'Firefox';
  if (/Chrome\/|CriOS\//i.test(userAgent)) return 'Chrome';
  if (/Safari\//i.test(userAgent)) return 'Safari';
  return 'Other browser';
}

const downloadMenus: Record<Browser, string> = {
  Chrome: 'Open Chrome’s ⋮ menu → Downloads to find the ZIP.',
  Edge: 'Open Edge’s … menu → Downloads to find the ZIP.',
  Firefox: 'Use Firefox’s Downloads arrow in the toolbar to find the ZIP.',
  Safari: 'Use Safari’s Downloads button beside the address bar to find the ZIP.',
  Opera: 'Open Opera’s menu → Downloads to find the ZIP.',
  'Other browser': 'Open your browser’s Downloads menu to find the ZIP.',
};

export function BrowserModelImportGuide({ url, blocked, onUpload }: { url: string; blocked: boolean; onUpload: () => void }) {
  const [browser, setBrowser] = useState<Browser>(() => detectImportBrowser(navigator.userAgent));
  const [copyStatus, setCopyStatus] = useState('');
  const validUrl = (() => {
    try {
      const parsed = new URL(url);
      return parsed.protocol === 'https:' && parsed.hostname === 'models.spriters-resource.com' ? parsed.href : null;
    } catch { return null; }
  })();
  if (!validUrl) return null;
  return <details className="browser-import-guide" open={blocked || undefined}>
    <summary>{blocked ? 'Import this model through your browser' : 'Need help importing this link?'}</summary>
    <div className="browser-import-body">
      <label>Browser guide<select value={browser} onChange={(event) => setBrowser(event.target.value as Browser)}>{Object.keys(downloadMenus).map((name) => <option key={name}>{name}</option>)}</select></label>
      <p>We detect the browser running this page, which may differ from your default browser. Choose yours above.</p>
      <ol>
        <li>Open the model page in {browser === 'Other browser' ? 'your browser' : browser}. Sign in there if the site asks.</li>
        <li>Use the model page’s download button to save its ZIP. Complete any site checks in that browser.</li>
        <li>{downloadMenus[browser]} Keep the archive zipped.</li>
        <li>Return to Aetheria, choose Upload File, and select the ZIP. Aetheria converts a supported model for you.</li>
      </ol>
      <div className="browser-import-actions"><a href={validUrl} target="_blank" rel="noopener noreferrer">Open model page ↗</a><button type="button" onClick={async () => { try { await navigator.clipboard.writeText(validUrl); setCopyStatus('Link copied. Paste it into your browser.'); } catch { setCopyStatus('Select and copy the URL from the model link field.'); } }}>Copy link</button></div>
      {copyStatus && <p role="status">{copyStatus}</p>}
      <p>If the page opens inside Aetheria, copy the link into your usual browser. Its login stays there; Aetheria cannot automatically access that session or retrieve its downloads.</p>
      <button type="button" className="browser-import-upload" onClick={onUpload}>Upload downloaded ZIP</button>
      <p>ZIPs can contain GLB, glTF, FBX, DAE, or MMD models (PMX/PMD). Keep the model and its texture folders together. A login may not resolve every blocked download.</p>
    </div>
  </details>;
}
