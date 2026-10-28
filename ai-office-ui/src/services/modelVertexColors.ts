import { Mesh, type Object3D } from 'three';
import { readArchiveInventory } from './modelArchiveInventory';

export function defaultVertexColorTint(root: Object3D): boolean {
  const source = readArchiveInventory(root);
  // Game exports often store shader masks in vertex colors, not visible tint.
  // Keep native glTF behavior; converted DAE/FBX models default to texture color.
  return !source?.activeModelFiles.some((name) => /\.(dae|fbx)$/i.test(name));
}

export function applyVertexColorTint(root: Object3D, enabled = defaultVertexColorTint(root)) {
  root.traverse((object) => {
    if (!(object instanceof Mesh)) return;
    const materials = Array.isArray(object.material) ? object.material : [object.material];
    materials.forEach((material) => {
      if (!('map' in material) || !material.map || !('vertexColors' in material)) return;
      const value = enabled && !!object.geometry.getAttribute('color');
      if (material.vertexColors !== value) { material.vertexColors = value; material.needsUpdate = true; }
    });
  });
}
