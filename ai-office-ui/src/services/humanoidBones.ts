// Common humanoid roles across Mixamo/Biped/VRM and Japanese MMD rigs.
// IK/helpers are skipped; twist joints get their own optional roles.
export function humanoidBoneRole(value: string): string | null {
  let name = value.normalize('NFKC').replace(/^.*[:|]/, '').replace(/^(mixamorig|armature|bip001)[_ :.-]*/i, '').replace(/_\d{3,}$/,'');
  if (/ik|補助|キャンセル|dummy|socket/i.test(name)) return null;
  let side = '';
  if (/^(left|左|l[_ .-])/i.test(name)) {side='left'; name=name.replace(/^(left|左|l[_ .-])/i,'');}
  else if (/^(right|右|r[_ .-])/i.test(name)) {side='right'; name=name.replace(/^(right|右|r[_ .-])/i,'');}
  else if (/[_ .-]l$/i.test(name)) {side='left'; name=name.replace(/[_ .-]l$/i,'');}
  else if (/[_ .-]r$/i.test(name)) {side='right'; name=name.replace(/[_ .-]r$/i,'');}
  const key = name.toLowerCase().replace(/[ _.-]/g,'');
  if (side) {
    const limbs: Record<string,string> = {
      shoulder:'shoulder',clavicle:'shoulder','肩':'shoulder',
      arm:'upperArm',upperarm:'upperArm','腕':'upperArm',
      forearm:'lowerArm',lowerarm:'lowerArm',elbow:'lowerArm','ひじ':'lowerArm','肘':'lowerArm',
      hand:'hand',wrist:'hand','手首':'hand',
      upleg:'upperLeg',upperleg:'upperLeg',thigh:'upperLeg','足':'upperLeg','足d':'upperLeg',
      leg:'lowerLeg',lowerleg:'lowerLeg',calf:'lowerLeg',shin:'lowerLeg','ひざ':'lowerLeg','膝':'lowerLeg','ひざd':'lowerLeg',
      foot:'foot',ankle:'foot','足首':'foot','足首d':'foot',
      toebase:'toes',toe:'toes',toes:'toes','つま先':'toes','足先ex':'toes',
      eye:'eye','目':'eye',
      armtwist:'upperArmTwist',upperarmtwist:'upperArmTwist','腕捩':'upperArmTwist',forearmtwist:'lowerArmTwist','手捩':'lowerArmTwist'
    };
    if (limbs[key]) return `${side}.${limbs[key]}`;
    if (/^(?:glute|gluteus|butt|buttock|尻|臀)(?:0?1)?$/.test(key)) return `${side}.glute`;
    if (/^(?:glute|gluteus|butt|buttock|尻|臀)(?:end|tip|0?2|先|先端)$/.test(key)) return `${side}.gluteEnd`;
    // Paired chest deformers are separate from the central chest/spine and
    // clavicles. Match known main/end names, leaving other helper chains alone.
    if (/^(?:breast|bust|chest|胸)(?:0?1)?$/.test(key)) return `${side}.chestSoft`;
    if (/^(?:breast|bust|chest|胸)(?:end|tip|0?2|先|先端)$/.test(key)) return `${side}.chestSoftEnd`;
    const finger = key.match(/^(?:hand)?(thumb|index|middle|ring|pinky|little)([123])$/);
    if (finger) return `${side}.${finger[1] === 'little' ? 'pinky' : finger[1]}.${finger[2]}`;
    const japanese = key.match(/^(親指|人指|人差指|中指|薬指|小指)([0123])$/);
    if (japanese) {
      const names: Record<string,string> = {'親指':'thumb','人指':'index','人差指':'index','中指':'middle','薬指':'ring','小指':'pinky'};
      const segment = japanese[1] === '親指' ? Number(japanese[2])+1 : Number(japanese[2]);
      if (segment >= 1 && segment <= 3) return `${side}.${names[japanese[1]]}.${segment}`;
    }
    return null;
  }
  const body: Record<string,string> = {
    hips:'hips',hip:'hips',pelvis:'hips','腰':'hips','センター':'hips','下半身':'hips',
    spine:'spine',spine0:'spine','上半身':'spine',
    spine1:'chest',chest:'chest','上半身1':'chest',
    spine2:'upperChest',upperchest:'upperChest','上半身2':'upperChest',
    neck:'neck','首':'neck',neck1:'upperNeck','首2':'upperNeck',head:'head','頭':'head',
    root:'root','全ての親':'root'
  };
  return body[key] || null;
}
