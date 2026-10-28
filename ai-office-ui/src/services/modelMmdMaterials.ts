import { Mesh, MeshStandardMaterial, type Object3D } from 'three';
import { readArchiveInventory } from './modelArchiveInventory';

// Repair models converted before MMD ambient light was texture-mapped.
// Scope this to our MMD archive metadata so native glTF emission is preserved.
export function repairMmdMaterials(root: Object3D) {
  if (!readArchiveInventory(root)?.activeModelFiles.some((path) => /\.(pmx|pmd)$/i.test(path))) return;
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    for (const material of materials) {
      if (!(material instanceof MeshStandardMaterial) || !material.map || material.emissiveMap) continue;
      material.emissiveMap = material.map;
      material.needsUpdate = true;
    }
  });
}
