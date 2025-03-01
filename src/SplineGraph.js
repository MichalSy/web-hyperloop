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
 * Prüft auf mögliche Selbstüberschneidungen bei der Kurve
 */
function checkSelfIntersection(newPoint, points, minDistance) {
  // Überprüfe nur Punkte, die nicht direkter Vorgänger oder Nachfolger sind
  for (let i = 0; i < points.length - 2; i++) {
    // Ignoriere die letzten beiden Punkte, da sie direkter Vorgänger sind
    if (i >= points.length - 2) continue;
    
    // Berechne den Abstand zwischen dem neuen Punkt und dem existierenden Punkt
    const distance = newPoint.distanceTo(points[i]);
    
    // Wenn der Abstand zu klein ist, gibt es ein Risiko für Überschneidung
    if (distance < minDistance) {
      return true;
    }
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
  
  // Mindestabstand zwischen Checkpoints
  const minCheckpointDistance = roadWidth * 5;
  
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
      // Vergrößerte und zufälligere Abstände zwischen Checkpoints für mehr Abwechslung
      // Aber Mindestabstand garantieren
      const step = Math.max(minCheckpointDistance, 
                          THREE.MathUtils.lerp(minStep * 3, maxStep * 3, Math.random()));
      
      candidate = current.clone().add(newDir.clone().multiplyScalar(step));
      attempts++;
      
      // Erhöhe Sicherheitsabstand zu vorherigen Punkten, um Überschneidungen zu vermeiden
      const hasCollision = collides(candidate, checkpoints, roadWidth * 3, buffer * 3);
      const hasSelfIntersection = checkSelfIntersection(candidate, checkpoints, roadWidth * 4);
      
      // Bei zu vielen Versuchen, passe die Richtung an
      if (attempts > maxAttempts / 2 && (hasCollision || hasSelfIntersection)) {
        // Versuche, mit einer Richtung näher am globalen Trend
        newDir = globalDirection.clone();
        newDir = randomRotate(newDir, adaptedMaxAngle * 0.3, direction);
      }
      
    } while ((collides(candidate, checkpoints, roadWidth * 3, buffer * 3) || 
              checkSelfIntersection(candidate, checkpoints, roadWidth * 4)) && 
             attempts < maxAttempts);
    
    if (attempts >= maxAttempts) {
      // Fallback: Erzeuge einen Punkt in einer sicheren Entfernung in Richtung des globalen Trends
      const safeStep = minCheckpointDistance * 1.5;
      candidate = current.clone().add(globalDirection.clone().multiplyScalar(safeStep));
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
    // Höherer Faktor für breitere Strecken in Kurven, bis zu 2.5x so breit auf der befahrbaren Seite
    const widthFactor = Math.min(2.5, 1.0 + curvature * 3.5);
    
    // Asymmetrische Anpassung: Eine Seite (die befahrbare) erhält deutlich mehr Platz
    let leftAdjustment, rightAdjustment;
    if (befahrbareSeite > 0) {
      // Rechte Seite ist die befahrbare Seite - sehr deutlicher Unterschied
      leftAdjustment = baseHalfW; // Linke Seite bleibt konstant
      rightAdjustment = baseHalfW * widthFactor; // Rechte Seite wird deutlich breiter in Kurven
    } else {
      // Linke Seite ist die befahrbare Seite
      leftAdjustment = baseHalfW * widthFactor; // Linke Seite wird deutlich breiter in Kurven
      rightAdjustment = baseHalfW; // Rechte Seite bleibt konstant
    }
  
    const dist = distArray[iFrame] || 0;
    const uvY = dist / unitsPerRepeat;
  
    // Erzeuge die Eckpunkte mit angepasster Breite und mehr Abstand von der Fahrbahn
    // Die Oberfläche (Top) ist die Fahrbahn, die Seitenwände stehen jetzt weiter außen
    
    // Top-Links und Top-Rechts (Fahrbahn)
    const TL = center.clone().addScaledVector(normal, -leftAdjustment);
    const TR = center.clone().addScaledVector(normal, rightAdjustment);
    
    // Innere Punkte für die Seitenwände (etwas nach außen versetzt)
    const sideOffset = 1.0; // Deutlicherer Abstand zwischen Fahrbahn und Seitenwand
    
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
 * Debug: Erzeugt für jeden Checkpoint eine gut sichtbare Kugel und fügt sie der Szene hinzu.
 * Die Kugeln werden 5 Einheiten über der Strecke platziert, um als Checkpoint-Marker zu dienen.
 * Die befahrbare Seite wird durch spezielle Markierungen gekennzeichnet.
 */
function createDebugSpheres(scene, points, color = 0xff0000) {
  // Größere Kugel für bessere Sichtbarkeit der Checkpoints
  const sphereGeom = new THREE.SphereGeometry(4, 16, 16);
  const sphereMat = new THREE.MeshBasicMaterial({ color });
  
  // Nur ausgewählte Punkte als Checkpoint markieren
  // Dies stellt sicher, dass die Checkpoints ausreichend Abstand haben
  const checkpointInterval = Math.max(10, Math.floor(points.length / 12));
  
  // Definiere, welche Seite die befahrbare Seite ist
  const befahrbareSeite = 1; // 1 = rechts, -1 = links
  
  // Finde das Zentrum des Kurses für die Berechnung der normalen Vektoren
  const center = new THREE.Vector3();
  for (let i = 0; i < points.length; i++) {
    center.add(points[i]);
  }
  center.divideScalar(points.length);
  
  for (let i = 0; i < points.length; i += checkpointInterval) {
    // Position über der Strecke
    const position = points[i].clone();
    position.y += 5; // 5 Einheiten über der Strecke
    
    // Berechne Marker für die befahrbare Seite
    if (i % (checkpointInterval * 3) === 0) { // Nur bei jedem dritten Checkpoint
      // Berechne Tangente und Normale für die Position des Seitenmarkers
      const nextIdx = (i + 1) % points.length;
      const tangent = new THREE.Vector3().subVectors(points[nextIdx], points[i]).normalize();
      
      // Berechne die normale Richtung zum Zentrum
      const toCenter = new THREE.Vector3().subVectors(center, points[i]).normalize();
      
      // Berechne die Normale zur Tangente in der horizontalen Ebene
      const normal = new THREE.Vector3().crossVectors(tangent, new THREE.Vector3(0, 1, 0)).normalize();
      
      // Stelle sicher, dass die Normale in die richtige Richtung zeigt (vom Zentrum weg)
      if (normal.dot(toCenter) > 0) {
        normal.negate();
      }
      
      // Positioniere den Seitenmarker auf der befahrbaren Seite
      const sideMarkerPos = points[i].clone().addScaledVector(normal, befahrbareSeite * 15).addScaledVector(new THREE.Vector3(0, 1, 0), 2);
      
      // Erstelle einen auffälligen Marker für die befahrbare Seite
      const sideMarkerGeo = new THREE.BoxGeometry(3, 10, 3);
      const sideMarkerMat = new THREE.MeshBasicMaterial({ color: 0x00ffff });
      const sideMarker = new THREE.Mesh(sideMarkerGeo, sideMarkerMat);
      sideMarker.position.copy(sideMarkerPos);
      scene.add(sideMarker);
    }
    
    // Erstelle den Checkpoint selbst
    let checkpointMat;
    if (i === 0) {
      // Startpunkt mit spezieller Farbe
      checkpointMat = new THREE.MeshBasicMaterial({ color: 0xffff00 });
    } else if (i >= points.length - checkpointInterval) {
      // Endpunkt/Übergang mit anderer spezieller Farbe
      checkpointMat = new THREE.MeshBasicMaterial({ color: 0xff00ff });
    } else {
      // Normale Checkpoints
      checkpointMat = new THREE.MeshBasicMaterial({ color });
    }
    
    const sphere = new THREE.Mesh(sphereGeom, checkpointMat);
    sphere.position.copy(position);
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
 * Zusätzlich wird geprüft, ob die Kurve irgendwo in die falsche Richtung rotiert.
 * Gibt true zurück, wenn die Kurve in Ordnung ist, sonst false.
 */
function validateCurve(curve, segments) {
  const points = curve.getSpacedPoints(segments);
  const threshold = Math.PI * 0.75; // ~135 Grad
  
  // Berechne die Drehrichtung der Kurve insgesamt
  let totalRotation = 0;
  const center = new THREE.Vector3(0, 0, 0);
  
  // 1. Berechne ungefähres Zentrum der Kurve
  for (let i = 0; i < points.length; i++) {
    center.add(points[i]);
  }
  center.divideScalar(points.length);
  
  // 2. Prüfe, ob die Kurve konsistent in eine Richtung dreht
  let prevAngle = null;
  let clockwiseRotations = 0;
  let counterclockwiseRotations = 0;
  
  for (let i = 0; i < points.length; i++) {
    const pointCentered = points[i].clone().sub(center);
    const angle = Math.atan2(pointCentered.z, pointCentered.x);
    
    if (prevAngle !== null) {
      // Berechne Winkeländerung und normalisiere auf [-π, π]
      let deltaAngle = angle - prevAngle;
      if (deltaAngle > Math.PI) deltaAngle -= Math.PI * 2;
      if (deltaAngle < -Math.PI) deltaAngle += Math.PI * 2;
      
      // Zähle Rotationen in jede Richtung
      if (deltaAngle > 0) counterclockwiseRotations++;
      else if (deltaAngle < 0) clockwiseRotations++;
      
      totalRotation += deltaAngle;
    }
    prevAngle = angle;
  }
  
  // Wenn die Kurve stark in unterschiedliche Richtungen rotiert, ist sie problematisch
  if (clockwiseRotations > 0 && counterclockwiseRotations > 0) {
    const totalPoints = clockwiseRotations + counterclockwiseRotations;
    const minorDirection = Math.min(clockwiseRotations, counterclockwiseRotations);
    
    // Wenn mehr als 25% der Rotationen in die falsche Richtung gehen, lehne die Kurve ab
    if (minorDirection / totalPoints > 0.20) {
      console.warn('Kurve rotiert stark in unterschiedliche Richtungen');
      return false;
    }
  }
  
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
  
  // Prüfe auf potenzielle Selbstüberschneidungen - Streckenteile dürfen sich nicht zu nahe kommen
  const minSegmentDistance = 20; // Mindestabstand zwischen nicht benachbarten Segmenten
  for (let i = 0; i < points.length; i++) {
    for (let j = i + 3; j < points.length; j++) { // Überspringe direkte Nachbarn (+3)
      if (j === i || j === (i+1) % points.length || j === (i+2) % points.length) continue;
      
      const dist = points[i].distanceTo(points[j]);
      if (dist < minSegmentDistance) {
        console.warn('Mögliche Streckenüberschneidung erkannt zwischen Punkten', i, 'und', j);
        return false;
      }
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
   * Erzeugt einen geschlossenen Pfad mit einer optimierten Verbindung zwischen
   * dem letzten und ersten Checkpoint für realistische Übergänge.
   * Die Drehrichtung wird optimiert, um immer den kürzesten Weg zu wählen.
   */
  createClosedCurve(numPoints = 30) {
    let attempts = 0;
    let curve;
    
    do {
      // Erzeuge Punkte für eine ovale Grundform
      const rawPoints = [];
      
      // Der letzte Punkt wird sauber mit dem ersten verbunden
      const radius = 500;
      const verticalRadius = radius * 0.8;
      
      // Generiere Punkte auf einem Oval, aber reserviere die letzten Punkte für den Übergang
      const reservedPoints = 5; // Anzahl der Punkte, die für den sauberen Übergang reserviert sind
      const basePoints = numPoints - reservedPoints;
      
      // Wähle eine konsistente Drehrichtung für die Kurve (hier: im Uhrzeigersinn)
      const clockwise = true;
      const angleMultiplier = clockwise ? -1 : 1;
      
      // Erstelle die Hauptpunkte der Strecke
      for (let i = 0; i < basePoints; i++) {
        // In einer konsistenten Richtung generieren - 75% des Kreises für die Hauptstrecke
        // Niemals mehr als 75% des Kreises verwenden, um extreme Rotationen zu vermeiden
        const angle = angleMultiplier * (i / basePoints) * (Math.PI * 2 * 0.75); 
        
        // Erzeuge einen Punkt auf einem leicht ovalen Kreis
        const x = Math.cos(angle) * radius;
        const z = Math.sin(angle) * verticalRadius;
        
        // Kleine Variation in der Höhe (y-Achse) für Hügel/Täler
        const heightVariation = 20;
        const y = Math.sin(angle * 3) * heightVariation;
        
        // Kontrollierte Störung für natürlicheres Aussehen - reduziert für berechenbarere Pfade
        const noiseScale = 20;
        const noise = new THREE.Vector3(
          (Math.sin(angle * 2.1) + Math.cos(angle * 3.7)) * noiseScale,
          0,
          (Math.sin(angle * 3.3) + Math.cos(angle * 2.3)) * noiseScale
        );
        
        const point = new THREE.Vector3(x, y, z).add(noise);
        rawPoints.push(point);
      }
      
      // Füge spezielle Übergangspunkte hinzu, die einen glatten Übergang zurück zum Anfang ermöglichen
      const firstPoint = rawPoints[0];
      const lastPoint = rawPoints[rawPoints.length - 1];
      
      // Bestimme die Richtung des ersten Punkts (vom ersten zum zweiten)
      const firstDir = new THREE.Vector3().subVectors(rawPoints[1], firstPoint).normalize();
      
      // Bestimme die Richtung, in die der letzte Punkt zeigt
      const lastDir = new THREE.Vector3().subVectors(lastPoint, rawPoints[rawPoints.length - 2]).normalize();
      
      // Bestimme den optimalen Weg zurück zum Start durch Vergleich der Winkel
      // Zunächst berechne die direkte Verbindung zum ersten Punkt
      const directToStart = new THREE.Vector3().subVectors(firstPoint, lastPoint).normalize();
      
      // Berechne die beiden möglichen Zielrichtungen für den Übergang
      const targetDir1 = firstDir.clone().negate(); // Entgegengesetzt zur Richtung des ersten Punkts
      const targetDir2 = firstDir.clone(); // Gleiche Richtung wie der erste Punkt
      
      // Berechne die Winkel zwischen der letzten Richtung und den beiden möglichen Zielrichtungen
      const angle1 = lastDir.angleTo(targetDir1);
      const angle2 = lastDir.angleTo(targetDir2);
      
      // Wähle die Richtung mit dem kleineren Winkel, um kleinere Rotationen zu bevorzugen
      const targetDir = angle1 <= angle2 ? targetDir1 : targetDir2;
      
      // Berechne wie abrupt die Drehung sein wird und passe die Anzahl der Übergangspunkte an
      const transitionAngle = lastDir.angleTo(targetDir);
      // Mehr Punkte für scharfe Übergänge
      const dynamicReservedPoints = Math.max(
        reservedPoints, 
        Math.ceil(reservedPoints * transitionAngle / (Math.PI * 0.5))
      );
      
      // Erzeuge Punkte, die eine sanfte Kurve vom letzten Hauptpunkt zurück zum ersten erzeugen
      const approachDistance = lastPoint.distanceTo(firstPoint);
      const transitionStepSize = approachDistance / (dynamicReservedPoints + 1);
      
      // Füge Zwischenpunkte für einen sanften Übergang hinzu
      const transitionPoints = [];
      for (let i = 0; i < dynamicReservedPoints - 1; i++) {
        const t = (i + 1) / (dynamicReservedPoints);
        
        // Progressive Interpolation: Am Anfang mehr vom lastDir, am Ende mehr vom targetDir
        // Verwende eine Potenzfunktion für ein natürlicheres Timing des Übergangs
        const power = transitionAngle > Math.PI * 0.4 ? 0.5 : 0.7; // Flachere Kurve für scharfe Übergänge
        const blendFactor = Math.pow(t, power);
        
        // Interpoliere zwischen der Richtung des letzten Punktes und der Zielrichtung
        const blendDir = lastDir.clone().lerp(targetDir, blendFactor).normalize();
        
        // Positioniere den Punkt entlang dieser interpolierten Richtung
        const interpolatedPoint = lastPoint.clone().add(
          blendDir.clone().multiplyScalar(transitionStepSize * (i + 1))
        );
        
        // Y-Wert sanft angleichen
        interpolatedPoint.y = THREE.MathUtils.lerp(lastPoint.y, firstPoint.y, t);
        
        transitionPoints.push(interpolatedPoint);
      }
      
      // Prüfe, ob die Übergangspunkte in die falsche Richtung gehen (zu stark rotieren)
      let needsReversal = false;
      if (transitionPoints.length > 2) {
        const midIdx = Math.floor(transitionPoints.length / 2);
        const midPoint = transitionPoints[midIdx];
        const straightLineMid = new THREE.Vector3().lerpVectors(lastPoint, firstPoint, 0.5);
        
        // Wenn der Mittelpunkt zu weit von der direkten Linie entfernt ist, könnte der Weg zu umständlich sein
        if (midPoint.distanceTo(straightLineMid) > approachDistance * 0.6) {
          needsReversal = true;
        }
      }
      
      // Bei Bedarf die Übergangsrichtung umkehren
      if (needsReversal) {
        transitionPoints.length = 0; // Leere das Array
        
        // Erstelle einen direkteren Weg mit weniger Punkten
        const simplifiedPoints = 3;
        for (let i = 0; i < simplifiedPoints; i++) {
          const t = (i + 1) / (simplifiedPoints + 1);
          // Interpoliere direkt zwischen den Punkten mit leichter Anhebung in der Mitte
          const interpolatedPoint = new THREE.Vector3().lerpVectors(lastPoint, firstPoint, t);
          
          // Leichte Wölbung in der Mitte für natürlicheres Aussehen
          const midBump = Math.sin(t * Math.PI) * 20;
          interpolatedPoint.y += midBump;
          
          transitionPoints.push(interpolatedPoint);
        }
      }
      
      // Füge alle Übergangspunkte zum Hauptpfad hinzu
      transitionPoints.forEach(point => rawPoints.push(point));
      
      // Füge den Anfangspunkt am Ende hinzu, um den Kreis zu schließen
      rawPoints.push(firstPoint.clone());
      
      // Anwenden von stärkerer Glättung für extra sanfte Kurven
      const smoothPts = smoothPoints(rawPoints, 5, 3);
      
      curve = new THREE.CatmullRomCurve3(smoothPts, true, 'centripetal');
      attempts++;
      
      // Validiere, dass die erzeugte Kurve keine zu starken Winkel aufweist
      // und konsistent in eine Richtung rotiert
    } while (!validateCurve(curve, 100) && attempts < 10);
    
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
    const rainbowTexture = textureLoader.load('./img/rainbow.jpg');
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