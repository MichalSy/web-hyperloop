// GameObjectManager.js
export class GameObjectManager {
  static #instance = null;

  /**
   * Get the singleton instance of GameObjectManager
   * @returns {GameObjectManager} The singleton instance
   */
  static getInstance() {
    if (!GameObjectManager.#instance) {
      GameObjectManager.#instance = new GameObjectManager();
    }
    return GameObjectManager.#instance;
  }

  constructor() {
    if (GameObjectManager.#instance) {
      throw new Error('GameObjectManager is a singleton. Use GameObjectManager.getInstance() instead.');
    }
    this.gameObjects = [];
  }

  add(gameObject) {
    this.gameObjects.push(gameObject);
  }

  remove(gameObject) {
    const index = this.gameObjects.indexOf(gameObject);
    if (index > -1) {
      this.gameObjects.splice(index, 1);
    }
  }

  update(deltaTime) {
    this.gameObjects.forEach(object => {
      if (typeof object.update === 'function') {
        object.update(deltaTime);
      }
    });
  }

  /**
   * Get the first game object instance of the specified type
   * @param {Function} type The constructor/class to search for
   * @returns {Object|null} The first instance of the specified type, or null if none found
   */
  getObjectByType(type) {
    return this.gameObjects.find(obj => obj instanceof type) || null;
  }

  /**
   * Get all game object instances of the specified type
   * @param {Function} type The constructor/class to search for
   * @returns {Array} Array of all instances of the specified type
   */
  getObjectsByType(type) {
    return this.gameObjects.filter(obj => obj instanceof type);
  }
}
