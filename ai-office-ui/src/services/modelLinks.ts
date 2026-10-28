export function sketchfabModelUid(value: string): string | null {
  try {
    const url = new URL(value);
    if (!isSketchfabHost(value) || !/\/(?:3d-models|models)\//i.test(url.pathname)) return null;
    return url.pathname.match(/(?:^|[-/])([a-f0-9]{32})\/?$/i)?.[1] || null;
  } catch {return null;}
}
export function isSketchfabHost(value: string): boolean {
  try {return ['sketchfab.com','www.sketchfab.com','m.sketchfab.com'].includes(new URL(value).hostname.toLowerCase());}
  catch {return false;}
}
export function isSpritersResourceModelPage(value: string): boolean {
  try {
    const url = new URL(value);
    return url.protocol === 'https:' && url.hostname.toLowerCase() === 'models.spriters-resource.com' && /\/asset\/\d+\/?$/i.test(url.pathname);
  } catch {return false;}
}
export function isSkowtPage(value: string): boolean {
  try {
    const url = new URL(value.trim());
    return ['https:','http:'].includes(url.protocol) && !url.username && !url.password && ['skowt.cc','www.skowt.cc','wanderer.moe','www.wanderer.moe'].includes(url.hostname.toLowerCase());
  } catch {return false;}
}
export const SKOWT_MODEL_IMPORT_MESSAGE = 'Skowt currently offers view-only 3D models, without model downloads. Open its viewer, or upload a GLB, glTF, or model ZIP obtained separately. Image and video exports cannot be imported as 3D models.';
