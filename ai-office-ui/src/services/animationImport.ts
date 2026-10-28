import { AnimationClip, LoadingManager, Mesh, SkinnedMesh, PropertyBinding, QuaternionKeyframeTrack, Texture, VectorKeyframeTrack, type Object3D, type Bone } from 'three';
import { GLTFLoader } from 'three/addons/loaders/GLTFLoader.js';
import { normalizeModelBlob } from './modelImport';
import { animationBoneName, boneRestPose, rigBones, type AnimationSource } from './animationRetargeting';
import { humanoidBoneRole } from './humanoidBones';

function disposeDonor(root: Object3D) {
  const resources = new Set<{dispose: () => void}>();
  root.traverse((node) => {
    if (!(node instanceof Mesh)) return;
    resources.add(node.geometry);
    for (const material of Array.isArray(node.material) ? node.material : [node.material]) {
      resources.add(material);
      Object.values(material).forEach((value) => {if (value instanceof Texture) resources.add(value);});
    }
  });
  resources.forEach((resource) => resource.dispose());
}

export async function importAnimationSource(file: File, resourcePath = ''): Promise<AnimationSource> {
  if (!/\.(glb|gltf|fbx|zip|7z)$/i.test(file.name)) throw new Error('Choose an animated GLB, glTF, FBX, or model ZIP / 7z.');
  if (file.size > 150 * 1024 * 1024) throw new Error('Choose an animation source under 150 MB.');
  let root: Object3D | undefined;
  let clips: AnimationClip[];
  try {
    if (/\.fbx$/i.test(file.name)) {
      const {FBXLoader} = await import('three/addons/loaders/FBXLoader.js');
      // Donor textures are unused. Keep texture requests local while extracting its rig.
      const manager = new LoadingManager().setURLModifier(() => 'data:image/png;base64,iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=');
      root = new FBXLoader(manager).parse(await file.arrayBuffer(), ''); clips = root.animations;
    } else {
      const blob = await normalizeModelBlob(file, true);
      const loaded = await new GLTFLoader().parseAsync(await blob.arrayBuffer(), resourcePath);
      root = loaded.scene; clips = loaded.animations;
    }
    return captureAnimationSource(root, clips, file.name);
  } finally {if (root) disposeDonor(root);}
}

export function captureAnimationSource(root: Object3D, clips: AnimationClip[], sourceName: string): AnimationSource {
    if (!clips.length) throw new Error('This model contains no animation clips. Choose an animated model.');
    const rig = rigBones(root);
    if (!rig.length) throw new Error('This animation source has no skeleton. Choose a rigged, animated model.');
    const id = crypto.randomUUID().replace(/-/g, '');
    const rigNodes: NonNullable<AnimationSource['rig']> = [];
    const nodeIds = new Map<Object3D,string>();
    const capture = (node: Object3D, parent: string | null) => {
      const nodeId = String(rigNodes.length); nodeIds.set(node,nodeId);
      const rest = 'isBone' in node && node.isBone ? boneRestPose(node as import('three').Bone) : {position:node.position,rotation:node.quaternion,scale:node.scale};
      rigNodes.push({id:nodeId,parent,name:node.name,bone:!!('isBone' in node && node.isBone),position:rest.position.toArray(),rotation:rest.rotation.toArray(),scale:rest.scale.toArray()});
      node.children.forEach((child) => capture(child,nodeId));
    };
    capture(root,null);
    const bones: AnimationSource['bones'] = {};
    const aliases = new Map<string, string>();
    const serialized: AnimationSource['clips'] = [];
    let valueCount = 0;
    clips.forEach((clip, clipIndex) => {
      const tracks = clip.tracks.flatMap((track) => {
        const name = animationBoneName(track.name);
        if (!name) return [];
        const parsed = PropertyBinding.parseTrackName(track.name);
        if (!['quaternion','position','scale'].includes(parsed.propertyName)) return [];
        const bone = rig.find((entry) => entry.name === name || entry.bone.uuid === name)?.bone;
        if (!bone) return [];
        let alias = aliases.get(name);
        if (!alias) {
          alias = `import_${id}_${aliases.size}`; aliases.set(name,alias);
          const rest = boneRestPose(bone);
          bones[alias] = {name:bone.name, position:rest.position.toArray(), rotation:rest.rotation.toArray(),nodeId:nodeIds.get(bone)};
        }
        const size = parsed.propertyName === 'quaternion' ? 4 : 3;
        const Constructor = size === 4 ? QuaternionKeyframeTrack : VectorKeyframeTrack;
        const factory = (track as unknown as {createInterpolant: (() => {evaluate: (time: number) => ArrayLike<number>}) & {isInterpolantFactoryMethodGLTFCubicSpline?: boolean}}).createInterpolant;
        if (!factory.isInterpolantFactoryMethodGLTFCubicSpline) {
          // Preserve sparse original keys instead of expanding constant bones
          // into thousands of identical frames.
          const copied = new Constructor(`${alias}.${parsed.propertyName}`,Array.from(track.times, (value) => Math.round(value * 1e6) / 1e6),Array.from(track.values, (value) => Math.round(value * 1e6) / 1e6),track.getInterpolation()).optimize();
          valueCount += copied.values.length;
          if (valueCount > 5_000_000) throw new Error('This source has too much animation data. Export fewer or shorter clips and try again.');
          return [copied];
        }
        // Bake GLTF cubic splines so their custom interpolant survives JSON storage.
        const steps = Math.max(1, Math.ceil(clip.duration * 30));
        valueCount += (steps + 1) * size;
        if (valueCount > 5_000_000) throw new Error('This source has too much animation data. Export fewer or shorter clips and try again.');
        const times: number[] = []; const values: number[] = [];
        const interpolant = (track as unknown as {createInterpolant: () => {evaluate: (time: number) => ArrayLike<number>}}).createInterpolant();
        for (let step = 0; step <= steps; step++) {
          const time = step / steps * clip.duration; times.push(time);
          const sample = interpolant.evaluate(time);
          for (let component = 0; component < size; component++) values.push(sample[component]);
        }
        return [new Constructor(`${alias}.${parsed.propertyName}`,times,values).optimize()];
      });
      if (tracks.length) {
        const json = AnimationClip.toJSON(new AnimationClip(`${sourceName} · ${clip.name || `Clip ${clipIndex + 1}`} [${id.slice(0,6)}]`,clip.duration,tracks,clip.blendMode));
        for (const track of json.tracks) {
          track.times = track.times.map((value) => Math.round(value * 1e6) / 1e6);
          track.values = track.values.map((value) => Math.round(value * 1e6) / 1e6);
        }
        serialized.push(json);
      }
    });
    if (!serialized.length) throw new Error('No supported skeleton animation tracks were found in this model.');
    return {id,name:sourceName,clips:serialized,bones,rig:rigNodes};
}

export function boneKey(name: string) {
  return name.toLowerCase().replace(/^mixamorig[:_]?/, '').replace(/[^\p{L}\p{N}]/gu,'');
}
export function suggestAnimationBones(root: Object3D, source: AnimationSource): Record<string,string> {
  const targets = rigBones(root); const result: Record<string,string> = {}; const used = new Set<string>();
  const weights = new Map<Bone,number>();
  root.traverse((node) => {
    if (!(node instanceof SkinnedMesh)) return;
    const indices = node.geometry.getAttribute('skinIndex'); const skinWeights = node.geometry.getAttribute('skinWeight');
    if (!indices || !skinWeights) return;
    for (let vertex = 0; vertex < indices.count; vertex++) for (let component = 0; component < 4; component++) {
      const weight = skinWeights.getComponent(vertex,component); const bone = node.skeleton.bones[indices.getComponent(vertex,component)];
      if (weight > 0 && bone) weights.set(bone,(weights.get(bone) || 0)+weight);
    }
  });
  for (const [alias, bone] of Object.entries(source.bones)) {
    const exact = targets.filter((target) => target.name === bone.name);
    const matches = exact.length ? exact : targets.filter((target) => boneKey(target.name) === boneKey(bone.name));
    if (matches.length === 1 && !used.has(matches[0].id)) {result[alias] = matches[0].id; used.add(matches[0].id);}
  }
  // Resolve remaining channels by body role, with a one-to-one assignment.
  // Weighted MMD D-leg bones take priority over unused IK-control chains.
  for (const [alias,bone] of Object.entries(source.bones)) {
    if (result[alias]) continue;
    const role = humanoidBoneRole(bone.name);
    if (!role) continue;
    const candidates = targets.filter((target) => !used.has(target.id) && humanoidBoneRole(target.name) === role);
    const score = (target: typeof targets[number]) => role === 'hips'
      ? ({'腰':10000,'センター':9000,'下半身':1000}[target.name] || 11000)
      : (weights.get(target.bone) || 0);
    candidates.sort((a,b) => score(b)-score(a));
    if (candidates.length && (candidates.length === 1 || score(candidates[0]) > score(candidates[1]))) {
      result[alias] = candidates[0].id; used.add(candidates[0].id);
    }
  }
  return result;
}
