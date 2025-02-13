import * as THREE from 'three';
import { GameObject } from './GameObject.js';

const SKYSPHERE_RADIUS = 800;

export class Skybox extends GameObject {
  constructor() {
    super();
    const geometry = new THREE.SphereGeometry(SKYSPHERE_RADIUS, 60, 40);
    const texture = new THREE.TextureLoader().load('img/skybox.png', () => {
      texture.anisotropy = this.renderer.capabilities.getMaxAnisotropy();
    });
    texture.encoding = THREE.sRGBEncoding;
    texture.generateMipmaps = false;
    texture.minFilter = THREE.LinearFilter;
    texture.magFilter = THREE.LinearFilter;
    
    const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide });
    material.depthWrite = false;
    this.mesh = new THREE.Mesh(geometry, material);
    this.mesh.renderOrder = -100;
    this.addToScene(this.mesh);
  }

  update(deltaTime) {
    this.mesh.rotation.y += deltaTime * .04;
  }
}
