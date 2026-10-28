import { Vector3, type Camera } from 'three';

export function nearestRigJoints(points:Vector3[],camera:Camera,rect:{left:number;top:number;width:number;height:number},x:number,y:number,radius=10) {
  const projected=new Vector3();
  return points.flatMap((point,index)=>{
    projected.copy(point).project(camera);
    if(projected.z < -1 || projected.z > 1)return [];
    const px=rect.left+(projected.x+1)*rect.width/2,py=rect.top+(1-projected.y)*rect.height/2;
    const distance=Math.hypot(px-x,py-y);
    return distance<=radius?[{index,distance,depth:projected.z}]:[];
  }).sort((a,b)=>Math.abs(a.distance-b.distance)>.25?a.distance-b.distance:a.depth-b.depth);
}
