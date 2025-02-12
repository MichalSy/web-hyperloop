// main.js
import * as THREE from 'three';
import { PointerLockControls } from 'https://cdn.jsdelivr.net/npm/three@0.152.2/examples/jsm/controls/PointerLockControls.js';
import { setSeed, createSplineGroup, startPointCoord } from './spline.js';
import { createUI } from './ui.js';

// Global parameters
let numPoints = 50;
let distanceStep = 10;
let maxAngle = 60;
let seedString = "hanna";

// Global variables for scene, camera, renderer, controls, etc.
let scene, camera, renderer, controls;
let splineGroup = null;

// Callback für UI-Updates
function onUIUpdate(changedParams) {
  if (changedParams.numPoints !== undefined) {
    numPoints = changedParams.numPoints;
  }
  if (changedParams.distanceStep !== undefined) {
    distanceStep = changedParams.distanceStep;
  }
  if (changedParams.maxAngle !== undefined) {
    maxAngle = changedParams.maxAngle;
  }
  updateSpline();
}

// Callback für Seed-Änderungen
function onSeedChange(newSeed) {
  seedString = newSeed;
  updateSpline();
}

// Aktualisiert den Spline anhand der globalen Parameter
function updateSpline() {
  setSeed(seedString);
  if (splineGroup) {
    scene.remove(splineGroup);
  }
  splineGroup = createSplineGroup(numPoints, maxAngle, distanceStep);
  scene.add(splineGroup);
}

// Fokussiert die Kamera auf den Startpunkt der Route
function focusOnStart() {
  const offset = new THREE.Vector3(0, 100, 100);
  camera.position.copy(startPointCoord.clone().add(offset));
  camera.lookAt(startPointCoord);
}

// --- Zusätzliche Mausbewegungen ---

// Mausrad: Bewegt den Spieler vorwärts/rückwärts (unabhängig vom PointerLock)
function onWheel(e) {
  e.preventDefault();
  const moveFactor = 0.3; // Schneller
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  controls.getObject().position.addScaledVector(forward, -e.deltaY * moveFactor);
}

// Für das Draggen der Route mit der mittleren Maustaste:
// Wir berechnen den Schnittpunkt des Mausstrahls mit einer Ebene, die durch die aktuelle
// Position der Route (splineGroup) verläuft und senkrecht zur Kamerarichtung steht.
const raycaster = new THREE.Raycaster();
let dragPlane = new THREE.Plane();
let dragStartPoint = new THREE.Vector3();
let routeInitialPosition = new THREE.Vector3();
let isDraggingRoute = false;

function onMiddleMouseDown(e) {
  if (e.button === 1) { // Mittlere Maustaste
    isDraggingRoute = true;
    const mouse = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);
    const camDir = new THREE.Vector3();
    camera.getWorldDirection(camDir);
    // Erzeuge eine Ebene durch die momentane Position der Route, senkrecht zur Kamerarichtung.
    dragPlane.setFromNormalAndCoplanarPoint(camDir, splineGroup.position);
    raycaster.ray.intersectPlane(dragPlane, dragStartPoint);
    routeInitialPosition.copy(splineGroup.position);
    e.preventDefault();
  }
}

function onMiddleMouseMove(e) {
  if (isDraggingRoute) {
    const mouse = new THREE.Vector2(
      (e.clientX / window.innerWidth) * 2 - 1,
      -(e.clientY / window.innerHeight) * 2 + 1
    );
    raycaster.setFromCamera(mouse, camera);
    const newIntersection = new THREE.Vector3();
    raycaster.ray.intersectPlane(dragPlane, newIntersection);
    if (newIntersection) {
      const delta = new THREE.Vector3().subVectors(newIntersection, dragStartPoint);
      splineGroup.position.copy(routeInitialPosition.clone().add(delta));
    }
    e.preventDefault();
  }
}

function onMiddleMouseUp(e) {
  if (e.button === 1) {
    isDraggingRoute = false;
    e.preventDefault();
  }
}

// Rechte Maustaste: Rotation wie im PointerLock-Modus
let isRightMouseDown = false;

function onRightMouseDown(e) {
  if (e.button === 2) { // rechte Maustaste
    isRightMouseDown = true;
    e.preventDefault();
  }
}

function onRightMouseMove(e) {
  if (isRightMouseDown) {
    const sensitivity = 0.002; // Gleiche Empfindlichkeit wie im PointerLock-Modus
    const movementX = e.movementX || 0;
    const movementY = e.movementY || 0;
    // Update Yaw (horizontal) über das Yaw-Objekt:
    controls.getObject().rotation.y -= movementX * sensitivity;
    // Update Pitch (vertikal) über das Pitch-Objekt und clampen:
    const pitchObject = controls.getPitchObject();
    pitchObject.rotation.x -= movementY * sensitivity;
    pitchObject.rotation.x = Math.max(-Math.PI / 2, Math.min(Math.PI / 2, pitchObject.rotation.x));
    e.preventDefault();
  }
}

function onRightMouseUp(e) {
  if (e.button === 2) {
    isRightMouseDown = false;
    e.preventDefault();
  }
}

// Kombinierte Mouse-Event-Listener
function onMouseDown(e) {
  if (e.button === 1) {
    onMiddleMouseDown(e);
  } else if (e.button === 2) {
    onRightMouseDown(e);
  }
}

function onMouseUp(e) {
  if (e.button === 1) {
    onMiddleMouseUp(e);
  } else if (e.button === 2) {
    onRightMouseUp(e);
  }
}

function onMouseMove(e) {
  // Beachte: Wir rufen beide Funktionen auf, falls beide Modi aktiv sein sollten.
  if (isDraggingRoute) {
    onMiddleMouseMove(e);
  }
  if (isRightMouseDown) {
    onRightMouseMove(e);
  }
}

// --- Window Resize Handler ---
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Main Initialization und Animationsschleife ---
document.addEventListener('DOMContentLoaded', () => {
  // Szene, Kamera, Renderer erstellen
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  
  camera = new THREE.PerspectiveCamera(25, window.innerWidth / window.innerHeight, 0.1, 1000);
  renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  document.body.appendChild(renderer.domElement);
  
  // EventListener, die auf renderer.domElement zugreifen, werden hier gesetzt.
  renderer.domElement.addEventListener('contextmenu', (e) => e.preventDefault());
  
  updateSpline();
  
  createUI({ numPoints, distanceStep, maxAngle, seedString }, onUIUpdate, focusOnStart, onSeedChange);
  
  controls = new PointerLockControls(camera, renderer.domElement);
  scene.add(controls.getObject());
  controls.getObject().position.set(0, 200, 600);
  
  // Registriere alle Maus-Event-Listener
  renderer.domElement.addEventListener('mousedown', onMouseDown);
  renderer.domElement.addEventListener('mouseup', onMouseUp);
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
  
  // Pointer-Lock-Toggle: Klicks außerhalb der UI schalten den Modus um.
  document.addEventListener('click', () => {
    if (controls.isLocked) {
      controls.unlock();
    } else {
      controls.lock();
    }
  });
  
  window.addEventListener('resize', onWindowResize, false);
  
  // WASD-Steuerung (nur im PointerLock-Modus)
  const keys = {};
  document.addEventListener('keydown', event => { keys[event.code] = true; });
  document.addEventListener('keyup', event => { keys[event.code] = false; });
  
  const clock = new THREE.Clock();
  function animate() {
    requestAnimationFrame(animate);
    const delta = clock.getDelta();
    const moveSpeed = 100; // 100 Einheiten pro Sekunde
    
    if (controls.isLocked) {
      const forward = new THREE.Vector3();
      camera.getWorldDirection(forward);
      
      const horizontalForward = forward.clone();
      horizontalForward.y = 0;
      horizontalForward.normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(horizontalForward, up).normalize();
      
      if (keys['KeyW']) {
        controls.getObject().position.addScaledVector(forward, moveSpeed * delta);
      }
      if (keys['KeyS']) {
        controls.getObject().position.addScaledVector(forward, -moveSpeed * delta);
      }
      if (keys['KeyA']) {
        controls.getObject().position.addScaledVector(right, -moveSpeed * delta);
      }
      if (keys['KeyD']) {
        controls.getObject().position.addScaledVector(right, moveSpeed * delta);
      }
    }
    renderer.render(scene, camera);
  }
  animate();
});
