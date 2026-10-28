import SevenZip from '7z-wasm';
import wasmUrl from '7z-wasm/7zz.wasm?url';

// Each import has its own worker and virtual filesystem. Terminating the worker
// releases the archive, decoder memory and extracted files together.
self.onmessage = async (event: MessageEvent<ArrayBuffer>) => {
  try {
    const output: string[] = [];
    const seven = await SevenZip({locateFile: () => wasmUrl, stdin: () => -1,
      print: (line) => output.push(line), printErr: (line) => output.push(line)});
    seven.FS.writeFile('/model.7z', new Uint8Array(event.data));
    const run = (args: string[]) => {
      output.length = 0;
      const status = seven.callMain(args) as unknown as number;
      const log = output.join('\n');
      if (/Encrypted = \+|password|Wrong password/i.test(log)) throw new Error('Password-protected 7z files are not supported. Extract it first and upload an unencrypted archive.');
      if (status) throw new Error('This 7z archive could not be opened. It may be damaged or require a password.');
      return log;
    };
    const listing = run(['l', '-slt', '-p', '/model.7z']);
    const entries = listing.split(/\r?\n----------\r?\n/).slice(1).join('\n').split(/\r?\n\r?\n/);
    let unpacked = 0;
    if (entries.length > 5000) throw new Error('This archive contains too many files. Keep fewer than 5,000 files.');
    for (const entry of entries) {
      const path = entry.match(/^Path = (.+)$/m)?.[1]?.replace(/\\/g, '/').trim();
      if (path && (/^(?:\/|[a-z]:)/i.test(path) || path.split('/').includes('..'))) throw new Error('This archive contains an invalid file path.');
      unpacked += Number(entry.match(/^Size = (\d+)/m)?.[1] || 0);
    }
    if (unpacked > 500 * 1024 * 1024) throw new Error('This archive expands beyond the 500 MB import limit.');
    seven.FS.mkdir('/models');
    run(['x', '/model.7z', '-o/models', '-y', '-p']);
    const files: Array<[string, Uint8Array]> = [];
    let total = 0;
    const collect = (folder: string) => {
      for (const name of seven.FS.readdir(folder)) {
        if (name === '.' || name === '..') continue;
        const path = `${folder}/${name}`;
        const stat = seven.FS.lstat(path);
        if (seven.FS.isLink(stat.mode)) throw new Error('Linked files are not supported in model archives.');
        if (seven.FS.isDir(stat.mode)) collect(path);
        else {
          total += stat.size;
          if (total > 500 * 1024 * 1024 || files.length >= 5000) throw new Error('This archive exceeds the model import limits.');
          files.push([path.slice('/models/'.length), seven.FS.readFile(path)]);
        }
      }
    };
    collect('/models');
    self.postMessage({files});
  } catch (error) {
    self.postMessage({error: error instanceof Error ? error.message : 'Could not extract this 7z archive.'});
  }
};
