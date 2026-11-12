import * as THREE from 'three';
import {OrbitControls} from 'three/addons/controls/OrbitControls.js';

const host=document.querySelector('#pipe3dViewer');
const flat=document.querySelector('#pipeSvgFallback');
const view3d=document.querySelector('#pipe3dViewer');
const hint=document.querySelector('.pipe-drag-hint');
const buttons=[...document.querySelectorAll('[data-pipe-view]')];
const resetButton=document.querySelector('#resetPipeView');
const surfaceButton=document.querySelector('#toggleSurfaceLayer');
const mapSection=document.querySelector('#map-section');
if(!host||!flat)throw new Error('FlowGuard pipe viewer was not found.');

const scene=new THREE.Scene();
scene.background=new THREE.Color('#141a1b');
const aspect=()=>Math.max(host.clientWidth,1)/Math.max(host.clientHeight,1);
const cameraFov=37;
const camera3d=new THREE.PerspectiveCamera(cameraFov,aspect(),.1,120);
const homeTarget=new THREE.Vector3(0,.05,0);
function setHomeCamera(){
  const halfFov=Math.tan(THREE.MathUtils.degToRad(cameraFov/2));
  const elevation=THREE.MathUtils.degToRad(38);
  const fit=0.86;
  const halfWidth=9.15;
  const halfDepth=5.05;
  const halfHeight=2;
  const projectedHalfHeight=halfHeight*Math.cos(elevation)+halfDepth*Math.sin(elevation);
  const distance=Math.max(projectedHalfHeight/(halfFov*fit),halfWidth/(halfFov*aspect()*fit));
  camera3d.position.copy(homeTarget).add(new THREE.Vector3(0,distance*Math.sin(elevation),distance*Math.cos(elevation)));
  camera3d.lookAt(homeTarget);
}
const renderer=new THREE.WebGLRenderer({antialias:true,alpha:false,powerPreference:'high-performance'});
renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));
renderer.setSize(host.clientWidth||900,host.clientHeight||460);
renderer.shadowMap.enabled=true;
renderer.shadowMap.type=THREE.PCFSoftShadowMap;
renderer.outputColorSpace=THREE.SRGBColorSpace;
renderer.toneMapping=THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure=1.05;
renderer.domElement.setAttribute('aria-label','Drag to rotate the three-dimensional pipe network. Use the mouse wheel or pinch to zoom.');
renderer.domElement.tabIndex=0;
host.append(renderer.domElement);

scene.add(new THREE.HemisphereLight('#f7fbff','#798491',2.05));
const keyLight=new THREE.DirectionalLight('#fff5df',3.1);keyLight.position.set(-8,15,8);keyLight.castShadow=true;keyLight.shadow.mapSize.set(1024,1024);keyLight.shadow.camera.left=-13;keyLight.shadow.camera.right=13;keyLight.shadow.camera.top=12;keyLight.shadow.camera.bottom=-12;keyLight.shadow.bias=-.0005;scene.add(keyLight);
const fillLight=new THREE.DirectionalLight('#bad8f2',1.15);fillLight.position.set(8,8,-10);scene.add(fillLight);

const floor=new THREE.Mesh(new THREE.PlaneGeometry(50,32),new THREE.MeshStandardMaterial({color:'#20211e',roughness:.97,metalness:0}));
floor.rotation.x=-Math.PI/2;floor.position.y=-1.38;floor.receiveShadow=true;scene.add(floor);
const grid=new THREE.GridHelper(48,48,'#424642','#303431');grid.position.y=-1.365;grid.material.transparent=true;grid.material.opacity=.32;scene.add(grid);
const model=new THREE.Group();model.position.y=-.45;scene.add(model);

function concreteTexture(){
  const canvas=document.createElement('canvas');canvas.width=128;canvas.height=128;const ctx=canvas.getContext('2d');
  ctx.fillStyle='#a3a39c';ctx.fillRect(0,0,128,128);
  for(let i=0;i<2200;i++){const x=Math.random()*128,y=Math.random()*128,r=Math.random()*1.8+.2;ctx.fillStyle=Math.random()>.48?'rgba(35,42,43,.12)':'rgba(245,240,221,.13)';ctx.beginPath();ctx.arc(x,y,r,0,Math.PI*2);ctx.fill();}
  const tex=new THREE.CanvasTexture(canvas);tex.wrapS=THREE.RepeatWrapping;tex.wrapT=THREE.RepeatWrapping;tex.repeat.set(2.6,1.5);tex.colorSpace=THREE.SRGBColorSpace;return tex;
}
const grain=concreteTexture();
const shellMat=new THREE.MeshStandardMaterial({color:'#91918a',map:grain,bumpMap:grain,bumpScale:.055,roughness:.84,metalness:.08,transparent:true,opacity:.96,side:THREE.DoubleSide,depthWrite:false});
const innerMat=new THREE.MeshStandardMaterial({color:'#343a39',roughness:.96,metalness:.02,side:THREE.DoubleSide});
const waterMat=new THREE.MeshStandardMaterial({color:'#455c5b',roughness:.38,metalness:.16,transparent:true,opacity:.82,side:THREE.DoubleSide});
const rimMat=new THREE.MeshStandardMaterial({color:'#b0afa6',map:grain,roughness:.68,metalness:.12});
const clampMat=new THREE.MeshStandardMaterial({color:'#626a6a',roughness:.48,metalness:.42});

const axisY=new THREE.Vector3(0,1,0),axisZ=new THREE.Vector3(0,0,1);
const pipeRecords=[];
function placeCylinder(geometry,material,start,end,parent=model){
  const a=new THREE.Vector3(...start),b=new THREE.Vector3(...end),direction=new THREE.Vector3().subVectors(b,a),length=direction.length();
  const mesh=new THREE.Mesh(geometry(length),material);mesh.position.copy(a).add(b).multiplyScalar(.5);mesh.quaternion.setFromUnitVectors(axisY,direction.normalize());mesh.castShadow=true;mesh.receiveShadow=true;parent.add(mesh);return mesh;
}
function addRim(point,direction){
  const rim=new THREE.Mesh(new THREE.TorusGeometry(.57,.065,10,44),rimMat);rim.position.set(...point);rim.quaternion.setFromUnitVectors(axisZ,new THREE.Vector3(...direction).normalize());rim.castShadow=true;model.add(rim);
  const innerRim=new THREE.Mesh(new THREE.TorusGeometry(.46,.025,8,40),clampMat);innerRim.position.set(...point);innerRim.quaternion.copy(rim.quaternion);model.add(innerRim);
  for(let i=0;i<8;i++){const angle=i*Math.PI/4;const bolt=new THREE.Mesh(new THREE.SphereGeometry(.035,8,8),clampMat);const radial=new THREE.Vector3(Math.cos(angle)*.515,Math.sin(angle)*.515,0).applyQuaternion(rim.quaternion);bolt.position.set(point[0],point[1],point[2]).add(radial);model.add(bolt);}
}
function addPipe(name,start,end,{openStart=false,openEnd=false,labelPosition=null}={}){
  const dir=new THREE.Vector3(end[0]-start[0],end[1]-start[1],end[2]-start[2]).normalize();
  placeCylinder(len=>new THREE.CylinderGeometry(.62,.62,len,40,1,true),shellMat,start,end);
  placeCylinder(len=>new THREE.CylinderGeometry(.49,.49,len+.025,32,1,true),innerMat,start,end);
  placeCylinder(len=>new THREE.CylinderGeometry(.265,.265,len+.035,24,1,true),waterMat,[start[0],start[1]-.05,start[2]],[end[0],end[1]-.05,end[2]]);
  if(openStart)addRim(start,[-dir.x,-dir.y,-dir.z]);
  if(openEnd)addRim(end,[dir.x,dir.y,dir.z]);
  const middle=[(start[0]+end[0])/2,(start[1]+end[1])/2,(start[2]+end[2])/2];
  if(name!=='Inlet branch')addLabel(name,labelPosition||[middle[0],.92,middle[2]]);
  pipeRecords.push({name,start,end});
}
function addLabel(text,position){
  const canvas=document.createElement('canvas');canvas.width=512;canvas.height=128;const ctx=canvas.getContext('2d');
  ctx.fillStyle='rgba(17,43,61,.96)';ctx.strokeStyle='rgba(226,241,244,.88)';ctx.lineWidth=5;ctx.beginPath();ctx.roundRect(8,8,496,112,28);ctx.fill();ctx.stroke();
  ctx.font='700 48px Arial';ctx.fillStyle='#ffffff';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(text,256,67);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,toneMapped:false}));sprite.position.set(...position);sprite.scale.set(2.15,.54,1);sprite.renderOrder=7;model.add(sprite);
}

// Keep the full horizontal route continuous across the inlet, both junctions, and the outlet,
// matching the supplied 2D plan. Pipe A/B share the left riser; Pipe C is the center riser.
addPipe('Pipe D',[-8.1,0,0],[8.1,0,0],{openStart:true,openEnd:true,labelPosition:[5.55,.98,-1.05]});
addPipe('Pipe A',[-3.35,0,0],[-3.35,0,4.45],{openEnd:true,labelPosition:[-5.15,.98,3.05]});
addPipe('Pipe B',[-3.35,0,-4.45],[-3.35,0,0],{openStart:true,labelPosition:[-5.15,.98,-3.15]});
addPipe('Pipe C',[1.2,0,-4.45],[1.2,0,4.45],{openStart:true,openEnd:true,labelPosition:[3.1,.98,-3.35]});

// Coupling sleeves show the joins at the two main crossings.
function addCoupling(x,z){const sleeve=new THREE.Mesh(new THREE.CylinderGeometry(.7,.7,1.42,40,1,true),clampMat);sleeve.rotation.z=Math.PI/2;sleeve.position.set(x,.02,z);sleeve.castShadow=true;model.add(sleeve);}
addCoupling(-3.35,0);addCoupling(1.2,0);

// A raised, translucent neighborhood layer keeps the buried four-pipe route visible below.
const surfaceLayer=new THREE.Group();scene.add(surfaceLayer);
const surfaceBaseY=2.45;
const surfaceDeckMat=new THREE.MeshStandardMaterial({color:'#9aa58e',roughness:.96,transparent:true,opacity:.035,depthWrite:false,side:THREE.DoubleSide});
const streetMat=new THREE.MeshStandardMaterial({color:'#525a59',roughness:.92,transparent:true,opacity:.13,depthWrite:false});
const sidewalkMat=new THREE.MeshStandardMaterial({color:'#c2bda9',roughness:.9,transparent:true,opacity:.28,depthWrite:false});
const laneMat=new THREE.MeshStandardMaterial({color:'#f0d982',emissive:'#66582c',emissiveIntensity:.12,roughness:.8,transparent:true,opacity:.9,depthWrite:false});
const houseMaterials=[
  new THREE.MeshStandardMaterial({color:'#e6dfcb',roughness:.82}),
  new THREE.MeshStandardMaterial({color:'#c8d8dc',roughness:.8}),
  new THREE.MeshStandardMaterial({color:'#d9c8b3',roughness:.86}),
  new THREE.MeshStandardMaterial({color:'#d4d8c6',roughness:.86})
];
const roofMaterials=[
  new THREE.MeshStandardMaterial({color:'#a65e4d',roughness:.9}),
  new THREE.MeshStandardMaterial({color:'#4c6370',roughness:.86}),
  new THREE.MeshStandardMaterial({color:'#77756b',roughness:.9})
];
const windowMat=new THREE.MeshStandardMaterial({color:'#8fc2d0',emissive:'#315965',emissiveIntensity:.18,roughness:.32,metalness:.08});
const doorMat=new THREE.MeshStandardMaterial({color:'#765c46',roughness:.85});
const platform=new THREE.Mesh(new THREE.BoxGeometry(30,.16,17),surfaceDeckMat);platform.position.set(0,surfaceBaseY,0);platform.receiveShadow=true;surfaceLayer.add(platform);
function addSurfaceBox(geometry,material,position,parent=surfaceLayer){const mesh=new THREE.Mesh(geometry,material);mesh.position.set(...position);mesh.castShadow=false;mesh.receiveShadow=true;parent.add(mesh);return mesh;}
function addStreet(width,length,position){return addSurfaceBox(new THREE.BoxGeometry(width,.09,length),streetMat,position);}
// The street paths sit directly above their matching drainage lines.
addStreet(29,.09,[0,surfaceBaseY+.13,0]);
addStreet(1.9,16.4,[-3.35,surfaceBaseY+.13,0]);
addStreet(1.9,16.4,[1.2,surfaceBaseY+.13,0]);
// Sidewalk strips define the blocks while keeping the pipe layer visible through the road.
for(const z of [-1.08,1.08])addSurfaceBox(new THREE.BoxGeometry(29,.07,.2),sidewalkMat,[0,surfaceBaseY+.12,z]);
for(const x of [-4.43,-2.27,.12,2.28])addSurfaceBox(new THREE.BoxGeometry(.2,.07,16.4),sidewalkMat,[x,surfaceBaseY+.12,0]);
// Center lines and crosswalks make the surface routes read as streets from the default view.
for(let x=-13.5;x<=13.5;x+=1.45)addSurfaceBox(new THREE.BoxGeometry(.62,.025,.065),laneMat,[x,surfaceBaseY+.19,0]);
for(const x of [-3.35,1.2])for(let z=-.78;z<=.78;z+=.27)addSurfaceBox(new THREE.BoxGeometry(.09,.025,.18),laneMat,[x,surfaceBaseY+.19,z]);
for(const x of [-3.35,1.2])for(let z=-7.4;z<=7.4;z+=1.45)addSurfaceBox(new THREE.BoxGeometry(.065,.025,.62),laneMat,[x,surfaceBaseY+.19,z]);

function addHouse(x,z,index,{width=1.4,depth=1.18,height=.82}={}){
  const groundY=surfaceBaseY+.23;
  const bodyMat=houseMaterials[index%houseMaterials.length],roofMat=roofMaterials[index%roofMaterials.length];
  addSurfaceBox(new THREE.BoxGeometry(width,height,depth),bodyMat,[x,groundY+height/2,z]);
  const roof=new THREE.Mesh(new THREE.ConeGeometry(Math.max(width,depth)*.76,.46,4),roofMat);
  roof.position.set(x,groundY+height+.22,z);roof.rotation.y=Math.PI/4;roof.castShadow=false;surfaceLayer.add(roof);
  // The facade faces the nearest side of the main street.
  const frontZ=z>0?z-depth/2-.018:z+depth/2+.018;
  addSurfaceBox(new THREE.BoxGeometry(.24,.23,.035),windowMat,[x-.34,groundY+.49,frontZ]);
  addSurfaceBox(new THREE.BoxGeometry(.22,.38,.04),doorMat,[x+.3,groundY+.2,frontZ]);
}
// A few low-detail homes sit behind the road edge and away from the pipe junctions.
const homeXs=[-11,-7,5.2,9.4];
homeXs.forEach((x,index)=>{addHouse(x,-4.25,index);addHouse(x,4.25,index+2);});

// A small, restrained debris clump marks the central junction without obscuring the pipework.
const debrisMat=new THREE.MeshStandardMaterial({color:'#8b7957',roughness:.9});
const leafMat=new THREE.MeshStandardMaterial({color:'#6e7351',roughness:.95});
for(const [x,y,z,sx,sy,sz,mat] of [[1.1,.54,.02,.29,.1,.14,debrisMat],[1.37,.55,.08,.24,.09,.13,leafMat],[.92,.52,-.13,.23,.08,.12,leafMat],[1.21,.57,-.18,.18,.07,.13,debrisMat]]){const bit=new THREE.Mesh(new THREE.DodecahedronGeometry(1,0),mat);bit.position.set(x,y,z);bit.scale.set(sx,sy,sz);bit.rotation.y=x;bit.castShadow=true;model.add(bit);}

const statusColor={normal:'#2eae73',warning:'#e7b337',high_risk:'#e27b3b',critical:'#d94852',offline:'#8492a0'};
const markerPoints=[[-3.35,-2.03],[-3.35,1.93],[1.33,-2.03],[1.33,0],[4.27,0],[-6,0],[-1.07,0],[6,0],[-3.35,3],[1.33,2.73],[2.93,0],[5.33,0],[-3.35,-1.27],[1.33,-1.27],[1.33,1.27],[-3.35,1.13]];
const drainLayer=new THREE.Group();model.add(drainLayer);const markersById=new Map(),raycastTargets=[];
function sensorSprite(text,color){
  const canvas=document.createElement('canvas');canvas.width=320;canvas.height=96;const ctx=canvas.getContext('2d');
  ctx.fillStyle='rgba(17,43,61,.98)';ctx.strokeStyle='rgba(234,246,247,.9)';ctx.lineWidth=4;ctx.beginPath();ctx.roundRect(4,4,312,88,22);ctx.fill();ctx.stroke();ctx.fillStyle=color;ctx.beginPath();ctx.arc(42,48,15,0,Math.PI*2);ctx.fill();ctx.font='700 40px Arial';ctx.fillStyle='#fff';ctx.textBaseline='middle';ctx.fillText(text,72,50);
  const texture=new THREE.CanvasTexture(canvas);texture.colorSpace=THREE.SRGBColorSpace;const sprite=new THREE.Sprite(new THREE.SpriteMaterial({map:texture,transparent:true,depthTest:false,toneMapped:false}));sprite.scale.set(1.72,.52,1);sprite.renderOrder=9;sprite.visible=false;return sprite;
}
const sensorLabels=new Map();let hoveredDrainId=null,selectedDrainId=null;
function updateVisibleSensorLabel(){const activeId=hoveredDrainId||selectedDrainId;sensorLabels.forEach((label,id)=>{label.visible=id===activeId;});}
function setDrains(drains=[]){
  for(const child of [...drainLayer.children]){drainLayer.remove(child);child.geometry?.dispose();if(child.material?.map)child.material.map.dispose();child.material?.dispose();}
  markersById.clear();sensorLabels.clear();raycastTargets.length=0;hoveredDrainId=null;selectedDrainId=null;
  drains.forEach((drain,index)=>{
    const [x,z]=markerPoints[index%markerPoints.length],color=statusColor[drain.status]||statusColor.normal;
    const ring=new THREE.Mesh(new THREE.TorusGeometry(.3,.035,8,32),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.24,roughness:.4}));ring.rotation.x=-Math.PI/2;ring.position.set(x,.76,z);drainLayer.add(ring);
    const sphere=new THREE.Mesh(new THREE.SphereGeometry(.21,20,16),new THREE.MeshStandardMaterial({color,emissive:color,emissiveIntensity:.38,roughness:.34,metalness:.08}));sphere.position.set(x,.84,z);sphere.userData.drainId=String(drain.id);sphere.castShadow=true;drainLayer.add(sphere);raycastTargets.push(sphere);markersById.set(String(drain.id),sphere);
    const badge=sensorSprite(drain.drain_code,color);badge.position.set(x+.92,1.39,z-.35);drainLayer.add(badge);sensorLabels.set(String(drain.id),badge);
  });
}

const raycaster=new THREE.Raycaster();const pointer=new THREE.Vector2();let pointerStart=null;
renderer.domElement.addEventListener('pointerdown',event=>{pointerStart={x:event.clientX,y:event.clientY};});
renderer.domElement.addEventListener('pointerup',event=>{
  if(!pointerStart)return;const delta=Math.hypot(event.clientX-pointerStart.x,event.clientY-pointerStart.y);pointerStart=null;if(delta>5)return;
  const rect=renderer.domElement.getBoundingClientRect();pointer.x=((event.clientX-rect.left)/rect.width)*2-1;pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera3d);const hit=raycaster.intersectObjects(raycastTargets,false)[0];if(hit){selectedDrainId=String(hit.object.userData.drainId);updateVisibleSensorLabel();document.dispatchEvent(new CustomEvent('flowguard:drain-selected',{detail:{id:selectedDrainId}}));}
});
renderer.domElement.addEventListener('pointermove',event=>{const rect=renderer.domElement.getBoundingClientRect();pointer.x=((event.clientX-rect.left)/rect.width)*2-1;pointer.y=-((event.clientY-rect.top)/rect.height)*2+1;raycaster.setFromCamera(pointer,camera3d);const hit=raycaster.intersectObjects(raycastTargets,false)[0];hoveredDrainId=hit?String(hit.object.userData.drainId):null;updateVisibleSensorLabel();renderer.domElement.style.cursor=hit?'pointer':'grab';});
renderer.domElement.addEventListener('pointerleave',()=>{hoveredDrainId=null;updateVisibleSensorLabel();renderer.domElement.style.cursor='grab';});

let controls;
function recreateControls(){
  controls?.dispose();controls=new OrbitControls(camera3d,renderer.domElement);controls.target.copy(homeTarget);controls.enableDamping=true;controls.dampingFactor=.075;controls.enablePan=true;controls.enableZoom=true;controls.minDistance=8;controls.maxDistance=42;controls.minPolarAngle=.08;controls.maxPolarAngle=1.47;controls.mouseButtons={LEFT:THREE.MOUSE.ROTATE,MIDDLE:THREE.MOUSE.DOLLY,RIGHT:THREE.MOUSE.PAN};controls.touches={ONE:THREE.TOUCH.ROTATE,TWO:THREE.TOUCH.DOLLY_PAN};controls.update();
}
function setButtons(mode){buttons.forEach(button=>{const active=button.dataset.pipeView===mode;button.classList.toggle('active',active);button.setAttribute('aria-pressed',String(active));});}
function updateSurfaceButton(){
  if(!surfaceButton)return;
  const visible=surfaceLayer.visible;
  surfaceButton.setAttribute('aria-pressed',String(visible));
  surfaceButton.setAttribute('aria-label',visible?'Hide houses and street layer':'Show houses and street layer');
  surfaceButton.title=visible?'Hide houses and street layer':'Show houses and street layer';
  surfaceButton.innerHTML=`<i class="bi bi-buildings-fill"></i><span>${visible?'Hide houses':'Show houses'}</span>`;
}
function setMode(mode,reset=false){
  const is3d=mode==='3d';mapSection?.classList.toggle('pipe-map-mode-3d',is3d);host.dataset.view=mode;
  if(mode==='2d'){
    view3d.style.display='none';flat.style.display='block';if(surfaceButton)surfaceButton.hidden=true;window.flowguardPipeFallback?.setModeFromScene('2d');setButtons('2d');if(hint)hint.innerHTML='<i class="bi bi-arrows-move"></i> 2D schematic';return;
  }
  window.flowguardPipeFallback?.deactivate();flat.style.display='none';view3d.style.display='block';if(surfaceButton)surfaceButton.hidden=false;updateSurfaceButton();
  if(reset){resize();setHomeCamera();}
  recreateControls();setButtons('3d');if(hint)hint.innerHTML='<i class="bi bi-arrows-move"></i> Drag to rotate';resize();
}
buttons.forEach(button=>button.addEventListener('click',()=>setMode(button.dataset.pipeView,true)));
resetButton?.addEventListener('click',()=>setMode('3d',true));
surfaceButton?.addEventListener('click',()=>{surfaceLayer.visible=!surfaceLayer.visible;updateSurfaceButton();});
document.addEventListener('fullscreenchange',()=>requestAnimationFrame(()=>{resize();if(document.fullscreenElement){setHomeCamera();controls?.update();}}));
function focusDrain(id){const marker=markersById.get(String(id));if(!marker)return;controls.target.set(marker.position.x,0,marker.position.z);controls.update();marker.scale.setScalar(1.5);setTimeout(()=>marker.scale.setScalar(1),1800);}
function resize(){const rect=host.getBoundingClientRect(),width=rect.width,height=rect.height;if(width<1||height<1)return;renderer.setPixelRatio(Math.min(window.devicePixelRatio||1,2));renderer.setSize(width,height,false);camera3d.aspect=width/height;camera3d.updateProjectionMatrix();}
const resizeObserver=new ResizeObserver(resize);resizeObserver.observe(host);window.addEventListener('resize',resize);
let frame=0;
function animate(){frame=requestAnimationFrame(animate);if(view3d.style.display==='none')return;controls?.update();renderer.render(scene,camera3d);}
setDrains(window.flowguardDrains||[]);setMode('3d',true);animate();
window.flowguardPipe3D={ready:true,setMode,focusDrain,setDrains,scene,renderer,destroy(){cancelAnimationFrame(frame);controls?.dispose();resizeObserver.disconnect();renderer.dispose();}};
