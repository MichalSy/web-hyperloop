// main.js
import * as THREE from 'three';
import { SplineGraph } from './SplineGraph.js';
import { UI } from './ui.js';
import { Player } from './Player.js';
import { Skybox } from './skybox.js';
import GameEngine from './GameEngine.js';

document.addEventListener('DOMContentLoaded', () => {
  const gameEngine = GameEngine.getInstance();

  const skybox = new Skybox();
  skybox.initiate();
  
  const player = new Player();
  player.initiate();

  const splineGraph = new SplineGraph();
  splineGraph.initiate();

  const ui = new UI();
  ui.initiate();
  
  // init generated spline
  splineGraph.updateSpline(ui.numPoints, ui.maxAngle, ui.distanceStep, ui.seedString);
  
  // main loop
  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    gameEngine.update(delta);
  }
  animate();
});
