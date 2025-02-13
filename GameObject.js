// GameObject.js
import GameEngine from './GameEngine.js';
import { GameObjectManager } from './GameObjectManager.js';

export class GameObject {
  constructor() {
    // Basis properties for game objects
    this.gameEngine = GameEngine.getInstance();
    this.scene = this.gameEngine.getScene();
    this.renderer = this.gameEngine.getRenderer();
    this.gameObjectManager = GameObjectManager.getInstance();
  }

  update(deltaTime) {
    // Update logic per frame
  }

  initiate() {
    this.gameObjectManager.add(this);
  }

  destroy() {
    this.gameObjectManager.remove(this);
  }

  addToScene(object) {
    this.scene.add(object);
  }

  deleteFromScene(object) {
    this.scene.add(object);
  }
}
