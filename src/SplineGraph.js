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
 * Vermeidet extreme Rotationen, die zu unrealistischen Kurven führen würden.
 */
function randomRotate(v, maxAngle, prevDirection = null) {
  // Hauptrotationsachse ist immer die Y-Achse (Vertikale)
  const upAxis = new THREE.Vector3(0, 1, 0);
  
  // Reduzierter Winkel für kontrollierte Rotationen
  const safeMaxAngle = maxAngle * 0.6;
  
  // Zufällige horizontale Rotation
  const horizontalAngle = (Math.random() * 2 - 1) * safeMaxAngle;
  const horizontalQuat = new THREE.Quaternion().setFromAxisAngle(upAxis, horizontalAngle);
  
  // Stark begrenzte vertikale Rotation (nur 1/5 des safeMaxAngle)
  const sideAxis = new THREE.Vector3(-v.z, 0, v.x).normalize();
  const verticalAngle = (Math.random() * 2 - 1) * (safeMaxAngle * 0.2);
  const verticalQuat = new THREE.Quaternion().setFromAxisAngle(sideAxis, verticalAngle);
  
  // Kombiniere Rotationen
  let newDir = v.clone()
    .applyQuaternion(horizontalQuat)
    .applyQuaternion(verticalQuat)
    .normalize();
    
  // Wenn es eine vorherige Richtung gibt, stärker interpolieren für mehr Trägheit
  if (prevDirection) {
    newDir.lerp(prevDirection, 0.5).normalize();
  }
  
  return newDir;
}

/**
 * Generiert zufällige Punkte (bis zum vorletzten) für den Pfad.
 * Diese Punkte werden später geglättet.
 * Verwendet einen zweistufigen Ansatz: Hauptcheckpoints und Interpolation.
 */
function generatePartialPoints(numPoints, maxAngle, biasAngle, minStep, maxStep, roadWidth, buffer) {
  // Wir erzeugen weniger, aber strategisch platzierte Hauptcheckpoints
  const numCheckpoints = Math.max(4, Math.ceil(numPoints / 4));
  const checkpoints = [];
  
  // Start hinzufügen
  const start = new THREE.Vector3(0, 0, 0);
  checkpoints.push(start.clone());
  
  // Globale Richtung (wird während der Generierung angepasst)
  const globalDirection = new THREE.Vector3(1, 0, 0).normalize();
  
  let current = start.clone();
  let direction = globalDirection.clone();
  const maxAttempts = 15; // Erhöhte Versuche für bessere Lösungen
  
  for (let i = 1; i < numCheckpoints - 1; i++) {
    let candidate, attempts = 0;
    let newDir;
    
    // Adaptiere die maximale Rotation je nach Position
    // In der ersten Hälfte mehr Freiheit, dann zunehmende Einschränkung
    const positionFactor = i / (numCheckpoints - 1);
    const adaptedMaxAngle = maxAngle * (1.0 - positionFactor * 0.5);
    const adaptedBiasAngle = biasAngle * (1.0 - positionFactor * 0.5);
    
    if (i < numCheckpoints / 2) {
      // In der ersten Hälfte: Mehr Freiheit, aber immer noch kontrolliert
      newDir = randomRotate(direction, adaptedMaxAngle, direction);
    } else {
      // In der zweiten Hälfte: Stärkere Tendenz zurück zum Start
      const toStart = start.clone().sub(current).normalize();
      
      // Mischung aus aktueller Richtung und Richtung zum Start
      // Mit zunehmendem i wächst der Einfluss der Richtung zum Start
      const backBias = Math.pow(positionFactor, 2) * 0.6; // Quadratische Zunahme für sanfteren Übergang
      newDir = direction.clone();
      newDir.lerp(toStart, backBias).normalize();
      
      // Kleine zufällige Abweichung, aber stark kontrolliert
      newDir = randomRotate(newDir, adaptedBiasAngle * 0.6, direction);
    }
    
    // Prüfe, ob die Richtungsänderung nicht zu abrupt ist
    const angleChange = direction.angleTo(newDir);
    if (angleChange > maxAngle * 0.7) {
      // Bei zu großer Änderung: Interpoliere zur vorherigen Richtung
      newDir.lerp(direction, 0.7).normalize();
    }
    
    do {
      // Größere Abstände zwischen Checkpoints für sanftere Kurven
      const step = THREE.MathUtils.lerp(minStep * 2, maxStep * 2, Math.random());
      candidate = current.clone().add(newDir.clone().multiplyScalar(step));
      attempts++;
      
      // Bei zu vielen Versuchen, passe die Richtung an
      if (attempts > maxAttempts / 2) {
        // Versuche, mit einer Richtung näher am globalen Trend
        newDir = globalDirection.clone();
        newDir = randomRotate(newDir, adaptedMaxAngle * 0.3, direction);
      }
      
    } while (collides(candidate, checkpoints, roadWidth * 1.5, buffer * 1.5) && attempts < maxAttempts);
    
    if (attempts >= maxAttempts) {
      // Fallback: Erzeuge einen Punkt in moderater Entfernung in aktuelle Richtung
      const safeStep = minStep * 2.5;
      candidate = current.clone().add(direction.clone().multiplyScalar(safeStep));
    }
    
    current = candidate.clone();
    checkpoints.push(current.clone());
    
    // Aktualisiere Richtung und globale Richtung
    const prevPoint = checkpoints[checkpoints.length - 2];
    direction = current.clone().sub(prevPoint).normalize();
    
    // Aktualisiere die globale Richtung (als gleitender Durchschnitt)
    globalDirection.lerp(direction, 0.3).normalize();
  }
  
  // Füge den letzten Checkpoint hinzu (der eigentlich der erste ist, da wir einen Ring bauen)
  // Stelle sicher, dass wir sanft zum Start zurückkehren
  const toStart = start.clone().sub(current).normalize();
  let finalDir = direction.clone().lerp(toStart, 0.7).normalize();
  
  // Sanftere Rückkehr: Interpoliere über mehrere Zwischenpunkte
  const numFinalPoints = 3; // Anzahl der Punkte für den finalen Ansatz
  const finalStep = current.distanceTo(start) / (numFinalPoints + 1);
  
  for (let i = 0; i < numFinalPoints; i++) {
    const t = (i + 1) / (numFinalPoints + 1);
    const interpolatedDir = direction.clone().lerp(toStart, t * 0.8 + 0.2).normalize();
    const point = current.clone().add(interpolatedDir.multiplyScalar(finalStep));
    checkpoints.push(point);
    current = point;
  }
  
  checkpoints.push(start.clone());
  
  // Interpoliere die endgültigen Punkte durch eine temporäre Spline
  const tempCurve = new THREE.CatmullRomCurve3(checkpoints, true, 'centripetal');
  const points = [];
  
  for (let i = 0; i < numPoints; i++) {
    const t = i / numPoints;
    points.push(tempCurve.getPointAt(t));
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
 * Verbesserte Version mit mehreren Durchgängen für extra glattes Ergebnis.
 */
function smoothPoints(points, windowSize = 3, iterations = 2) {
  let currentPoints = [...points];
  
  for (let iteration = 0; iteration < iterations; iteration++) {
    const smoothed = [];
    
    for (let i = 0; i < currentPoints.length; i++) {
      // Bei geschlossenem Pfad: Spezielle Behandlung der Randpunkte
      const isClosed = currentPoints[0].distanceTo(currentPoints[currentPoints.length - 1]) < 0.001;
      
      let st, en;
      if (isClosed) {
        // Bei geschlossenem Pfad: Zyklische Indizierung
        const halfWindow = Math.floor(windowSize / 2);
        st = (i - halfWindow + currentPoints.length) % currentPoints.length;
        en = (i + halfWindow + 1) % currentPoints.length;
        if (en <= st) en += currentPoints.length; // Für korrekte Bereichsiteration
      } else {
        // Bei offenem Pfad: Begrenzung auf gültigen Bereich
        st = Math.max(0, i - Math.floor(windowSize / 2));
        en = Math.min(currentPoints.length, i + Math.floor(windowSize / 2) + 1);
      }
      
      // Gewichtetes Mittel berechnen (Punkte in der Mitte haben mehr Gewicht)
      const avg = new THREE.Vector3(0, 0, 0);
      let totalWeight = 0;
      
      for (let j = st; j < (isClosed ? en : Math.min(en, currentPoints.length)); j++) {
        const idx = isClosed ? j % currentPoints.length : j;
        // Gaußsches Gewicht: Punkte in der Mitte haben mehr Einfluss
        const distFromCenter = Math.abs(idx - i);
        const weight = Math.exp(-distFromCenter * distFromCenter / (windowSize * 0.25));
        avg.add(currentPoints[idx].clone().multiplyScalar(weight));
        totalWeight += weight;
      }
      
      avg.divideScalar(totalWeight);
      smoothed.push(avg);
    }
    
    currentPoints = smoothed;
  }
  
  return currentPoints;
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
 * Berechnet die Krümmung an jedem Punkt der Kurve und identifiziert Stellen mit starken Rotationen.
 * Höhere Werte bedeuten schärfere Kurven. Verhindert auch 180°-Rotationen.
 */
function calculateCurvatures(curve, frames, segments) {
  const curvatures = [];
  const rotationFlags = []; // Flags zur Identifizierung starker Rotationen
  
  // Erste Berechnung: Identifiziere problematische Rotationen und Krümmungswerte
  for (let i = 0; i < segments; i++) {
    const nextIdx = (i + 1) % segments;
    const prevIdx = (i - 1 + segments) % segments;
    
    const currentTangent = frames.tangents[i];
    const nextTangent = frames.tangents[nextIdx];
    const prevTangent = frames.tangents[prevIdx];
    
    // Winkeländerung zum nächsten Punkt
    const angleNext = currentTangent.angleTo(nextTangent);
    // Winkeländerung zum vorherigen Punkt
    const anglePrev = currentTangent.angleTo(prevTangent);
    
    // Identifiziere starke Rotationen (nahe 180°)
    const isSharpTurn = angleNext > Math.PI * 0.75 || anglePrev > Math.PI * 0.75;
    rotationFlags.push(isSharpTurn);
    
    // Durchschnittliche Winkeländerung als Maß für die Krümmung, mit Begrenzung
    // Dies verhindert extreme Werte bei starken Rotationen
    const rawCurvature = (angleNext + anglePrev) / 2;
    // Begrenze die Krümmung auf einen vernünftigen Bereich
    const curvature = Math.min(rawCurvature, Math.PI * 0.4);
    curvatures.push(curvature);
  }
  
  // Zweite Berechnung: Glättung der Krümmungswerte und Behandlung problematischer Rotationen
  const smoothedCurvatures = [];
  for (let i = 0; i < segments; i++) {
    const prevIdx = (i - 1 + segments) % segments;
    const nextIdx = (i + 1) % segments;
    
    // Wenn ein problematischer Bereich gefunden wurde, erstelle einen sanften Übergang
    if (rotationFlags[i] || rotationFlags[prevIdx] || rotationFlags[nextIdx]) {
      // Setze eine moderate Krümmung für problematische Bereiche
      smoothedCurvatures.push(Math.PI * 0.3);
    } else {
      // Berechne gleitenden Durchschnitt für normale Bereiche
      const smoothValue = (curvatures[prevIdx] + curvatures[i] + curvatures[nextIdx]) / 3;
      smoothedCurvatures.push(smoothValue);
    }
  }
  
  // Füge einen Eintrag für den letzten Punkt hinzu (für geschlossene Kurven)
  smoothedCurvatures.push(smoothedCurvatures[0]);
  
  return smoothedCurvatures;
}

/**
 * Erzeugt eine Geometrie für das dicke Streckenband mit dynamischem UV‑Mapping.
 * Zusätzlich werden die letzten whiteRegion Einheiten (z. B. 5) mittels Vertex-Farben auf Weiß gesetzt.
 * Bei Kurven wird die Streckenbreite automatisch angepasst, um gleichbleibende Fahrbarkeit zu gewährleisten.
 */
function createColoredTrackGeometry(curve, segments, roadWidth, thickness, whiteRegion = 5) {
  const closed = true;
  const frames = curve.computeFrenetFrames(segments, closed);
  const spaced = curve.getSpacedPoints(segments);
  const { distArray, totalDist } = approximateLengthAndDistances(curve, segments);
  
  // Berechne die Krümmung an jedem Punkt, um später die Streckenbreite anzupassen
  const curvatures = calculateCurvatures(curve, frames, segments);
  
  const positions = [];
  const colors = [];
  const indices = [];
  const uvs = [];
  
  const baseHalfW = roadWidth * 0.5;
  const halfT = thickness * 1.5; // Höhere Seitenwände für bessere Sichtbarkeit
  const unitsPerRepeat = 10;
  
  // Identifiziere die Seite, die immer befahrbar sein soll (rechte Seite relativ zur Fahrtrichtung)
  const befahrbareSeite = 1; // 1 = rechts, -1 = links
  
  for (let i = 0; i <= segments; i++) {
    const iFrame = (i < segments) ? i : 0;
    const t = i / segments;
    const center = curve.getPointAt(t);
    const tangent = frames.tangents[iFrame];
    const normal = frames.normals[iFrame];
    const binorm = frames.binormals[iFrame];
    
    // Passe die Streckenbreite basierend auf der Kurvenkrümmung an
    const curvature = curvatures[iFrame];
    // Höherer Faktor für breitere Strecken in Kurven, bis zu 2x so breit
    const widthFactor = Math.min(2.0, 1.0 + curvature * 3.0);
    
    // Asymmetrische Anpassung: Eine Seite (die befahrbare) erhält mehr Platz
    let leftAdjustment, rightAdjustment;
    if (befahrbareSeite > 0) {
      // Rechte Seite ist die befahrbare Seite
      leftAdjustment = baseHalfW * (1.0 + (widthFactor - 1.0) * 0.3); // Weniger Anpassung auf der linken Seite
      rightAdjustment = baseHalfW * widthFactor; // Volle Anpassung auf der rechten Seite
    } else {
      // Linke Seite ist die befahrbare Seite
      leftAdjustment = baseHalfW * widthFactor; // Volle Anpassung auf der linken Seite
      rightAdjustment = baseHalfW * (1.0 + (widthFactor - 1.0) * 0.3); // Weniger Anpassung auf der rechten Seite
    }
  
    const dist = distArray[iFrame] || 0;
    const uvY = dist / unitsPerRepeat;
  
    // Erzeuge die Eckpunkte mit angepasster Breite und mehr Abstand von der Fahrbahn
    // Die Oberfläche (Top) ist die Fahrbahn, die Seitenwände stehen jetzt weiter außen
    
    // Top-Links und Top-Rechts (Fahrbahn)
    const TL = center.clone().addScaledVector(normal, -leftAdjustment);
    const TR = center.clone().addScaledVector(normal, rightAdjustment);
    
    // Innere Punkte für die Seitenwände (etwas nach außen versetzt)
    const sideOffset = 0.5; // Abstand zwischen Fahrbahn und Seitenwand
    
    // Seitenwände links
    const WTL = TL.clone().addScaledVector(normal, -sideOffset); // Oberkante Seitenwand links
    const WBL = WTL.clone().addScaledVector(binorm, -halfT); // Unterkante Seitenwand links
    
    // Seitenwände rechts
    const WTR = TR.clone().addScaledVector(normal, sideOffset); // Oberkante Seitenwand rechts
    const WBR = WTR.clone().addScaledVector(binorm, -halfT); // Unterkante Seitenwand rechts
    
    // Speichere die Positionen - erst die Fahrbahn, dann die Seitenwände
    // Fahrbahn
    positions.push(TL.x, TL.y, TL.z); // 0: Top-Left
    positions.push(TR.x, TR.y, TR.z); // 1: Top-Right
    
    // Seitenwand links
    positions.push(WTL.x, WTL.y, WTL.z); // 2: Wall-Top-Left
    positions.push(WBL.x, WBL.y, WBL.z); // 3: Wall-Bottom-Left
    
    // Seitenwand rechts
    positions.push(WTR.x, WTR.y, WTR.z); // 4: Wall-Top-Right
    positions.push(WBR.x, WBR.y, WBR.z); // 5: Wall-Bottom-Right
  
    // UVs für Texturierung
    uvs.push(0, uvY); // Fahrbahn links
    uvs.push(1, uvY); // Fahrbahn rechts
    
    uvs.push(0, uvY); // Seitenwand links oben
    uvs.push(0, uvY + 0.1); // Seitenwand links unten
    
    uvs.push(1, uvY); // Seitenwand rechts oben
    uvs.push(1, uvY + 0.1); // Seitenwand rechts unten
  
    // Vertex-Farben
    const colorVal = (dist >= totalDist - whiteRegion) ? 1000.0 : 1.0;
    for (let j = 0; j < 6; j++) { // 6 Punkte pro Segment
      colors.push(colorVal, colorVal, colorVal);
    }
  }
  
  // Indices für die Dreiecke - korrekte Reihenfolge für Sichtbarkeit der Oberflächen
  for (let i = 0; i < segments; i++) {
    const base = i * 6; // 6 Vertices pro Segment
    const nextBase = ((i + 1) % segments) * 6;
    
    // Fahrbahn (Top-Fläche)
    indices.push(base + 0, nextBase + 0, nextBase + 1); // TL -> next_TL -> next_TR
    indices.push(base + 0, nextBase + 1, base + 1);     // TL -> next_TR -> TR
    
    // Seitenwand links
    indices.push(base + 0, base + 2, nextBase + 2);     // TL -> WTL -> next_WTL
    indices.push(base + 0, nextBase + 2, nextBase + 0); // TL -> next_WTL -> next_TL
    indices.push(base + 2, base + 3, nextBase + 3);     // WTL -> WBL -> next_WBL
    indices.push(base + 2, nextBase + 3, nextBase + 2); // WTL -> next_WBL -> next_WTL
    
    // Seitenwand rechts
    indices.push(base + 1, nextBase + 1, nextBase + 4); // TR -> next_TR -> next_WTR
    indices.push(base + 1, nextBase + 4, base + 4);     // TR -> next_WTR -> WTR
    indices.push(base + 4, nextBase + 4, nextBase + 5); // WTR -> next_WTR -> next_WBR
    indices.push(base + 4, nextBase + 5, base + 5);     // WTR -> next_WBR -> WBR
    
    // Unterseite der Seitenwände (optional, wenn sichtbar sein soll)
    indices.push(base + 3, base + 5, nextBase + 5);     // WBL -> WBR -> next_WBR
    indices.push(base + 3, nextBase + 5, nextBase + 3); // WBL -> next_WBR -> next_WBL
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

/**
 * Überprüft die Kurve auf Probleme wie starke Wendungen, die zu Selbstüberschneidungen führen könnten.
 * Gibt true zurück, wenn die Kurve in Ordnung ist, sonst false.
 */
function validateCurve(curve, segments) {
  const points = curve.getSpacedPoints(segments);
  const threshold = Math.PI * 0.75; // ~135 Grad
  
  // Prüfe auf zu scharfe Winkel zwischen aufeinanderfolgenden Punkten
  for (let i = 1; i < points.length - 1; i++) {
    const prev = points[i - 1].clone().sub(points[i]);
    const next = points[i + 1].clone().sub(points[i]);
    const angle = prev.angleTo(next);
    
    if (angle > threshold) {
      console.warn('Zu scharfe Kurve erkannt bei Punkt', i);
      return false;
    }
  }
  
  return true;
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
    let attempts = 0;
    let curve;
    
    do {
      // Feste Punkte:
      const pStart = new THREE.Vector3(500, 0, 0);
      const pEnd   = new THREE.Vector3(-500, 0, 0);
      
      // Generiere Punkte für ein Oval als Ausgangsbasis - verbesserte Methode
      const rawPoints = generatePartialPoints(numPoints);
      
      // Füge zusätzliche Glättung hinzu - stärker als vorher
      const smoothPts = smoothPoints(rawPoints, 5, 3);
      
      curve = new THREE.CatmullRomCurve3(smoothPts, true, 'centripetal');
      attempts++;
    } while (!validateCurve(curve, 100) && attempts < 10); // Maximal 10 Versuche, um eine gültige Kurve zu generieren
    
    if (attempts >= 10) {
      console.warn('Konnte keine perfekte Kurve generieren, verwende beste Annäherung');
    }
    
    return curve;
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
 * Generiert Kontrollpunkte für die Strecke mit realistischen Rotationen
 * zwischen Wegpunkten, die als Checkpoints für spezielle Streckenbereiche
 * (z.B. Tunnel, Jumps) dienen können.
 */
function generatePointsBetween(pStart, pEnd, numPoints, maxAngle, biasAngle, minStep, maxStep, roadWidth, buffer) {
  const points = [];
  
  // Hilfsvektor, um Rotationen um die y-Achse zu beschränken
  const worldUp = new THREE.Vector3(0, 1, 0);
  
  // Erzeuge eine ovale Grundform als Basis
  const radius = 500;
  const verticalRadius = radius * 0.8;  // Leicht ovale Form
  
  for (let i = 0; i < numPoints; i++) {
    const angle = (i / numPoints) * Math.PI * 2;
    
    // Erzeuge einen Punkt auf einem Oval
    const x = Math.cos(angle) * radius;
    const z = Math.sin(angle) * verticalRadius;
    
    // Kleine Variation in der Höhe (y-Achse) für Hügel/Täler - sehr moderat
    const heightVariation = 20;
    const y = (Math.sin(angle * 3) * heightVariation) * (1 - Math.abs(Math.sin(angle))); // Flacher am Start/Ende
    
    // Füge zusätzliche Störung für natürlichere Form hinzu - sehr kontrolliert
    const noiseScale = 30;
    const noise = new THREE.Vector3(
      (Math.sin(angle * 2.1) + Math.cos(angle * 3.7)) * noiseScale,
      0,
      (Math.sin(angle * 3.3) + Math.cos(angle * 2.3)) * noiseScale
    );
    
    const point = new THREE.Vector3(x, y, z).add(noise);
    points.push(point);
  }
  
  return points;
}