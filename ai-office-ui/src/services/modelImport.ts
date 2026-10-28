import * as THREE from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { extractModelArchive, isSevenZip } from './modelArchive';
import { chooseArchiveModelFiles } from './modelArchiveInventory';
import { restoreArchiveAlphaMaps } from './modelAlphaMaps';

function bytesToBase64(bytes: Uint8Array): string {
  let binary = '';
  const chunkSize = 0x8000;
  for (let offset = 0; offset < bytes.length; offset += chunkSize) binary += String.fromCharCode(...bytes.subarray(offset, offset + chunkSize));
  return btoa(binary);
}

async function modelArchiveToGltf(archiveBlob: Blob, combineModels = false): Promise<Blob> {
  if (archiveBlob.size > 150 * 1024 * 1024) throw new Error('This model archive is over the 150 MB import limit.');
  const files = await extractModelArchive(new Uint8Array(await archiveBlob.arrayBuffer()));
  const glbEntries = [...files.entries()].filter(([path]) => path.toLowerCase().endsWith('.glb'));
  const glb = glbEntries[0];
  if (glb && (!combineModels || glbEntries.length === 1)) {
    const bytes = new ArrayBuffer(glb[1].byteLength);
    new Uint8Array(bytes).set(glb[1]);
    return new Blob([bytes], { type: 'model/gltf-binary' });
  }
  const gltfEntry = combineModels && glbEntries.length > 1 ? undefined : [...files.entries()].find(([path]) => /(?:^|\/)scene\.gltf$/i.test(path)) || [...files.entries()].find(([path]) => path.toLowerCase().endsWith('.gltf'));
  if (!gltfEntry) {
    // Use one format to avoid duplicating FBX/DAE versions of the same asset.
    // Character archives often split the head, body, and outfit across files.
    const daeEntries = [...files.entries()].filter(([path]) => /\.dae$/i.test(path));
    const fbxEntries = [...files.entries()].filter(([path]) => /\.fbx$/i.test(path));
    const mmdEntries = [...files.entries()].filter(([path]) => /\.(?:pmx|pmd)$/i.test(path));
    const candidates = glbEntries.length ? glbEntries : daeEntries.length ? daeEntries : fbxEntries.length ? fbxEntries : mmdEntries;
    const selectedPaths = new Set(chooseArchiveModelFiles(candidates.map(([path]) => path), combineModels));
    const sourceEntries = candidates.filter(([path]) => selectedPaths.has(path));
    if (!sourceEntries.length) throw new Error('The model archive does not contain a supported GLB, glTF, FBX, DAE, PMX, or PMD model.');
    const imageFiles = [...files.entries()].filter(([path]) => /\.(?:png|jpe?g|webp|bmp|tga|sph|spa)$/i.test(path));
    const objectUrls = new Map<string, string>();
    const modelUrls: string[] = [];
    const referencedTextureFiles = new Set<string>();
    imageFiles.forEach(([path, bytes]) => {
      const mime = /\.jpe?g$/i.test(path) ? 'image/jpeg' : /\.(sph|spa)$/i.test(path) ? 'image/bmp' : `image/${path.split('.').pop()?.toLowerCase() || 'png'}`;
      objectUrls.set(path.toLowerCase(), URL.createObjectURL(new Blob([new Uint8Array(bytes)], { type: mime })));
    });
    const manager = new THREE.LoadingManager();
    manager.setURLModifier((url) => {
      const normalizedUrl = decodeURIComponent(url).split(/[?#]/, 1)[0].replace(/\\/g, '/').toLowerCase();
      const file = imageFiles.find(([path]) => path.toLowerCase() === normalizedUrl) || imageFiles.find(([path]) => {
        const normalizedPath = path.toLowerCase();
        return normalizedPath === normalizedUrl || normalizedPath.split('/').pop() === normalizedUrl.split('/').pop();
      });
      if (file) referencedTextureFiles.add(file[0]);
      return file ? objectUrls.get(file[0].toLowerCase()) || url : url;
    });

    try {
      const [{ GLTFExporter }, { FBXLoader }, { ColladaLoader }] = await Promise.all([
        import('three/addons/exporters/GLTFExporter.js'),
        import('three/addons/loaders/FBXLoader.js'),
        import('three/addons/loaders/ColladaLoader.js'),
      ]);
      let resourcesLoaded: (() => void) | undefined;
      let resourcesStarted = false;
      const allResourcesLoaded = new Promise<void>((resolve) => { resourcesLoaded = resolve; });
      manager.onStart = () => { resourcesStarted = true; };
      manager.onLoad = () => resourcesLoaded?.();
      const exportRoot = new THREE.Group();
      const animations: THREE.AnimationClip[] = [];
      const mmdScenes: THREE.Object3D[] = [];
      for (const sourceEntry of sourceEntries) {
      let scene: THREE.Object3D;
      const basePath = sourceEntry[0].slice(0, sourceEntry[0].lastIndexOf('/') + 1);
      if (/\.(?:pmx|pmd)$/i.test(sourceEntry[0])) {
        const { MMDLoader } = await import('three-stdlib');
        const buffer = new ArrayBuffer(sourceEntry[1].byteLength);
        new Uint8Array(buffer).set(sourceEntry[1]);
        const url = URL.createObjectURL(new Blob([buffer]));
        modelUrls.push(url);
        const extension = sourceEntry[0].split('.').pop()?.toLowerCase();
        // The fragment lets MMDLoader identify the format while the browser
        // still retrieves the local Blob, with no external model requests.
        scene = await new MMDLoader(manager).setResourcePath(basePath).loadAsync(`${url}#source.${extension}`);
        mmdScenes.push(scene);
      } else if (/\.(?:fbx|glb)$/i.test(sourceEntry[0])) {
        const buffer = new ArrayBuffer(sourceEntry[1].byteLength);
        new Uint8Array(buffer).set(sourceEntry[1]);
        if (/\.glb$/i.test(sourceEntry[0])) {
          const loaded = await new GLTFLoader(manager).parseAsync(buffer, '');
          scene = loaded.scene;
          scene.animations = loaded.animations;
        } else scene = new FBXLoader(manager).parse(buffer, basePath);
      } else {
        const collada = new ColladaLoader(manager).parse(new TextDecoder().decode(sourceEntry[1]), basePath);
        if (!collada?.scene) throw new Error('The DAE model in this archive could not be opened.');
        scene = collada.scene;
      }
      scene.name = sourceEntry[0];
      exportRoot.add(scene);
      animations.push(...scene.animations);
      }
      if (resourcesStarted) {
        await Promise.race([allResourcesLoaded, new Promise<never>((_, reject) => window.setTimeout(() => reject(new Error('Timed out loading model textures from this archive.')), 30_000))]);
      }
      for (const mmd of mmdScenes) {
        mmd.traverse((object) => {
          if (!(object instanceof THREE.Mesh)) return;
          const convert = (material: THREE.Material) => {
            if (!(material instanceof THREE.MeshToonMaterial)) return material;
            // glTF cannot retain MMD's custom toon/sphere shaders. Keep the
            // diffuse textures, alpha, colors, and skinning in a lit material.
            if (material.map) material.map.colorSpace = THREE.SRGBColorSpace;
            return new THREE.MeshStandardMaterial({
              name: material.name, color: material.color.clone(), map: material.map,
              opacity: material.opacity, transparent: material.transparent,
              alphaTest: material.alphaTest, side: material.side,
              // MMD ambient light is modulated by the diffuse texture. An
              // untextured emissive term adds gray over even black texels.
              emissive: material.emissive.clone(), emissiveMap: material.emissiveMap || material.map,
              roughness: 1, metalness: 0, depthWrite: !material.transparent
            });
          };
          object.material = Array.isArray(object.material) ? object.material.map(convert) : convert(object.material);
        });
      }
      await restoreArchiveAlphaMaps(exportRoot, objectUrls, (path) => {
        referencedTextureFiles.add(imageFiles.find(([name]) => name.toLowerCase() === path)?.[0] || path);
      });
      // Exporters treat a Scene as a container and export only its children.
      // Wrapping it preserves Collada's root up-axis and unit conversions.
      exportRoot.userData.aetheriaArchive = {
        modelFiles: [...files.keys()].filter((path) => /\.(?:glb|gltf|dae|fbx|pmx|pmd)$/i.test(path)),
        activeModelFiles: sourceEntries.map(([path]) => path),
        textureFiles: imageFiles.map(([path]) => path),
        referencedTextureFiles: [...referencedTextureFiles]
      };
      const exported = await new GLTFExporter().parseAsync(exportRoot, { binary: true, animations });
      if (!(exported instanceof ArrayBuffer)) throw new Error('Could not convert this model archive to glTF.');
      return new Blob([exported], { type: 'model/gltf-binary' });
    } finally {
      objectUrls.forEach((url) => URL.revokeObjectURL(url));
      modelUrls.forEach((url) => URL.revokeObjectURL(url));
    }
  }

  type GltfPackage = { buffers?: Array<{ uri?: string }>; images?: Array<{ uri?: string }> };
  const document = JSON.parse(new TextDecoder().decode(gltfEntry[1])) as GltfPackage;
  const extensionMime: Record<string, string> = { bin: 'application/octet-stream', png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', webp: 'image/webp', avif: 'image/avif', ktx2: 'image/ktx2' };
  const embedResource = (uri?: string) => {
    if (!uri || /^data:/i.test(uri)) return uri;
    if (/^(?:https?:|blob:)/i.test(uri)) throw new Error('This Sketchfab model references a remote asset. Import a package with bundled glTF resources.');
    const resolved = new URL(uri, `https://archive.local/${gltfEntry[0]}`);
    if (resolved.hostname !== 'archive.local') throw new Error('The Sketchfab model references a remote asset that cannot be bundled safely.');
    const path = decodeURIComponent(resolved.pathname.replace(/^\//, ''));
    const resource = files.get(path);
    if (!resource) throw new Error(`A model resource is missing from the Sketchfab archive: ${path}`);
    const extension = path.split('.').pop()?.toLowerCase() || 'bin';
    return `data:${extensionMime[extension] || 'application/octet-stream'};base64,${bytesToBase64(resource)}`;
  };
  for (const buffer of document.buffers || []) buffer.uri = embedResource(buffer.uri);
  for (const image of document.images || []) image.uri = embedResource(image.uri);
  return new Blob([JSON.stringify(document)], { type: 'model/gltf+json' });
}

export async function normalizeModelBlob(blob: Blob, combineModels = false): Promise<Blob> {
  const signature = new Uint8Array(await blob.slice(0, 6).arrayBuffer());
  const isZip = signature[0] === 0x50 && signature[1] === 0x4b
    && ((signature[2] === 0x03 && signature[3] === 0x04)
      || (signature[2] === 0x05 && signature[3] === 0x06)
      || (signature[2] === 0x07 && signature[3] === 0x08));
  return (isZip || isSevenZip(signature)) ? modelArchiveToGltf(blob, combineModels) : blob;
}
