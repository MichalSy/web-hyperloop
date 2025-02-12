// input.js
import * as THREE from 'three';

export let keys = {};  // Speichert Tastatureingaben

// Intern verwendete Variablen
let camera, controls, domElement;
let splineGroup = null;  // Referenz auf die aktuelle Route (wird von main.js gesetzt)
const raycaster = new THREE.Raycaster();
let dragPlane = new THREE.Plane();
let dragStartPoint = new THREE.Vector3();
let routeInitialPosition = new THREE.Vector3();
let isDraggingRoute = false;

/**
 * Initialisiert alle Eingabe-Eventlistener.
 * @param {HTMLElement} element - Das DOM-Element (z.B. renderer.domElement)
 * @param {THREE.Camera} cam - Die Kamera
 * @param {PointerLockControls} ctrl - Die PointerLockControls
 */
export function initializeInput(element, cam, ctrl) {
  camera = cam;
  controls = ctrl;
  domElement = element;

  // Maus-Events
  domElement.addEventListener('mousedown', onMouseDown);
  domElement.addEventListener('mouseup', onMouseUp);
  domElement.addEventListener('mousemove', onMouseMove);
  domElement.addEventListener('wheel', onWheel, { passive: false });
  window.addEventListener('resize', onWindowResize, false);

  // Keyboard-Events
  document.addEventListener('keydown', (event) => { keys[event.code] = true; });
  document.addEventListener('keyup', (event) => { keys[event.code] = false; });
}

/**
 * Setzt die Referenz auf die aktuelle Spline-Route, sodass die Mauseingaben (z.B. Draggen)
 * diese beeinflussen können.
 * @param {THREE.Group} group - Die Spline-Route (Spline Group)
 */
export function setInputSplineGroup(group) {
  splineGroup = group;
}

// --- Mouse Event Handler ---

function onWheel(e) {
  e.preventDefault();
  const moveFactor = 0.3;
  const forward = new THREE.Vector3();
  camera.getWorldDirection(forward);
  controls.getObject().position.addScaledVector(forward, -e.deltaY * moveFactor);
}

function onMiddleMouseDown(e) {
  if (e.button === 1 && splineGroup) { // Mittlere Maustaste
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
  if (isDraggingRoute && splineGroup) {
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
}

// --- Window Resize Handler ---

function onWindowResize() {
  if (camera && domElement) {
    camera.aspect = window.innerWidth / window.innerHeight;
    camera.updateProjectionMatrix();
    // Der Renderer selbst wird in main.js verwaltet.
  }
}
