import { Euler, Matrix4, Quaternion, SkinnedMesh, Vector3, type Bone, type Object3D, type Skeleton } from 'three';
import { boneRestPose, rigBones, type BoneAdjustment, type SkeletonPlacement } from './animationRetargeting';
import { skeletonPivot, skeletonPlacementMatrix } from './skeletonPlacement';

const originalBindings = new WeakMap<SkinnedMesh, Skeleton>();

// Restore before evaluating animation, then apply each correction once.
export class BoneAdjustmentController {
  private bones;
  private originals = new Map<Bone, {position: Vector3; rotation: Quaternion; scale: Vector3}>();
  private bindings: Array<{mesh: SkinnedMesh; original: Skeleton; aligned: Skeleton; placed: Skeleton; rest: Matrix4[]}> = [];
  private pivot;
  private placementKey='';
  private root: Object3D;
  constructor(root: Object3D) {
    this.root=root;
    this.bones = rigBones(root);
    this.pivot=skeletonPivot(root);
    const current = this.bones.map(({bone}) => ({bone, position:bone.position.clone(), rotation:bone.quaternion.clone(),scale:bone.scale.clone()}));
    for (const {bone} of this.bones) {
      const rest = boneRestPose(bone); bone.position.copy(rest.position); bone.quaternion.copy(rest.rotation);bone.scale.copy(rest.scale);
    }
    root.updateWorldMatrix(true, true);
    root.traverse((node) => {
      if (!(node instanceof SkinnedMesh)) return;
      const original = originalBindings.get(node) || node.skeleton;
      originalBindings.set(node, original);
      const aligned = original.clone();
      // Express the mesh's current rest space in each joint's coordinates.
      // Common parent/model rotations cancel out of this relationship.
      aligned.boneInverses = original.bones.map((bone) => bone.matrixWorld.clone().invert().multiply(node.matrixWorld).multiply(node.bindMatrix.clone().invert()));
      const inverseRoot=root.matrixWorld.clone().invert();
      this.bindings.push({mesh:node, original, aligned,placed:original.clone(),rest:original.bones.map((bone)=>inverseRoot.clone().multiply(bone.matrixWorld))});
    });
    current.forEach(({bone, position, rotation,scale}) => {bone.position.copy(position); bone.quaternion.copy(rotation);bone.scale.copy(scale);});
    root.updateWorldMatrix(true, true);
  }
  alignSkeleton(enabled = false) {
    for (const {mesh, original, aligned} of this.bindings) mesh.skeleton = enabled ? aligned : original;
  }
  placeSkeleton(placement?: SkeletonPlacement, aligned = false) {
    if (!placement) {this.alignSkeleton(aligned); return;}
    const transform=skeletonPlacementMatrix(placement,this.pivot);
    this.root.updateWorldMatrix(true,true);
    const world=this.root.matrixWorld.clone().multiply(transform).multiply(this.root.matrixWorld.clone().invert());
    const boneSet=new Set(this.bones.map(({bone})=>bone));
    // Only move the top of each bone hierarchy, once; meshes remain outside it.
    for(const {bone} of this.bones){
      let parent=bone.parent, nested=false;
      while(parent&&parent!==this.root){if(boneSet.has(parent as Bone)){nested=true;break;}parent=parent.parent;}
      if(nested)continue;
      this.remember(bone);
      bone.updateMatrix();
      const parentWorld=bone.parent?.matrixWorld || new Matrix4();
      new Matrix4().copy(parentWorld).invert().multiply(world).multiply(parentWorld).multiply(bone.matrix).decompose(bone.position,bone.quaternion,bone.scale);
    }
    const key=JSON.stringify([placement,aligned]);
    if(key!==this.placementKey){
      const inverse=transform.clone().invert();
      for(const binding of this.bindings){
        const base=aligned?binding.aligned:binding.original;
        // Counter-transform the bind matrices so placement moves the skeleton
        // while leaving the mesh in place, retaining its existing skin weights.
        binding.placed.boneInverses=base.boneInverses.map((matrix,index)=>binding.rest[index].clone().invert().multiply(inverse).multiply(binding.rest[index]).multiply(matrix));
      }
      this.placementKey=key;
    }
    this.bindings.forEach(({mesh,placed})=>{mesh.skeleton=placed;});
  }
  dispose() {
    this.restore(); this.alignSkeleton(false);
    this.bindings.forEach(({aligned,placed}) => {aligned.dispose();placed.dispose();});
  }
  restore() {
    this.originals.forEach((pose, bone) => {bone.position.copy(pose.position); bone.quaternion.copy(pose.rotation);bone.scale.copy(pose.scale);});
    this.originals.clear();
  }
  private remember(bone: Bone) {
    if(!this.originals.has(bone))this.originals.set(bone,{position:bone.position.clone(),rotation:bone.quaternion.clone(),scale:bone.scale.clone()});
  }
  apply(settings?: Record<string, BoneAdjustment>) {
    if (!settings) return;
    for (const {id, bone} of this.bones) {
      const adjustment = settings[id]; if (!adjustment) continue;
      this.remember(bone);
      if (adjustment.rotation?.every(Number.isFinite)) bone.quaternion.multiply(new Quaternion().setFromEuler(new Euler(...adjustment.rotation.map((degrees) => degrees * Math.PI / 180) as [number,number,number]))).normalize();
      if (adjustment.position?.every(Number.isFinite)) bone.position.add(new Vector3(...adjustment.position));
    }
  }
}
