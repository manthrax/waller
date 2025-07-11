import*as THREE from 'three';

const scene = new THREE.Scene();
scene.background = new THREE.Color(0x4040b0)
const camera = new THREE.PerspectiveCamera(60,innerWidth / innerHeight,0.1,1000);
camera.position.set(0, 15, 130);
scene.add(camera)
scene.fog = new THREE.Fog(0x4040b0, 10, 100 )
const renderer = new THREE.WebGLRenderer({
    antialias: true
});

renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);


function VSim() {
    const gravity = new THREE.Vector3(0,-0.003,0);
    const friction = 0.999;
    let vel = new THREE.Vector3();
    let points = this.points = []
    let constraints = this.constraints = []
    let cursor = this.cursor = vel.clone();
    
    document.addEventListener('keydown',()=>gravity.multiplyScalar(-1))
    this.Point = class Point {
        constructor(pos, pinned=false) {
            this.pos = pos.clone();
            this.prev = pos.clone();
            this.pinned = pinned;
            points.push(this)
        }
        update(gravity, friction) {
            if (this.pinned)
                return;
            vel.copy(this.pos).sub(this.prev).multiplyScalar(friction);
            this.prev.copy(this.pos);
            this.pos.add(vel).add(gravity);
            let cdist = this.pos.distanceTo(cursor)
            let minDist = cursor.radius || 5;
            if(cdist<minDist){
                //Perturb with cursor object
                this.pos.sub(cursor).setLength(minDist).add(cursor)
            }
            if(this.pos.y<0){
                //Constrain to ground...
                this.pos.y *= -1;
            }
        }
    }

    // Constraint
    const diff = new THREE.Vector3()
    this.Constraint = class Constraint {
        constructor(p1, p2, length=null) {
            this.p1 = p1;
            this.p2 = p2;
            this.length = length ?? p1.pos.distanceTo(p2.pos);
            constraints.push(this)
        }
        solve() {
            diff.copy(this.p2.pos).sub(this.p1.pos);
            const dist = diff.length();
            const delta = diff.multiplyScalar((dist - this.length) / dist / 2);

            if(this.p1.pinned&&this.p2.pinned)return;
            if(this.p1.pinned||this.p2.pinned)delta.multiplyScalar(2);
            if (!this.p1.pinned)
                this.p1.pos.add(delta);
            
            if (!this.p2.pinned)
                this.p2.pos.sub(delta);
        }
    }

    const bridgeGeom = new THREE.BoxGeometry(1,1,1);
    const bridgeMat = new THREE.MeshStandardMaterial({
        color: 0xf00000,
        blending : THREE.AdditiveBlending,
        transparent : true,
        emissive: 0x000000
    });


//const count = segments;

    let bridgeMesh;
    let getInstances=()=>{
        if((!bridgeMesh)||(bridgeMesh.count!=constraints.length)){
            if(bridgeMesh){
                scene.remove(bridgeMesh);
                bridgeMesh.dispose();
            }
            const count = constraints.length 
            bridgeMesh = new THREE.InstancedMesh(bridgeGeom,bridgeMat,count);
            scene.add(bridgeMesh);
            bridgeMesh.castShadow = true;
            bridgeMesh.frustumCulled = false;
        }
    }

    
    const rot = new THREE.Quaternion()
    const pos = new THREE.Vector3();
    const dir = new THREE.Vector3();
    const scale = new THREE.Vector3();
    const mat = new THREE.Matrix4()
    const up = new THREE.Vector3(0,1,0);
    const right = new THREE.Vector3(1,0,0);

    this.step = () => {
        
        for (let p of points)
            p.update(gravity, friction);
        for (let i = 0; i < 10; i++)
            for (let s of constraints)
                s.solve();

        // Update instances
        getInstances();
        let i = 0;
        for (let c of constraints) {
            const a = c.p1.pos
              , b = c.p2.pos;
            pos.copy(a).add(b).multiplyScalar(0.5);
            dir.copy(b).sub(a);
            let len = dir.length();
            dir.normalize();
            right.copy(up);//.cross(up);
            rot.setFromUnitVectors(right,dir);
            scale.set( .05,len,.05);
            mat.compose(pos, rot, scale);
            bridgeMesh.setMatrixAt(i++, mat);
        }
        bridgeMesh.instanceMatrix.needsUpdate = true;
    }
}

let vsim = new VSim();
let {Point, Constraint} = vsim;

import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js"

new GLTFLoader().load('./ggbridge.glb',glb=>{
    //scene.add(glb.scene);
    let objs=[]

    //glb.scene.rotation.y = Math.PI*.5;
    //glb.scene.scale.multiplyScalar(10);
    let cam;
    glb.scene.traverse(e=>(e.isLine&&objs.push(e))||(e.isPerspectiveCamera&&(cam=e)));

    if(cam){
        glb.scene.localToWorld(camera.position.copy(cam.position));
        let targ = new THREE.Vector3(0,0,-50).applyQuaternion(cam.quaternion)
        controls.target.copy(camera.position).add(targ);
        controls.update();
    }
    let buildObject=(ls,pinAxes = 5)=>{
        //ls.geometry.rotateY(Math.PI*.5);
        //ls.geometry.scale(10,10,10);
        
        ls.updateMatrixWorld(true);
        ls.geometry.computeBoundingBox();
        let idx = ls.geometry.index.array
        let pts = ls.geometry.attributes.position.array
        let p=[];
        let bb=ls.geometry.boundingBox;
        let tv = new THREE.Vector3();
        for(let i=0;i<pts.length;i+=3){
            let x=pts[i+0];
            let y=pts[i+1];
            let z=pts[i+2];
            let edge = .001;
            let pin = ((pinAxes&1)&&(x>(bb.max.x-edge)))
                ||((pinAxes&4)&&(y>(bb.max.y-edge)))
                ||((pinAxes&16)&&(z>(bb.max.z-edge)))
                ||((pinAxes&2)&&(x<(bb.min.x+edge)))
                ||((pinAxes&8)&&(y<(bb.min.y+edge)))
                ||((pinAxes&32)&&(z<(bb.min.z+edge)));
            
            tv.set(x,y,z)
            ls.localToWorld(tv);
            p.push(new Point(tv,pin));
        }
        for(let i=0;i<idx.length;i+=2)
            new Constraint(p[idx[i]],p[idx[i+1]]);
    }
    buildObject(objs[0],5)
    for(let i=1;i<objs.length;i++)
        buildObject(objs[i],objs[i].userData.pinAxes||0)
})
renderer.shadowMap.enabled = true;
renderer.shadowMap.type = THREE.PCFSoftShadowMap;
// Lights
scene.add(new THREE.HemisphereLight(0xffffff,0x222233,1));
const light = new THREE.DirectionalLight(0xffffff,0.8);
let srad = 50;
light.shadow.mapSize.set(2048,2048);
light.castShadow = true;
light.shadow.camera.near = 1.;
light.shadow.camera.far = 100;
light.shadow.camera.left = -srad;
light.shadow.camera.right = srad;
light.shadow.camera.top = srad;
light.shadow.camera.bottom = -srad;
light.shadow.camera.updateProjectionMatrix();
//light.shadow.bias = -0.01;
scene.add(light);
light.position.set(45, 30, 17);
scene.add(light);
//scene.add(new THREE.DirectionalLightHelper(light, srad));


// Ground
const ground = new THREE.Mesh(new THREE.PlaneGeometry(2000,2000,10,10),new THREE.MeshStandardMaterial({
    color: 0x223333,
    dithering:true
}));
ground.receiveShadow = true;
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
const controls = new OrbitControls(camera,renderer.domElement);
controls.enableDamping = true;
// Animate

let cursor = new THREE.Mesh(new THREE.SphereGeometry(),new THREE.MeshBasicMaterial({wireframe:true}))
scene.add(cursor);
let raycaster = new THREE.Raycaster();
let buttons=0;
let mouseHandler=(e)=>{
    buttons=e.buttons;
    cursor.position.x = ( event.clientX / window.innerWidth ) * 2 - 1;
    cursor.position.y = - ( event.clientY / window.innerHeight ) * 2 + 1;
    raycaster.setFromCamera(cursor.position, camera);
    let intersects = raycaster.intersectObject(ground);
    cursor.visible = false;
    if(intersects.length>0){
        cursor.position.copy(intersects[0].point);
        vsim.cursor.copy(cursor.position)
        vsim.cursor.radius = buttons?5.5:2.;
        cursor.scale.setScalar(vsim.cursor.radius)
        cursor.visible = true;
    }   
};


['pointerdown','pointerup','pointermove'].forEach((e)=>document.addEventListener(e,mouseHandler))

function animate() {
    vsim.step();
    controls.update();
    renderer.render(scene, camera);
}
renderer.setAnimationLoop(animate);

window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    renderer.setSize(innerWidth, innerHeight);
}
);
