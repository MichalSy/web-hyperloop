// SplineGraph.js
import * as THREE from 'three';
import { GameObject } from './GameObject.js';
import { GameObjectManager } from './GameObjectManager.js';
import { Player } from './Player.js';
import GameEngine from './GameEngine.js';

/**
 * Hilfsfunktion: Prüft, ob candidate zu nahe an einem der Punkte in points (außer dem letzten) liegt.
 */
function collides(candidate, points, roadWidth, buffer) {
  const threshold = roadWidth + buffer;
  for (let i = 0; i < points.length - 1; i++) {
    if (candidate.distanceTo(points[i]) < threshold) return true;
  }
  return false;
}

/**
 * Hilfsfunktion: Rotiert einen Vektor v um einen zufälligen Winkel (±maxAngle) 
 * um eine zufällig ausgewählte Achse, die senkrecht zu v steht.
 */
function randomRotate(v, maxAngle, prevDirection = null) {
  // Hauptrotationsachse ist immer die Y-Achse (Vertikale)
  const upAxis = new THREE.Vector3(0, 1, 0);
  
  // Zufällige horizontale Rotation
  const horizontalAngle = (Math.random() * 2 - 1) * maxAngle;
  const horizontalQuat = new THREE.Quaternion().setFromAxisAngle(upAxis, horizontalAngle);
  
  // Begrenzte vertikale Rotation (nur 1/4 des maxAngle)
  const sideAxis = new THREE.Vector3(-v.z, 0, v.x).normalize();
  const verticalAngle = (Math.random() * 2 - 1) * (maxAngle * 0.25);
  const verticalQuat = new THREE.Quaternion().setFromAxisAngle(sideAxis, verticalAngle);
  
  // Kombiniere Rotationen
  let newDir = v.clone()
    .applyQuaternion(horizontalQuat)
    .applyQuaternion(verticalQuat)
    .normalize();
    
  // Wenn es eine vorherige Richtung gibt, interpoliere für Trägheit
  if (prevDirection) {
    newDir.lerp(prevDirection, 0.3).normalize();
  }
  
  return newDir;
}

/**
 * Generiert zufällige Punkte (bis zum vorletzten) für den Pfad.
 * Diese Punkte werden später geglättet.
 */
function generatePartialPoints(numPoints, maxAngle, biasAngle, minStep, maxStep, roadWidth, buffer) {
  const points = [];
  const start = new THREE.Vector3(0, 0, 0);
  points.push(start.clone());
  let current = start.clone();
  let direction = new THREE.Vector3(1, 0, 0).normalize();
  const finalCount = numPoints - 1; // Letzter Punkt wird separat erzeugt
  const maxAttempts = 10;
  
  for (let i = 1; i < finalCount; i++) {
    let candidate, attempts = 0;
    let newDir;
    if (i < finalCount / 2) {
      newDir = randomRotate(direction, maxAngle, direction);
    } else {
      const toStart = start.clone().sub(current).normalize();
      // Erhöhe den Einfluss der aktuellen Richtung für smoothere Übergänge
      newDir = direction.clone().multiplyScalar(0.8).add(toStart.multiplyScalar(0.2)).normalize();
      newDir = randomRotate(newDir, biasAngle, direction);
    }
    do {
      const step = THREE.MathUtils.lerp(minStep, maxStep, Math.random());
      candidate = current.clone().add(newDir.clone().multiplyScalar(step));
      attempts++;
    } while (collides(candidate, points, roadWidth, buffer) && attempts < maxAttempts);
    current = candidate.clone();
    points.push(current.clone());
    direction = current.clone().sub(points[points.length - 2]).normalize();
  }
  return points;
}

/**
 * Fügt am Ende einen kurzen, geraden Approach hinzu:
 * Vom letzten generierten Punkt wird ein gerader Abschnitt von approachLength Einheiten in Richtung Start erzeugt.
 * Anschließend wird der Startpunkt wieder angehängt.
 */
function addShortApproach(points, approachLength) {
  const start = points[0];
  const last = points[points.length - 1];
  const dir = start.clone().sub(last).normalize();
  const approachEnd = last.clone().add(dir.multiplyScalar(approachLength));
  points.push(approachEnd);
  points.push(start.clone());
}

/**
 * Glättet die Punktliste mittels Moving Average.
 */
function smoothPoints(points, windowSize = 3) {
  const smoothed = [];
  for (let i = 0; i < points.length; i++) {
    const st = Math.max(0, i - Math.floor(windowSize / 2));
    const en = Math.min(points.length, i + Math.floor(windowSize / 2) + 1);
    const avg = new THREE.Vector3(0, 0, 0);
    for (let j = st; j < en; j++) {
      avg.add(points[j]);
    }
    avg.divideScalar(en - st);
    smoothed.push(avg);
  }
  return smoothed;
}

/**
 * Berechnet die Gesamtlänge eines Splines und gibt ein Array mit kumulierten Distanzen zurück.
 */
function approximateLengthAndDistances(curve, segments) {
  const spaced = curve.getSpacedPoints(segments);
  let totalDist = 0;
  const distArray = [0];
  for (let i = 1; i < spaced.length; i++) {
    const d = spaced[i].distanceTo(spaced[i - 1]);
    totalDist += d;
    distArray.push(totalDist);
  }
  return { distArray, totalDist };
}

/**
 * Erzeugt eine Geometrie für das dicke Streckenband mit dynamischem UV‑Mapping.
 * Zusätzlich werden die letzten whiteRegion Einheiten (z. B. 5) mittels Vertex-Farben auf Weiß gesetzt.
 */
function createColoredTrackGeometry(curve, segments, roadWidth, thickness, whiteRegion = 5) {
  const closed = true;
  const frames = curve.computeFrenetFrames(segments, closed);
  const spaced = curve.getSpacedPoints(segments);
  const { distArray, totalDist } = approximateLengthAndDistances(curve, segments);
  
  const positions = [];
  const colors = [];
  const indices = [];
  const uvs = [];
  
  const halfW = roadWidth * 0.5;
  const halfT = thickness * 0.5;
  const unitsPerRepeat = 10;
  
  for (let i = 0; i <= segments; i++) {
    const iFrame = (i < segments) ? i : 0;
    const t = i / segments;
    const center = curve.getPointAt(t);
    const tangent = frames.tangents[iFrame];
    const normal = frames.normals[iFrame];
    const binorm = frames.binormals[iFrame];
  
    const dist = distArray[iFrame] || 0;
    const uvY = dist / unitsPerRepeat;
  
    const TL = center.clone().addScaledVector(normal, -halfW).addScaledVector(binorm, halfT);
    const TR = center.clone().addScaledVector(normal, halfW).addScaledVector(binorm, halfT);
    const BL = center.clone().addScaledVector(normal, -halfW).addScaledVector(binorm, -halfT);
    const BR = center.clone().addScaledVector(normal, halfW).addScaledVector(binorm, -halfT);
  
    const baseIndex = i * 4;
    positions.push(TL.x, TL.y, TL.z);
    positions.push(TR.x, TR.y, TR.z);
    positions.push(BL.x, BL.y, BL.z);
    positions.push(BR.x, BR.y, BR.z);
  
    uvs.push(0, uvY);
    uvs.push(1, uvY);
    uvs.push(0, uvY);
    uvs.push(1, uvY);
  
    // Setze Vertex-Farben: Falls im letzten whiteRegion-Bereich, vollständig weiß.
    const colorVal = (dist >= totalDist - whiteRegion) ? 1000.0 : 1.0;
    for (let j = 0; j < 4; j++) {
      colors.push(colorVal, colorVal, colorVal);
    }
  }
  
  function pushQuad(a, b, c, d) {
    indices.push(a, b, c);
    indices.push(a, c, d);
  }
  
  for (let i = 0; i < segments; i++) {
    const iBase = i * 4;
    const jBase = ((i + 1) % (segments + 1)) * 4;
    pushQuad(iBase + 0, iBase + 1, jBase + 1, jBase + 0);
    pushQuad(iBase + 2, iBase + 3, jBase + 3, jBase + 2);
    pushQuad(iBase + 0, iBase + 2, jBase + 2, jBase + 0);
    pushQuad(iBase + 1, iBase + 3, jBase + 3, jBase + 1);
  }
  
  const geometry = new THREE.BufferGeometry();
  geometry.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
  geometry.setIndex(indices);
  geometry.computeVertexNormals();
  return geometry;
}

/**
 * Debug: Erzeugt für jeden Punkt im Array eine kleine Kugel und fügt sie der Szene hinzu.
 */
function createDebugSpheres(scene, points, color = 0xff0000) {
  const sphereGeom = new THREE.SphereGeometry(0.5, 8, 8);
  const sphereMat = new THREE.MeshBasicMaterial({ color });
  for (let i = 0; i < points.length; i++) {
    const sphere = new THREE.Mesh(sphereGeom, sphereMat);
    sphere.position.copy(points[i]);
    scene.add(sphere);
  }
}

/**
 * Erzeugt die gesamte Strecke als Mesh (mit Vertex-Farben für den weißen Bereich am Ende).
 */
function createTrackGeometry(curve, segments, roadWidth, thickness) {
  return createColoredTrackGeometry(curve, segments, roadWidth, thickness, 5);
}

export class SplineGraph extends GameObject {
  constructor() {
    super();
    this.trackGroup = null;
    this.startPointCoord = new THREE.Vector3(0, 0, 0);
    this.MIN_FAR = 1500;
  }
  
  /**
   * Erzeugt einen geschlossenen Pfad.
   * Es wird mit festen Punkten begonnen: p1 = (5,0,0) und pN = (-5,0,0).
   * Der Pfad zwischen p1 und pN wird zufällig generiert, dann wird pN -> p1 als Gerade hinzugefügt.
   */
  createClosedCurve(numPoints = 30) {
    // Feste Punkte:
    const pStart = new THREE.Vector3(500, 0, 0);
    const pEnd   = new THREE.Vector3(-500, 0, 0);
    // Generiere zufällige Punkte zwischen pStart und pEnd:
    const rawPoints = generatePointsBetween(pStart, pEnd, numPoints, 
      THREE.MathUtils.degToRad(70), THREE.MathUtils.degToRad(40), 30, 60, 12, 5);
    // Füge den finalen Ansatz hinzu: Gehe 5 Einheiten vom letzten Punkt in Richtung pStart.
    addShortApproach(rawPoints, 5);
    const smoothPts = smoothPoints(rawPoints, 5);
    return new THREE.CatmullRomCurve3(smoothPts, true, 'centripetal');
  }
  
  /**
   * Erzeugt die Track-Group (Strecke + Startlinie).
   */
  create3DTrackGroup(numPoints, segments, roadWidth, thickness) {
    const curve = this.createClosedCurve(numPoints);
    const geometry = createTrackGeometry(curve, segments, roadWidth, thickness);
    const textureLoader = new THREE.TextureLoader();
    const rainbowTexture = textureLoader.load('img/rainbow.jpg');
    rainbowTexture.wrapS = THREE.RepeatWrapping;
    rainbowTexture.wrapT = THREE.RepeatWrapping;
    const roadMaterial = new THREE.MeshBasicMaterial({
      map: rainbowTexture,
      vertexColors: true,
      side: THREE.DoubleSide
    });
    const roadMesh = new THREE.Mesh(geometry, roadMaterial);
  
    const group = new THREE.Group();
    group.add(roadMesh);
  
    // Debug: Erzeuge Spheres für die Spline-Sample-Punkte und füge sie der Szene hinzu
    const debugPoints = curve.getSpacedPoints(100);
    createDebugSpheres(GameEngine.getInstance().getScene(), debugPoints, 0x00ff00);
  
    return group;
  }
  
  adjustCameraToFitTrack(trackGroup) {
    const box = new THREE.Box3().setFromObject(trackGroup);
    const sphere = new THREE.Sphere();
    box.getBoundingSphere(sphere);
    const center = sphere.center;
    const radius = sphere.radius;
    const player = GameObjectManager.getInstance().getObjectByType(Player);
    const camera = this.gameEngine.getCamera();
    const fov = THREE.MathUtils.degToRad(camera.fov);
    const margin = 1.2;
    const distance = (radius * margin) / Math.sin(fov / 2);
    // Setze den Spieler am Start (0,0,0) und schaue in Richtung +X
    player.getControls().getObject().position.set(0, 0, 0);
    camera.far = Math.max(distance * 3, this.MIN_FAR);
    camera.updateProjectionMatrix();
    camera.lookAt(new THREE.Vector3(1, 0, 0));
  }
  
  updateSpline(numPoints, segments, roadWidth, thickness, seed) {
    // Falls seed benötigt wird, setze ihn hier.
    // this.setSeed(seed);
    const gameEngine = GameEngine.getInstance();
    const scene = gameEngine.getScene();
    if (this.trackGroup) {
      scene.remove(this.trackGroup);
    }
    this.trackGroup = this.create3DTrackGroup(numPoints, segments, roadWidth, thickness);
    scene.add(this.trackGroup);
    const player = GameObjectManager.getInstance().getObjectByType(Player);
    player.setInputSplineGroup(this.trackGroup);
    this.adjustCameraToFitTrack(this.trackGroup);
    return this.trackGroup;
  }
  
  getStartPointCoord() {
    return this.startPointCoord;
  }
  
  update(deltaTime) {
    // Per-frame updates, falls nötig
  }
}

/**
 * Generiert zufällige Punkte zwischen pStart und pEnd.
 */
function generatePointsBetween(pStart, pEnd, numPoints, maxAngle, biasAngle, minStep, maxStep, roadWidth, buffer) {
  const points = [];
  points.push(pStart.clone());
  let current = pStart.clone();
  let direction = pEnd.clone().sub(pStart).normalize();
  const maxAttempts = 10;
  const finalCount = numPoints - 2; // pStart und pEnd kommen fix
  for (let i = 1; i < finalCount; i++) {
    let candidate, attempts = 0;
    let newDir;
    if (i < finalCount / 2) {
      newDir = randomRotate(direction, maxAngle, direction);
    } else {
      const toEnd = pEnd.clone().sub(current).normalize();
      // Erhöhe den Einfluss der aktuellen Richtung für smoothere Übergänge
      newDir = direction.clone().multiplyScalar(0.8).add(toEnd.multiplyScalar(0.2)).normalize();
      newDir = randomRotate(newDir, biasAngle, direction);
    }
    do {
      const step = THREE.MathUtils.lerp(minStep, maxStep, Math.random());
      candidate = current.clone().add(newDir.clone().multiplyScalar(step));
      attempts++;
    } while (collides(candidate, points, roadWidth, buffer) && attempts < maxAttempts);
    current = candidate.clone();
    points.push(current.clone());
    direction = current.clone().sub(points[points.length - 2]).normalize();
  }
  return points;
}
