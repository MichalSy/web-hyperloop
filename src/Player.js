// Player.js
import * as THREE from 'three';
import { GameObject } from './GameObject.js';

export class Player extends GameObject {
  constructor(camera, controls, domElement, moveSpeed = 100) {
    super();
    this.camera = camera;
    this.controls = controls;
    this.moveSpeed = moveSpeed;
    this.domElement = domElement;

    // Interne Zustandsvariablen für Eingaben
    this.keys = {};
    this.mouseButtons = {
      left: false,
      middle: false,
      right: false
    };

    // Event-Handler als Arrow-Funktionen, damit 'this' korrekt gebunden ist
    this.keyDownHandler = (e) => {
      this.keys[e.code] = true;
    };
    this.keyUpHandler = (e) => {
      this.keys[e.code] = false;
    };
    this.mouseDownHandler = (e) => {
      if (e.button === 0) {
        this.mouseButtons.left = true;
      } else if (e.button === 1) {
        this.mouseButtons.middle = true;
        this.onMiddleMouseDown(e);
      } else if (e.button === 2) {
        this.mouseButtons.right = true;
        this.onRightMouseDown(e);
      }
    };
    this.mouseUpHandler = (e) => {
      if (e.button === 0) {
        this.mouseButtons.left = false;
      } else if (e.button === 1) {
        this.mouseButtons.middle = false;
        this.onMiddleMouseUp(e);
      } else if (e.button === 2) {
        this.mouseButtons.right = false;
        this.onRightMouseUp(e);
      }
    };
    this.mouseMoveHandler = (e) => {
      this.onMouseMove(e);
    };
    this.wheelHandler = (e) => {
      this.onWheel(e);
    };
    this.contextMenuHandler = (e) => e.preventDefault();
    this.windowResizeHandler = () => this.onWindowResize();

    // Registriere die Event Listener global
    this.domElement.addEventListener('mousedown', this.mouseDownHandler);
    this.domElement.addEventListener('mouseup', this.mouseUpHandler);
    this.domElement.addEventListener('mousemove', this.mouseMoveHandler);
    this.domElement.addEventListener('wheel', this.wheelHandler, { passive: false });
    window.addEventListener('keydown', this.keyDownHandler);
    window.addEventListener('keyup', this.keyUpHandler);
    window.addEventListener('contextmenu', this.contextMenuHandler);
    window.addEventListener('resize', this.windowResizeHandler, false);

    // Zusätzliche Variablen für das Draggen der Spline-Route
    this.raycaster = new THREE.Raycaster();
    this.dragPlane = new THREE.Plane();
    this.dragStartPoint = new THREE.Vector3();
    this.routeInitialPosition = new THREE.Vector3();
    this.isDraggingRoute = false;
    this.splineGroup = null;
  }

  update(deltaTime) {
    if (this.controls.isLocked) {
      // WASD-Bewegung
      const forward = new THREE.Vector3();
      this.camera.getWorldDirection(forward);
      const horizontalForward = forward.clone();
      horizontalForward.y = 0;
      horizontalForward.normalize();
      const up = new THREE.Vector3(0, 1, 0);
      const right = new THREE.Vector3().crossVectors(horizontalForward, up).normalize();

      if (this.keys['KeyW']) {
        this.controls.getObject().position.addScaledVector(horizontalForward, this.moveSpeed * deltaTime);
      }
      if (this.keys['KeyS']) {
        this.controls.getObject().position.addScaledVector(horizontalForward, -this.moveSpeed * deltaTime);
      }
      if (this.keys['KeyA']) {
        this.controls.getObject().position.addScaledVector(right, -this.moveSpeed * deltaTime);
      }
      if (this.keys['KeyD']) {
        this.controls.getObject().position.addScaledVector(right, this.moveSpeed * deltaTime);
      }
      
      // Beispielhafte Verwendung der Maussteuerung
      if (this.mouseButtons.right) {
        // Logik für Rechtsklick (z. B. alternative Blickrichtung oder Aktion)
        console.log('Rechter Mausklick aktiv');
      }
      if (this.mouseButtons.middle) {
        // Logik für Mittelklick (z. B. Wechsel der Kameraperspektive)
        console.log('Mittlerer Mausklick aktiv');
      }
      if (this.mouseButtons.left) {
        // Logik für Linksklick (falls benötigt, z. B. interaktive Aktionen)
        // Bei PointerLock wird der Linksklick häufig zur Aktivierung genutzt.
      }
    }
  }

  // --- Mouse Event Handler ---
  onWheel(e) {
    e.preventDefault();
    const moveFactor = 0.3;
    const forward = new THREE.Vector3();
    this.camera.getWorldDirection(forward);
    this.controls.getObject().position.addScaledVector(forward, -e.deltaY * moveFactor);
  }

  onMiddleMouseDown(e) {
    if (e.button === 1 && this.splineGroup) { // Mittlere Maustaste
      this.isDraggingRoute = true;
      const mouse = new THREE.Vector2(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );
      this.raycaster.setFromCamera(mouse, this.camera);
      const camDir = new THREE.Vector3();
      this.camera.getWorldDirection(camDir);
      this.dragPlane.setFromNormalAndCoplanarPoint(camDir, this.splineGroup.position);
      this.raycaster.ray.intersectPlane(this.dragPlane, this.dragStartPoint);
      this.routeInitialPosition.copy(this.splineGroup.position);
      e.preventDefault();
    }
  }

  onMiddleMouseMove(e) {
    if (this.isDraggingRoute && this.splineGroup) {
      const mouse = new THREE.Vector2(
        (e.clientX / window.innerWidth) * 2 - 1,
        -(e.clientY / window.innerHeight) * 2 + 1
      );
      this.raycaster.setFromCamera(mouse, this.camera);
      const newIntersection = new THREE.Vector3();
      this.raycaster.ray.intersectPlane(this.dragPlane, newIntersection);
      if (newIntersection) {
        const delta = new THREE.Vector3().subVectors(newIntersection, this.dragStartPoint);
        this.splineGroup.position.copy(this.routeInitialPosition.clone().add(delta));
      }
      e.preventDefault();
    }
  }

  onMiddleMouseUp(e) {
    if (e.button === 1) {
      this.isDraggingRoute = false;
      e.preventDefault();
    }
  }

  onRightMouseDown(e) {
    if (e.button === 2) { // Rechte Maustaste
      this.controls.lock();
      e.preventDefault();
    }
  }

  onRightMouseUp(e) {
    if (e.button === 2) {
      this.controls.unlock();
      e.preventDefault();
    }
  }

  onMouseDown(e) {
    if (e.button === 1) {
      this.onMiddleMouseDown(e);
    } else if (e.button === 2) {
      this.onRightMouseDown(e);
    }
  }

  onMouseUp(e) {
    if (e.button === 1) {
      this.onMiddleMouseUp(e);
    } else if (e.button === 2) {
      this.onRightMouseUp(e);
    }
  }

  onMouseMove(e) {
    if (this.isDraggingRoute) {
      this.onMiddleMouseMove(e);
    }
  }

  // --- Window Resize Handler ---
  onWindowResize() {
    if (this.camera && this.domElement) {
      this.camera.aspect = window.innerWidth / window.innerHeight;
      this.camera.updateProjectionMatrix();
      // Der Renderer selbst wird in main.js verwaltet.
    }
  }

  // Optionale Methode zum Entfernen der Event Listener, falls der Player zerstört wird
  dispose() {
    this.domElement.removeEventListener('mousedown', this.mouseDownHandler);
    this.domElement.removeEventListener('mouseup', this.mouseUpHandler);
    this.domElement.removeEventListener('mousemove', this.mouseMoveHandler);
    this.domElement.removeEventListener('wheel', this.wheelHandler);
    window.removeEventListener('keydown', this.keyDownHandler);
    window.removeEventListener('keyup', this.keyUpHandler);
    window.removeEventListener('contextmenu', this.contextMenuHandler);
    window.removeEventListener('resize', this.windowResizeHandler);
  }

  setInputSplineGroup(group) {
    this.splineGroup = group;
  }
}
