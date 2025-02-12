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

// Für die Sky Sphere und den Kamera-Clipping-Wert
const MIN_FAR = 1500; // Mindestwert, damit die Sky Sphere nicht abgeschnitten wird.
const SKYSPHERE_RADIUS = 800; // Sky Sphere-Radius

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

// Aktualisiert den Spline anhand der globalen Parameter und passt danach die Kamera an
function updateSpline() {
  setSeed(seedString);
  if (splineGroup) {
    scene.remove(splineGroup);
  }
  splineGroup = createSplineGroup(numPoints, maxAngle, distanceStep);
  scene.add(splineGroup);
  adjustCameraToFitSpline();
}

// Reset-Funktion: Setzt die Kamera zurück, sodass alle Punkte (und die Sky Sphere) sichtbar sind.
// Dieser Callback wird an den UI-Button "Reset Focus" übergeben.
function resetView() {
  adjustCameraToFitSpline();
}

// Passt die Kameraposition, den Far-Clipping-Wert und die Ausrichtung so an, 
// dass alle Punkte des Splines sichtbar sind.
function adjustCameraToFitSpline() {
  // Berechne die Bounding Box des Spline-Groups
  const box = new THREE.Box3().setFromObject(splineGroup);
  // Bestimme daraus eine Bounding Sphere
  const sphere = new THREE.Sphere();
  box.getBoundingSphere(sphere);
  const center = sphere.center;
  const splineRadius = sphere.radius;
  
  // Berechne den nötigen Abstand anhand des Kamerafov (FOV in Radiant)
  const fov = THREE.MathUtils.degToRad(camera.fov);
  const margin = 1.2; // Sicherheitsfaktor
  const distance = (splineRadius * margin) / Math.sin(fov / 2);
  
  // Setze den Far-Clipping-Wert so, dass er mindestens MIN_FAR beträgt
  camera.far = Math.max(distance + splineRadius * margin, MIN_FAR);
  camera.updateProjectionMatrix();
  
  // Positioniere die Kamera relativ zum Center entlang der Z-Achse.
  const offset = new THREE.Vector3(0, 0, distance);
  controls.getObject().position.copy(center.clone().add(offset));
  camera.lookAt(center);
}

// Erzeugt eine Sky Sphere, die von innen gerendert wird und die Textur aus "img/skybox.png" verwendet.
function createSkySphereFromImage() {
  const geometry = new THREE.SphereGeometry(SKYSPHERE_RADIUS, 60, 40);
  const loader = new THREE.TextureLoader();
  const texture = loader.load('img/skybox.png', (tex) => {
    tex.encoding = THREE.sRGBEncoding;
    tex.minFilter = THREE.LinearMipMapLinearFilter;
    tex.magFilter = THREE.LinearFilter;
    tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
  });
  const material = new THREE.MeshBasicMaterial({ map: texture, side: THREE.BackSide });
  material.depthWrite = false;
  const skySphere = new THREE.Mesh(geometry, material);
  skySphere.renderOrder = -100;
  return skySphere;
}

// --- Zusätzliche Mausbewegungen ---

// Mausrad: Bewegt den Spieler vorwärts/rückwärts (unabhängig vom PointerLock)
function onWheel(e) {
  e.preventDefault();
  const moveFactor = 0.3;
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  controls.getObject().position.addScaledVector(forward, -e.deltaY * moveFactor);
}

// Für das Draggen der Route mit der mittleren Maustaste:
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

// --- Steuerung des Navigationsmodus über rechte Maustaste ---
// Der Navigationsmodus (PointerLock) wird ausschließlich aktiviert, wenn die rechte Maustaste gedrückt wird.
function onRightMouseDown(e) {
  if (e.button === 2) { // Rechte Maustaste
    controls.lock();
    e.preventDefault();
  }
}

function onRightMouseUp(e) {
  if (e.button === 2) {
    controls.unlock();
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
  if (isDraggingRoute) {
    onMiddleMouseMove(e);
  }
  // PointerLockControls übernimmt die Mausbewegungen, wenn gesperrt.
}

// --- Window Resize Handler ---
function onWindowResize() {
  camera.aspect = window.innerWidth / window.innerHeight;
  camera.updateProjectionMatrix();
  renderer.setSize(window.innerWidth, window.innerHeight);
}

// --- Main Initialization und Animationsschleife ---
document.addEventListener('DOMContentLoaded', () => {
  // Szene erstellen
  scene = new THREE.Scene();
  scene.background = new THREE.Color(0x000000);
  
  // Erstelle den Renderer und konfiguriere das Output-Encoding
  renderer = new THREE.WebGLRenderer();
  renderer.setSize(window.innerWidth, window.innerHeight);
  renderer.outputEncoding = THREE.sRGBEncoding;
  document.body.appendChild(renderer.domElement);
  
  // Füge die Sky Sphere hinzu, die die Textur aus "img/skybox.png" verwendet.
  const skySphere = createSkySphereFromImage();
  scene.add(skySphere);
  
  // Kamera erstellen – FOV auf 90° gesetzt, um ein größeres Sichtfeld zu erhalten.
  camera = new THREE.PerspectiveCamera(90, window.innerWidth / window.innerHeight, 0.1, MIN_FAR);
  
  // Erstelle und füge PointerLockControls hinzu, bevor der Spline generiert wird.
  controls = new PointerLockControls(camera, renderer.domElement);
  scene.add(controls.getObject());
  // Setze eine initiale Position (wird später durch adjustCameraToFitSpline() überschrieben)
  controls.getObject().position.set(0, 200, 600);
  
  // Erstelle die UI und übergebe resetView als Callback.
  // Bitte passe in deiner ui.js den Button-Text zu "Reset Focus" an.
  createUI({ numPoints, distanceStep, maxAngle, seedString }, onUIUpdate, resetView, onSeedChange);
  
  // Generiere die Route und passe die Kameraposition an
  updateSpline();
  
  // Registriere alle Maus-Event-Listener
  renderer.domElement.addEventListener('mousedown', onMouseDown);
  renderer.domElement.addEventListener('mouseup', onMouseUp);
  renderer.domElement.addEventListener('mousemove', onMouseMove);
  renderer.domElement.addEventListener('wheel', onWheel, { passive: false });
  
  // Navigation ausschließlich per rechte Maustaste: Left-Click Toggle entfällt.
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
      
      // Nur die horizontale Komponente für die Bewegung verwenden
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
