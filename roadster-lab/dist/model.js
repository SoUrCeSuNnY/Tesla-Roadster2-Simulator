import * as THREE from './vendor/three.module.js';
import { THRUSTERS } from './data.js';

export function createRoadster() {
  const car=new THREE.Group();car.name='Roadster_Rocket_Lowpoly_Study';
  const layers={},markers=[],plumes=[],pickables=[];
  const mat=(color,more={})=>new THREE.MeshStandardMaterial({color,roughness:.65,metalness:.28,flatShading:true,side:THREE.DoubleSide,...more});
  const materials={body:mat(0xe4e9e9),dark:mat(0x1a222a),tire:mat(0x202429,{roughness:.98,metalness:0}),rim:mat(0xb5c3cc,{metalness:.8,roughness:.3}),glass:mat(0x3b3029,{metalness:.6,roughness:.24}),carbon:mat(0x39454c),gold:mat(0xd49b59,{metalness:.7}),battery:mat(0x82a9b5),motor:mat(0x8c999d),seat:mat(0xe0e7df,{metalness:0}),copper:mat(0xc87e46),observed:mat(0x187a92),inferred:mat(0xe5a242)};
  for(const name of ['body','canopy','chassis','battery','cabin','tankRear','tankPassenger','motors','suspension','fans','wheels','thrusters','pipes','aero']){
    layers[name]=new THREE.Group();layers[name].name=name;car.add(layers[name]);
  }
  function mesh(g,m,p=[0,0,0],parent=layers.body,name=''){
    const o=new THREE.Mesh(g,m);o.position.set(...p);o.castShadow=true;o.receiveShadow=true;o.name=name;parent.add(o);return o;
  }
  function box(size,p,m,parent,name){return mesh(new THREE.BoxGeometry(...size),m,p,parent,name)}
  function geometry(v,f){const a=[];for(const face of f)for(const i of face)a.push(...v[i]);const g=new THREE.BufferGeometry();g.setAttribute('position',new THREE.Float32BufferAttribute(a,3));g.computeVertexNormals();return g;}
  function panel(v,m,parent=layers.body,name=''){return mesh(geometry(v,[[0,1,2],[0,2,3]]),m,[0,0,0],parent,name)}
  function rod(a,b,r,m,parent=layers.suspension,segments=6){const av=new THREE.Vector3(...a),bv=new THREE.Vector3(...b);const o=mesh(new THREE.CylinderGeometry(r,r,av.distanceTo(bv),segments),m,av.clone().add(bv).multiplyScalar(.5).toArray(),parent);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),bv.sub(av).normalize());return o;}
  // A faceted, angular 2026 body. Wheel arches are cut into the side contours.
  const wheelX=[1.42,-1.40];
  for(const side of [-1,1]){
    const shape=new THREE.Shape();shape.moveTo(-2.49,.81);shape.lineTo(-1.65,.95);shape.lineTo(-1.07,.91);shape.lineTo(.74,.85);shape.lineTo(1.42,.94);shape.lineTo(2.08,.79);shape.lineTo(2.49,.63);shape.lineTo(2.49,.29);
    for(const cx of wheelX){shape.lineTo(cx+.48,.29);for(let i=0;i<=12;i++){const a=(-20+i*220/12)*Math.PI/180;shape.lineTo(cx+Math.cos(a)*.48,.44+Math.sin(a)*.48);}shape.lineTo(cx-.48,.29);}
    shape.lineTo(-2.49,.29);shape.closePath();
    const o=mesh(new THREE.ShapeGeometry(shape),materials.body,[0,0,side*1.025],layers.body,'Faceted_side_with_wheel_arches');if(side<0)o.rotation.y=Math.PI,o.scale.x=-1;
    // Shoulder crease, sill and small front light aperture.
    box([1.72,.10,.09],[.06,.29,side*1.01],materials.dark,layers.body);
    box([.63,.025,.09],[2.16,.68,side*.77],materials.dark,layers.body);
    const lamp=mat(0xe9ffff,{emissive:0xb2e5f6,emissiveIntensity:.7});box([.45,.016,.048],[2.20,.699,side*.76],lamp,layers.body);
  }
  function deck(rows){for(let i=0;i<rows.length-1;i++)for(const s of [-1,1]){
    const [x,y,w,edgeY]=rows[i],[x2,y2,w2,edgeY2]=rows[i+1];
    panel([[x,y+.02,0],[x2,y2+.02,0],[x2,edgeY2,s*w2],[x,edgeY,s*w]],materials.body);
    panel([[x,edgeY,s*w],[x2,edgeY2,s*w2],[x2,edgeY2-.12,s*1.025],[x,edgeY-.12,s*1.025]],materials.body);
  }}
  deck([[2.49,.66,.91,.63],[2.08,.72,1.025,.79],[1.42,.79,1.025,.94],[.74,.81,.91,.85]]);
  deck([[-1.07,.88,.91,.91],[-1.65,.91,1.025,.95],[-2.49,.81,.94,.81]]);
  box([.11,.26,1.88],[2.43,.43,0],materials.dark,layers.body,'Front_intake');
  for(let i=0;i<4;i++)box([.13,.018,1.87],[2.50,.33+i*.065,0],materials.carbon,layers.body);
  box([.14,.10,2.13],[2.46,.25,0],materials.dark,layers.body,'Front_splitter');
  box([.12,.39,1.97],[-2.46,.49,0],materials.dark,layers.body,'Rear_fascia');
  const tail=mat(0xe34f3f,{emissive:0xe74231,emissiveIntensity:1});box([.04,.023,1.94],[-2.53,.82,0],tail,layers.body,'Full_width_tail_light');
  for(let z=-.86;z<.9;z+=.29)box([.54,.15,.025],[-2.27,.23,z],materials.dark,layers.body,'Diffuser_fin');
  // Bronze-tinted canopy. Opened / lifted as one layer for inspection.
  const front=[[.77,.83,.84],[.77,.83,-.84],[.12,1.30,-.66],[.12,1.30,.66]];
  panel(front,materials.glass,layers.canopy,'Windshield');
  panel([[.12,1.30,.66],[.12,1.30,-.66],[-.63,1.29,-.66],[-.63,1.29,.66]],materials.glass,layers.canopy,'Glass_roof');
  panel([[-.63,1.29,.66],[-.63,1.29,-.66],[-1.18,.88,-.84],[-1.18,.88,.84]],materials.glass,layers.canopy,'Rear_glass');
  for(const s of [-1,1]){
    panel([[.77,.83,s*.84],[.12,1.30,s*.66],[-.63,1.29,s*.66],[-1.18,.88,s*.84]],materials.glass,layers.canopy,'Side_glazing');
    rod([.78,.82,s*.84],[.12,1.30,s*.66],.021,materials.body,layers.canopy);
    rod([-.63,1.29,s*.66],[-1.18,.87,s*.84],.035,materials.body,layers.canopy);
    box([1.4,.035,.025],[-.1,.76,s*1.037],materials.carbon,layers.body,'Door_crease');
    box([.20,.035,.025],[-.53,.78,s*1.05],materials.dark,layers.body,'Flush_door_handle');
    box([.13,.045,.06],[.65,.94,s*.94],materials.dark,layers.canopy,'Camera_mirror');
  }
  // Underbody, illustrative pack segmentation and load paths.
  box([4.16,.09,1.73],[0,.22,0],materials.carbon,layers.chassis,'Carbon_floor');
  for(const s of [-1,1])box([3.5,.15,.12],[0,.36,s*.82],materials.carbon,layers.chassis,'Longitudinal_rail');
  box([2.96,.13,1.45],[.09,.34,0],materials.battery,layers.battery,'Battery_envelope_schematic');
  for(let i=0;i<8;i++)box([.32,.035,1.31],[-1.18+i*.36,.425,0],mat(i%2?0x6b929f:0x94b5bf),layers.battery,'Illustrative_pack_partition');
  // One driving position: passenger space is occupied by Rocket's extra tank.
  box([.66,.12,.55],[.02,.50,.44],materials.seat,layers.cabin,'Driver_seat_base');
  const back=box([.11,.48,.55],[-.30,.75,.44],materials.seat,layers.cabin,'Driver_seat_back');back.rotation.z=-.18;
  box([.12,.18,.32],[-.34,1.02,.44],materials.seat,layers.cabin,'Headrest');
  box([.23,.20,1.55],[.70,.70,0],materials.dark,layers.cabin,'Dashboard');
  const screen=box([.025,.25,.26],[.56,.78,-.02],mat(0x315360,{emissive:0x1a404c,emissiveIntensity:.35}),layers.cabin,'Center_touchscreen');screen.rotation.z=-.15;
  rod([.69,.63,.44],[.49,.83,.44],.035,materials.dark,layers.cabin);
  box([.045,.065,.37],[.49,.86,.44],materials.dark,layers.cabin,'Yoke_crossbar');
  for(const s of [-1,1])box([.06,.17,.055],[.49,.91,.44+s*.18],materials.dark,layers.cabin,'Yoke_grip');
  for(const z of [.34,.53])box([.08,.11,.10],[.99,.49,z],materials.rim,layers.cabin,'Adjustable_pedal_schematic');
  // COPVs: approximate low-poly envelopes, not pressure-vessel engineering.
  const rear=mesh(new THREE.SphereGeometry(.37,10,6),materials.carbon,[-.96,.83,0],layers.tankRear,'Rear_COPV_200L_schematic');rear.scale.set(.9,1,1.75);
  const extra=mesh(new THREE.SphereGeometry(.35,10,6),materials.carbon,[.00,.79,-.43],layers.tankPassenger,'Passenger_COPV_400L_schematic');extra.scale.set(2,1,1);
  for(const x of [-.37,.36]){const band=mesh(new THREE.TorusGeometry(.354,.018,4,10),materials.gold,[x,.79,-.43],layers.tankPassenger,'Illustrative_tank_band');band.rotation.y=Math.PI/2;}
  for(const z of [-.43,.43]){const band=mesh(new THREE.TorusGeometry(.34,.018,4,10),materials.gold,[-.96,.83,z],layers.tankRear);band.scale.x=.96;}
  box([.24,.12,.26],[-1.35,.65,0],materials.gold,layers.pipes,'Illustrative_valve_block');
  // Twin inboard rear motors and visible illustrative suspension rods.
  for(const s of [-1,1]){
    const motor=mesh(new THREE.CylinderGeometry(.19,.19,.37,8),materials.motor,[-1.42,.50,s*.39],layers.motors,'Rear_inboard_motor');motor.rotation.x=Math.PI/2;
    box([.35,.13,.30],[-1.40,.70,s*.39],materials.dark,layers.motors,'Inverter_schematic');
    rod([-1.40,.47,s*.39],[-1.40,.47,s*1.02],.045,materials.rim,layers.motors);
    for(const cx of wheelX){
      rod([cx-.28,.40,s*.56],[cx,.47,s*1.0],.026,materials.rim);
      rod([cx+.28,.40,s*.56],[cx,.47,s*1.0],.026,materials.rim);
      rod([cx,.67,s*.70],[cx,.47,s*1.0],.035,materials.gold);
      rod([cx-.28,.71,s*.42],[cx+.28,.71,s*.42],.045,materials.gold);
      for(let i=0;i<7;i++){const spring=mesh(new THREE.TorusGeometry(.062,.012,3,6),materials.gold,[cx-.20+i*.065,.71,s*.42],layers.suspension);spring.rotation.y=Math.PI/2;}
    }
  }
  // Four extraction fans sit below the four propulsion nozzles.
  for(const z of [-.69,-.23,.23,.69]){
    const rim=mesh(new THREE.TorusGeometry(.135,.024,4,10),materials.carbon,[-2.53,.41,z],layers.fans,'Suction_fan_not_thruster');rim.rotation.y=Math.PI/2;
    const hub=mesh(new THREE.CylinderGeometry(.042,.042,.05,6),materials.dark,[-2.54,.41,z],layers.fans);hub.rotation.z=Math.PI/2;
    for(let i=0;i<5;i++){const a=i*Math.PI*2/5,o=box([.02,.035,.20],[-2.55,.41,z],materials.carbon,layers.fans);o.rotation.x=a;}
  }
  // Low-poly tires, discs, six spokes and carbon wheel centers.
  for(const cx of wheelX)for(const s of [-1,1]){
    const wheel=new THREE.Group();wheel.position.set(cx,.45,s*1.005);layers.wheels.add(wheel);wheel.name='Wheel';
    mesh(new THREE.TorusGeometry(.335,.112,5,12),materials.tire,[0,0,0],wheel,'Faceted_tire');
    const disc=mesh(new THREE.CylinderGeometry(.266,.266,.055,12),materials.rim,[0,0,s*.02],wheel,'Brake_disc');disc.rotation.x=Math.PI/2;
    const ring=mesh(new THREE.TorusGeometry(.30,.022,4,12),materials.rim,[0,0,s*.105],wheel,'Wheel_rim');
    for(let i=0;i<6;i++){const a=i*Math.PI/3;const spoke=box([.25,.04,.055],[Math.cos(a)*.16,Math.sin(a)*.16,s*.105],materials.dark,wheel,'Spoke');spoke.rotation.z=a;}
    const cap=mesh(new THREE.CylinderGeometry(.065,.065,.065,6),materials.carbon,[0,0,s*.12],wheel,'Hub');cap.rotation.x=Math.PI/2;
    box([.08,.19,.06],[.18,.04,s*.06],materials.copper,wheel,'Brake_caliper');
  }
  // Raised rear wing: visually separate from the canopy for exploded views.
  for(const s of [-1,1])rod([-1.9,.85,s*.67],[-2.08,1.12,s*.67],.028,materials.dark,layers.aero);
  const wing=box([.38,.045,2.05],[-2.12,1.14,0],materials.dark,layers.aero,'Active_rear_wing_schematic');wing.rotation.z=-.06;
  // A visible rear row plus six explicitly inferred peripheral points.
  for(const data of THRUSTERS){
    const o=new THREE.Group();o.name=data.id+'_'+data.name;o.position.set(...data.position);
    const axis=new THREE.Vector3(...data.exhaust);o.quaternion.setFromUnitVectors(new THREE.Vector3(0,1,0),axis);layers.thrusters.add(o);
    const col=data.level==='observed'?materials.gold:materials.inferred;
    mesh(new THREE.CylinderGeometry(.079,.043,.11,8,1,true),col,[0,-.035,0],o,'Nozzle_bell_'+data.level);
    const throat=mesh(new THREE.CylinderGeometry(.043,.043,.012,8),materials.dark,[0,-.085,0],o);
    const lip=mesh(new THREE.TorusGeometry(.079,.009,3,8),col,[0,.02,0],o);lip.rotation.x=Math.PI/2;
    const pm=new THREE.MeshBasicMaterial({color:data.level==='observed'?0x72def3:0xf2c179,transparent:true,opacity:.26,depthWrite:false,side:THREE.DoubleSide});
    const jet=new THREE.Group();o.add(jet);jet.visible=false;plumes.push(jet);
    const plume=mesh(new THREE.ConeGeometry(.16,.80,7,1,true),pm,[0,.43,0],jet);plume.rotation.z=Math.PI;
    jet.add(new THREE.ArrowHelper(new THREE.Vector3(0,1,0),new THREE.Vector3(0,.05,0),.72,data.level==='observed'?0x187a92:0xb87b28,.12,.06));
    // Small pick sphere is invisible visually; labels use HTML buttons.
    const pick=mesh(new THREE.SphereGeometry(.13,6,4),new THREE.MeshBasicMaterial({visible:false}),[0,0,0],o);pick.userData.thrusterId=data.id;pickables.push(pick);
    markers.push({data,object:o});
    rod([-.96,.62,0],[data.position[0],.54,data.position[2]],.012,materials.copper,layers.pipes,4);
  }
  for(const [name,g] of Object.entries(layers))g.userData.layer=name;
  car.userData={description:'Artistic low-poly study based on public 2026 Roadster imagery. All coordinates schematic.',axis:'X front, Y up, Z vehicle left',date:'2026-10-17',thrusters:THRUSTERS};
  return {car,layers,markers,plumes,pickables,materials};
}
