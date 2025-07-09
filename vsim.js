import*as THREE from 'three';

const scene = new THREE.Scene();
const camera = new THREE.PerspectiveCamera(60,innerWidth / innerHeight,0.1,1000);
camera.position.set(0, 15, 130);

const renderer = new THREE.WebGLRenderer({
    antialias: true
});

renderer.setSize(innerWidth, innerHeight);
document.body.appendChild(renderer.domElement);


function VSim() {
    const gravity = new THREE.Vector3(0,-0.03,0);
    const friction = 0.999;
    let points = this.points = []
    let constraints = this.constraints = []
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
            const vel = this.pos.clone().sub(this.prev).multiplyScalar(friction);
            this.prev.copy(this.pos);
            this.pos.add(vel).add(gravity);
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
        color: 0xff5533
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
        for (let i = 0; i < constraints.length; i++) {
            let c = constraints[i];
            const a = c.p1.pos
              , b = c.p2.pos;
            pos.copy(a).add(b).multiplyScalar(0.5);
            dir.copy(b).sub(a);
            let len = dir.length();
            dir.normalize();
            right.copy(up);//.cross(up);
            rot.setFromUnitVectors(right,dir);
            scale.set( .2,len,.2);
            mat.compose(pos, rot, scale);
            bridgeMesh.setMatrixAt(i, mat);
        }
        bridgeMesh.instanceMatrix.needsUpdate = true;
    }
}

let vsim = new VSim();
let {Point, Constraint} = vsim;

import {GLTFLoader} from "three/addons/loaders/GLTFLoader.js"

new GLTFLoader().load('./bridge.glb',glb=>{
    //scene.add(glb.scene);
    let ls = glb.scene.children[0]
    ls.geometry.rotateY(Math.PI*.5);
    ls.geometry.scale(10,10,10);

    ls.geometry.computeBoundingBox();
    let idx = ls.geometry.index.array
    let pts = ls.geometry.attributes.position.array
    let p=[];
    let maxx=19.5;
    let miny=20.;
    let maxy=0.1;
    let bb=ls.geometry.boundingBox;
    for(let i=0;i<pts.length;i+=3){
        let x=pts[i+0];
        let y=pts[i+1];
        let z=pts[i+2];
        let pin = (y>(bb.max.y-.1))||(y<(bb.min.y+.1))||(x>(bb.max.x-.1))||(x<(bb.min.x+.1));
        p.push(new Point(new THREE.Vector3(x,y,z),pin));
    }
    for(let i=0;i<idx.length;i+=2)
        new Constraint(p[idx[i]],p[idx[i+1]]);
})

// Lights
scene.add(new THREE.HemisphereLight(0xffffff,0x222233,1));
const light = new THREE.DirectionalLight(0xffffff,0.8);
light.position.set(5, 10, 7);
scene.add(light);

// Ground
const ground = new THREE.Mesh(new THREE.PlaneGeometry(200,200),new THREE.MeshStandardMaterial({
    color: 0x333333,
    dithering:true
}));
ground.rotation.x = -Math.PI / 2;
scene.add(ground);

// Animate
function animate() {
    requestAnimationFrame(animate);
    vsim.step();
    renderer.render(scene, camera);
}
animate();

import {OrbitControls} from 'three/addons/controls/OrbitControls.js';
const controls = new OrbitControls(camera,renderer.domElement);
window.addEventListener('resize', () => {
    camera.aspect = innerWidth / innerHeight;
    camera.updateProjectionMatrix();
    controls.update();
    renderer.setSize(innerWidth, innerHeight);
}
);
