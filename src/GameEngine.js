import * as THREE from 'three';
import { GameObjectManager } from './GameObjectManager.js';

class GameEngine {
  static #instance = null;

  static getInstance() {
    if (!GameEngine.#instance) {
      GameEngine.#instance = new GameEngine();
    }
    return GameEngine.#instance;
  }

  constructor() {
    if (GameEngine.#instance) {
      throw new Error('GameEngine is a singleton. Use GameEngine.getInstance() instead.');
    }

    this.scene = new THREE.Scene();
    this.scene.background = new THREE.Color(0x000000);

    this.renderer = new THREE.WebGLRenderer();
    this.renderer.setSize(window.innerWidth, window.innerHeight);
    this.renderer.outputEncoding = THREE.sRGBEncoding;
    document.body.appendChild(this.renderer.domElement);
    this.gameObjectManager = null;
  }

  setCurrentCamera(camera) {
    this.camera = camera;
  }

  getScene() {
    return this.scene;
  }

  getRenderer() {
    return this.renderer;
  }

  getCamera() {
    return this.camera;
  }

  update(deltaTime) {
    if (this.gameObjectManager === null)  {
      this.gameObjectManager = GameObjectManager.getInstance();
    }
    this.gameObjectManager.update(deltaTime);
    this.renderer.render(this.scene, this.camera);
  }
}

export default GameEngine;
