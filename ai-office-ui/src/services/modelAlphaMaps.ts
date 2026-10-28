import { CanvasTexture, ImageLoader, Mesh, type Object3D, type MeshStandardMaterial } from 'three';

// Some game archives provide color (_C) and grayscale opacity (_A) as
// separate images, but their exported material only names the color image.
// glTF has no separate alpha map slot: bake the mask into base-color alpha.
export async function restoreArchiveAlphaMaps(root: Object3D, imageUrls: Map<string, string>, onReference: (path: string) => void) {
  const materials = new Set<MeshStandardMaterial>();
  root.traverse((object) => {
    if (object instanceof Mesh) (Array.isArray(object.material) ? object.material : [object.material]).forEach((material) => materials.add(material));
  });
  for (const material of materials) {
    const source = material.map;
    if (!source?.image || material.alphaMap) continue;
    const image = source.image as HTMLImageElement;
    const colorPath = [...imageUrls.entries()].find(([, url]) => url === (image.currentSrc || image.src))?.[0];
    if (!colorPath || !/_c\.(?:png|jpe?g)$/i.test(colorPath)) continue;
    const alphaPath = colorPath.replace(/_c(\.[^.]+)$/i, '_a$1');
    const maskUrl = imageUrls.get(alphaPath);
    if (!maskUrl) continue;
    const mask = await new ImageLoader().loadAsync(maskUrl);
    const colorCanvas = document.createElement('canvas');
    colorCanvas.width = image.width; colorCanvas.height = image.height;
    const maskCanvas = document.createElement('canvas');
    maskCanvas.width = image.width; maskCanvas.height = image.height;
    const colorContext = colorCanvas.getContext('2d'); const maskContext = maskCanvas.getContext('2d');
    if (!colorContext || !maskContext) throw new Error('Could not prepare the model opacity textures.');
    colorContext.drawImage(image, 0, 0); maskContext.drawImage(mask, 0, 0, image.width, image.height);
    const pixels = colorContext.getImageData(0, 0, image.width, image.height);
    const alphaPixels = maskContext.getImageData(0, 0, image.width, image.height);
    for (let i = 0; i < pixels.data.length; i += 4) pixels.data[i + 3] = Math.round(pixels.data[i + 3] * alphaPixels.data[i + 1] / 255);
    colorContext.putImageData(pixels, 0, 0);
    const texture = new CanvasTexture(colorCanvas);
    texture.name = source.name; texture.colorSpace = source.colorSpace; texture.flipY = source.flipY;
    texture.wrapS = source.wrapS; texture.wrapT = source.wrapT; texture.channel = source.channel;
    texture.offset.copy(source.offset); texture.repeat.copy(source.repeat); texture.center.copy(source.center); texture.rotation = source.rotation;
    material.map = texture; material.transparent = true; material.depthWrite = false; material.needsUpdate = true;
    material.userData.aetheriaAlphaMap = alphaPath;
    onReference(alphaPath);
  }
}
