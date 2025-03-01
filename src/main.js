// main.js
import * as THREE from "three";
import { UI } from "./ui.js";
import { Player } from "./Player.js";
import { Skybox } from "./skybox.js";
import GameEngine from "./GameEngine.js";
import { TrackViewer } from "./TrackViewer.js";

document.addEventListener("DOMContentLoaded", () => {
  const gameEngine = GameEngine.getInstance();

  const skybox = new Skybox();
  skybox.initiate();

  const player = new Player();
  player.initiate();

  // Verwende TrackViewer für die Strecke
  const trackviewer = new TrackViewer();
  trackviewer.initiate();

  // const ui = new UI();
  // ui.initiate();

  // Setup lighting
  const scene = gameEngine.getScene();
  const ambientLight = new THREE.AmbientLight(0xffffff, 1.0);
  scene.add(ambientLight);
  const dirLight = new THREE.DirectionalLight(0x0000ff, 0.8);
  dirLight.position.set(0, 10, 0);
  scene.add(dirLight);

  // main loop
  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    gameEngine.update(delta);
  }
  animate();
});
