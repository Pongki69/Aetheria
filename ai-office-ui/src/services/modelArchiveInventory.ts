import type { Object3D } from 'three';

export type ModelArchiveInventory = {
  modelFiles: string[]; activeModelFiles: string[];
  textureFiles: string[]; referencedTextureFiles: string[];
};

export function chooseArchiveModelFiles(paths: string[], combine: boolean): string[] {
  if (!combine) return paths.slice(0, 1);
  const complete = paths.find((path) => /^(?:combined|complete|full)[^/]*\.(?:glb|dae|fbx|pmx|pmd)$/i.test(path.split('/').pop() || ''));
  return complete ? [complete] : paths;
}

export function readArchiveInventory(root: Object3D): ModelArchiveInventory | null {
  let inventory: ModelArchiveInventory | null = null;
  root.traverse((node) => {
    const value = node.userData.aetheriaArchive;
    if (inventory || !value || typeof value !== 'object') return;
    if (['modelFiles', 'activeModelFiles', 'textureFiles', 'referencedTextureFiles'].every((key) => Array.isArray(value[key]) && value[key].every((entry: unknown) => typeof entry === 'string'))) inventory = value as ModelArchiveInventory;
  });
  return inventory;
}
