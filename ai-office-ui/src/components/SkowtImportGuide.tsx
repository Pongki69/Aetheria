import { isSkowtPage, SKOWT_MODEL_IMPORT_MESSAGE } from '../services/modelLinks';
import { ExternalLink } from 'lucide-react';

export function SkowtPreviewNotice({url,onUpload}: {url: string;onUpload: () => void}) {
  if (!isSkowtPage(url)) return null;
  const viewer = new URL(url.trim()); viewer.protocol='https:';
  return <section className="agent-deploy-preview-empty skowt-preview-notice" aria-label="Skowt preview unavailable">
    <ExternalLink size={36} />
    <h4>This model opens on Skowt</h4>
    <p>Skowt blocks embedded viewers and does not offer 3D model downloads. This page link cannot display or become an agent inside Aetheria.</p>
    <div><a href={viewer.href} target="_blank" rel="noopener noreferrer">Open model on Skowt ↗</a><button type="button" onClick={onUpload}>Upload a 3D model file</button></div>
    <p>To preview and deploy an agent here, upload a GLB, glTF, or supported model ZIP from a downloadable source.</p>
  </section>;
}

export function SkowtImportGuide({url,onUpload}: {url: string;onUpload: () => void}) {
  if (!isSkowtPage(url)) return null;
  const viewer = new URL(url.trim()); viewer.protocol='https:';
  return <section className="skowt-import-guide" aria-label="Skowt model information">
    <strong>Skowt · view-only models</strong>
    <p>{SKOWT_MODEL_IMPORT_MESSAGE}</p>
    <div><a href={viewer.href} target="_blank" rel="noopener noreferrer">Open Skowt viewer ↗</a><button type="button" onClick={onUpload}>Upload a model file</button></div>
    <a href="https://skowt.cc/faq" target="_blank" rel="noopener noreferrer">Skowt’s model availability ↗</a>
  </section>;
}
