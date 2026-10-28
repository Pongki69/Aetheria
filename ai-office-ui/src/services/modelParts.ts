import type { Object3D } from 'three';

export type ModelPart = { id: string; name: string };

export function visitModelParts(root: Object3D, visit: (object: Object3D, id: string) => void) {
  const walk = (object: Object3D, id: string) => {
    if ('isMesh' in object && object.isMesh) visit(object, id);
    object.children.forEach((child, index) => walk(child, `${id}/${index}`));
  };
  walk(root, '0');
}

export function applyModelParts(root: Object3D, hiddenParts: string[]) {
  const hidden = new Set(hiddenParts);
  visitModelParts(root, (object, id) => {
    object.visible = !hidden.has(id);
    if (object.visible) {
      let parent = object.parent;
      while (parent) { if (!('isMesh' in parent && parent.isMesh)) parent.visible = true; parent = parent.parent; }
    }
  });
}
