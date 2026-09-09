import { evaluateGraph, meshStats, repeatAxis } from './graph.js';
import { presets,getPreset } from './presets.js';
export const metadata={id:'procedural-shape-builder',title:'Procedural shape builder',description:'Connect geometry operations to make turned objects, repeating structures, and curved forms. Every change rebuilds the mesh.',technique:'Geometry graphs',instructions:['Choose a lamp, stair, or pavilion graph.','Select a node to edit its parameters, or add a modifier to its output.','Connect inputs, export the graph, or save the resulting mesh.'],limitations:['A bounded geometry graph, not a complete CAD system.','Modifiers operate on mesh vertices; highly bent low-resolution shapes can fold over.','Repeated pieces are combined into one mesh without Boolean union.']};
export function createExperiment(ctx){
 const {THREE,root,ui}=ctx;let nodes=getPreset('Turned lamp'),output=nodes.at(-1).id,selected=output,history=[];
 const mesh=new THREE.Mesh(undefined,new THREE.MeshStandardMaterial({color:ctx.palette.body,metalness:.27,roughness:.43,side:THREE.DoubleSide}));root.add(mesh);
 let wire=false;
 ui.select('Starting graph',Object.keys(presets),'Turned lamp',name=>{nodes=getPreset(name);output=nodes.at(-1).id;selected=output;history=[];rebuild(true);});
 const heading=ui.section('Connected nodes'),board=document.createElement('div');board.className='geometry-node-list';heading.after(board);
 const params=ui.note('Select a node to edit its parameters.');params.className='geometry-node-parameters';
 const checkpoint=()=>{history.push(JSON.stringify({nodes,output,selected}));if(history.length>30)history.shift();};
 function field(label,value,min,max,step,fn){const wrap=document.createElement('label');wrap.className='graphics-workbench__field';const caption=document.createElement('span');caption.textContent=label;const input=document.createElement('input');input.type='range';input.id=`graph-${selected}-${label.replaceAll(' ','-')}`;wrap.htmlFor=input.id;input.min=min;input.max=max;input.step=step;input.value=value;input.setAttribute('aria-label',label);const out=document.createElement('output');out.textContent=value;out.setAttribute('aria-hidden','true');caption.append(' ',out);wrap.append(caption,input);input.addEventListener('pointerdown',checkpoint);input.addEventListener('keydown',e=>{if(e.key.startsWith('Arrow'))checkpoint();});input.addEventListener('input',()=>{out.textContent=input.value;fn(Number(input.value));render();});params.append(wrap);}
 function parameters(){params.replaceChildren();const n=nodes.find(n=>n.id===selected);if(!n)return;const p=n.params ||= {};
  const title=document.createElement('strong');title.textContent=n.id+' · '+n.type;params.append(title);
  if(n.inputs?.length===1){const label=document.createElement('label');label.className='graphics-workbench__field';label.textContent='Input node';const select=document.createElement('select');select.setAttribute('aria-label','Input node');for(const item of nodes.filter(item=>item.id!==n.id)){const opt=document.createElement('option');opt.value=item.id;opt.textContent=item.id;select.append(opt);}select.value=n.inputs[0];select.addEventListener('change',()=>{checkpoint();const old=n.inputs[0];n.inputs[0]=select.value;try{const test=evaluateGraph(nodes,output);test.dispose();rebuild();}catch(error){n.inputs[0]=old;select.value=old;ctx.setStatus(error.message);}});label.append(select);params.append(label);}
  if(['twist','bend','taper'].includes(n.type))field('Amount',p.amount,-(n.type==='taper'?.85:2.5),n.type==='taper'?2:2.5,.05,v=>p.amount=v);
  if(n.type==='repeat'){field('Copies',p.count,1,30,1,v=>p.count=v);field('Rotation per copy',p.angle||0,-.7,.7,.01,v=>p.angle=v);p.offset ||= [.4,.2,0];const axis=repeatAxis(p.offset);field('Spacing',p.offset[axis],-3,3,.01,v=>{p.offset[axis]=v;});}
  if(n.type==='lathe')field('Radial segments',p.segments,8,96,1,v=>p.segments=v);
  if(n.type==='curve')field('Profile radius',p.radius,.01,.2,.005,v=>p.radius=v);
  if(n.type==='box')for(const key of ['width','height','depth'])field(key,p[key],.05,3,.05,v=>p[key]=v);
 }
 function render(){try{const g=evaluateGraph(nodes,output);mesh.geometry?.dispose();mesh.geometry=g;const s=meshStats(g);ctx.setStatus(`${nodes.length} connected nodes · ${s.triangles.toLocaleString()} triangles · output: ${output}`);ctx.invalidate();}catch(error){ctx.setStatus(error.message);}}
 function rebuild(fit=false){board.replaceChildren();for(const n of nodes){const b=document.createElement('button');b.type='button';b.textContent=`${n.id} · ${n.type}${n.inputs?.length?' ← '+n.inputs.join(', '):''}`;b.setAttribute('aria-pressed',String(selected===n.id));b.style.cssText='display:block;width:100%;margin:0 0 8px;text-align:left';b.addEventListener('click',()=>{selected=n.id;rebuild();});board.append(b);}parameters();render();if(fit)ctx.fit();}
 let newType='twist';ui.select('Add operation',['twist','bend','taper','repeat'],newType,v=>newType=v);
 ui.button('Connect operation',()=>{checkpoint();const id=`${newType}-${Date.now().toString(36)}`;nodes.push({id,type:newType,inputs:[output],params:newType==='repeat'?{count:4,offset:[1.8,0,0],angle:0}:{amount:.3}});output=id;selected=id;rebuild(true);},{primary:true});
 ui.button('Remove last operation',()=>{if(nodes.length<2)return;const last=nodes.find(n=>n.id===output);if(!last.inputs?.length){ctx.setStatus('The source geometry cannot be removed.');return;}checkpoint();nodes=nodes.filter(n=>n.id!==output);output=last.inputs[0];selected=output;rebuild(true);});
 ui.button('Undo',()=>{const old=history.pop();if(!old)return;({nodes,output,selected}=JSON.parse(old));rebuild(true);});
 ui.toggle('Wireframe',wire,v=>{wire=v;mesh.material.wireframe=v;ctx.invalidate();});
 ui.button('Export mesh OBJ',()=>ctx.exportOBJ(mesh,'procedural-shape.obj'));
 ui.button('Save graph JSON',()=>ctx.download('geometry-graph.json',JSON.stringify({nodes,output},null,2),'application/json'));
 ui.file('Load graph JSON',async file=>{if(file.size>150000)throw new Error('Graph file exceeds 150 KB.');const data=JSON.parse(await file.text());const test=evaluateGraph(data.nodes,data.output);test.dispose();checkpoint();nodes=data.nodes;output=data.output;selected=output;rebuild(true);},{accept:'.json'});
 ui.note('Each arrow connects an operation to its input. Orbit in the viewport; select a node here to change its geometry.');
 rebuild(true);return{};
}
