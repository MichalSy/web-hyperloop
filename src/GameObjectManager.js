// GameObjectManager.js
export class GameObjectManager {
  constructor() {
    this.gameObjects = [];
  }

  add(gameObject) {
    this.gameObjects.push(gameObject);
  }

  update(deltaTime) {
    this.gameObjects.forEach(object => {
      if (typeof object.update === 'function') {
        object.update(deltaTime);
      }
    });
  }
}
