// main.js
import * as THREE from 'three';
import { PointerLockControls } from 'https://cdn.jsdelivr.net/npm/three@0.152.2/examples/jsm/controls/PointerLockControls.js';
import { setSeed, createSplineGroup, startPointCoord } from './spline.js';
import { UI } from './ui.js';
import { initializeInput, Player } from './Player.js';
import { Skybox } from './skybox.js';
import { GameObjectManager } from './GameObjectManager.js';

// Global parameters
let numPoints = 50;
let distanceStep = 10;
let maxAngle = 60;
let seedString = "hanna";

// Für die Sky Sphere und den Kamera-Clipping-Wert
const MIN_FAR = 1500;
const SKYSPHERE_RADIUS = 800;

// Global variables
let scene, camera, renderer, controls, player;
let splineGroup = null;

// --- UI Callback-Funktionen ---
function onUIUpdate(changedParams) {
  if (changedParams.numPoints !== undefined) numPoints = changedParams.numPoints;
  if (changedParams.distanceStep !== undefined) distanceStep = changedParams.distanceStep;
  if (changedParams.maxAngle !== undefined) maxAngle = changedParams.maxAngle;
  updateSpline();
}

function onSeedChange(newSeed) {
  seedString = newSeed;
  updateSpline();
}

// Aktualisiert den Spline und passt danach die Kamera an
function updateSpline() {
  setSeed(seedString);
  if (splineGroup) scene.remove(splineGroup);
  splineGroup = createSplineGroup(numPoints, maxAngle, distanceStep);
  // Setze die aktuelle Spline Group für die Input-Logik:
  player.setInputSplineGroup(splineGroup);
  scene.add(splineGroup);
  adjustCameraToFitSpline();
}

// Reset Focus: passt die Kamera an, sodass alle Punkte sichtbar sind
function resetView() {
  adjustCameraToFitSpline();
}

// Passt die Kamera an die Spline-Route an
function adjustCameraToFitSpline() {
  const box = new THREE.Box3().setFromObject(splineGroup);
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  const center = sphere.center;
  const splineRadius = sphere.radius;
  
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const margin = 1;
  const distance = (splineRadius * margin) / Math.sin(fov / 2);
  
  camera.far = Math.max(distance + splineRadius * margin, MIN_FAR);
  camera.updateProjectionMatrix();
  
  const offset = new THREE.Vector3(0, 0, distance);
  controls.getObject().position.copy(center.clone().add(offset));
  camera.lookAt(center);
}

// --- Main Initialization und Animationsschleife ---
document.addEventListener('DOMContentLoaded', () => {
  // Szene und Renderer erstellen
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  
  renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild(renderer.domElement);
  
  // Sky Sphere hinzufügen
  const skybox = new Skybox(renderer);
  scene.add(skybox.mesh);

  // GameObjectManager initialisieren und GameObjects hinzufügen 
  const gameObjectManager = new GameObjectManager();
  gameObjectManager.add(skybox);
  
  // Kamera erstellen (z.B. FOV 90°)
  camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, MIN_FAR);
  
  // PointerLockControls erstellen
  controls = new PointerLockControls(camera, renderer.domElement);
  scene.add(controls.getObject());
  controls.getObject().position.set(0, 200, 600);
  
  player = new Player(camera, controls);
  gameObjectManager.add(player);

  // UI erstellen und zum GameObjectManager hinzufügen
  const ui = new UI({ numPoints, distanceStep, maxAngle, seedString }, onUIUpdate, resetView, onSeedChange);
  gameObjectManager.add(ui);
  
  // Spline generieren und Kamera anpassen
  updateSpline();
  
  // Input-Handler initialisieren (alle Maus- und Keyboard-Events)
  initializeInput(renderer.domElement, camera, controls);
  
  // Animationsschleife und WASD-Steuerung
  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const moveSpeed = 100;
    
    // (Bewegung des Spielers erfolgt nun in der Player-Klasse.)
    // Update aller GameObjects über den Manager
    gameObjectManager.update(delta);
    renderer.render(scene, camera);
  }
  animate();
});
