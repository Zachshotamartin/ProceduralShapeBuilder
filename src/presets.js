const lampProfile=[[0,-1.5],[.75,-1.5],[.79,-1.44],[.76,-1.32],[.28,-1.28],[.18,-1.15],[.12,-.95],[.12,.35],[.22,.4],[.34,.46],[.95,.55],[1.04,.67],[.68,1.44],[.59,1.5],[.55,1.5],[.98,.68],[.29,.54],[.18,.5],[0,.5]];
export const presets={
  'Turned lamp':[{id:'profile',type:'lathe',params:{profile:lampProfile,segments:64}},{id:'finish',type:'twist',inputs:['profile'],params:{amount:.4}}],
  'Spiral stair':[{id:'step',type:'box',params:{width:1.5,height:.1,depth:.5}},{id:'offset',type:'translate',inputs:['step'],params:{offset:[.9,-1.8,0]}},{id:'steps',type:'repeat',inputs:['offset'],params:{count:18,offset:[0,.2,0],angle:.25}}],
  'Ribbed pavilion':[{id:'arch',type:'curve',params:{points:[[-1.6,-1,0],[-1.55,.4,0],[0,1.5,0],[1.55,.4,0],[1.6,-1,0]],radius:.055}},{id:'ribs',type:'repeat',inputs:['arch'],params:{count:13,offset:[0,0,.23]}},{id:'form',type:'taper',inputs:['ribs'],params:{amount:.14}}],
};
export function getPreset(name){return structuredClone(presets[name]||presets['Turned lamp']);}
