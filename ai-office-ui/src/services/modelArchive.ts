import { unzipModelFiles } from './modelZip';

export function isSevenZip(bytes: Uint8Array) {
  return [0x37, 0x7a, 0xbc, 0xaf, 0x27, 0x1c].every((value, index) => bytes[index] === value);
}

export async function extractModelArchive(bytes: Uint8Array): Promise<Map<string, Uint8Array>> {
  if (!isSevenZip(bytes)) return unzipModelFiles(bytes);
  return new Promise((resolve, reject) => {
    const worker = new Worker(new URL('./sevenZip.worker.ts', import.meta.url), {type: 'module'});
    const finish = () => {clearTimeout(timer); worker.terminate();};
    const timer = setTimeout(() => {finish(); reject(new Error('Extracting this 7z archive took too long. Try a smaller archive.'));}, 120_000);
    worker.onmessage = (event: MessageEvent<{files?: Array<[string, Uint8Array]>; error?: string}>) => {
      finish();
      if (event.data.error) reject(new Error(event.data.error));
      else resolve(new Map(event.data.files));
    };
    worker.onerror = () => {finish(); reject(new Error('Could not start the 7z importer. Reload the app and try again.'));};
    const buffer = bytes.slice().buffer;
    worker.postMessage(buffer, [buffer]);
  });
}
