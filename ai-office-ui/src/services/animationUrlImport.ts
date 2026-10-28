import { authRequestBlob, getAuthToken } from './authClient';
import { isSketchfabHost, isSkowtPage, isSpritersResourceModelPage, sketchfabModelUid, SKOWT_MODEL_IMPORT_MESSAGE } from './modelLinks';
import { importAnimationSource } from './animationImport';

export async function importAnimationUrl(value: string) {
  let url: URL;
  try {url = new URL(value.trim());} catch {throw new Error('Enter a valid model URL.');}
  if (!['https:','http:'].includes(url.protocol) || url.username || url.password) throw new Error('Use an HTTP or HTTPS model URL without login details.');
  if (isSkowtPage(url.href)) throw new Error(SKOWT_MODEL_IMPORT_MESSAGE);
  let blob: Blob;
  let filename: string;
  let resourcePath = '';
  if (isSketchfabHost(url.href) || isSpritersResourceModelPage(url.href)) {
    const sketchfab = isSketchfabHost(url.href);
    const uid = sketchfabModelUid(url.href);
    if (sketchfab && !uid) throw new Error('Use a Sketchfab model page URL containing its 32-character model ID.');
    const token = getAuthToken();
    if (!token) throw new Error('Sign in again before importing animations from this model site.');
    blob = await authRequestBlob(sketchfab ? '/api/sketchfab/download' : '/api/spriters-resource/preview', {method:'POST',body:JSON.stringify({url:url.href}),signal:AbortSignal.timeout(60_000)},token);
    filename = sketchfab ? `Sketchfab-${uid!.slice(0,8)}.zip` : `ModelsResource-${url.pathname.match(/\/asset\/(\d+)/i)?.[1] || 'animation'}.glb`;
  } else {
    if (!/\.(glb|gltf|fbx|zip|7z)$/i.test(url.pathname)) throw new Error('Use a direct GLB, glTF, FBX, or ZIP / 7z link, a Sketchfab model page, or The Models Resource asset page.');
    let response: Response;
    try {response = await fetch(url.href,{signal:AbortSignal.timeout(60_000),credentials:'omit'});}
    catch {throw new Error('Could not download this link. The host may block browser requests. Download the file in your browser and choose Upload File.');}
    if (!response.ok) throw new Error(`The animation model could not be downloaded (${response.status}). Download it in your browser and choose Upload File.`);
    if (Number(response.headers.get('Content-Length')) > 150 * 1024 * 1024) throw new Error('Choose an animation source under 150 MB.');
    blob = await response.blob();
    filename = decodeURIComponent(url.pathname.split('/').pop() || 'animation.glb');
    resourcePath = new URL('.', response.url || url.href).href;
    if (/text\/html/i.test(blob.type)) throw new Error('This link returned a web page. Use its direct model download link or upload the downloaded file.');
  }
  return importAnimationSource(new File([blob],filename,{type:blob.type}),resourcePath);
}
