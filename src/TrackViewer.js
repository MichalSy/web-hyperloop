// TrackViewer.js
import * as THREE from "three";
import { GameObject } from "./GameObject.js";

function createRainbowTexture(width = 1024, height = 128) {
  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0.0, "red");
  gradient.addColorStop(0.1429, "orange");
  gradient.addColorStop(0.2857, "yellow");
  gradient.addColorStop(0.4286, "green");
  gradient.addColorStop(0.5714, "blue");
  gradient.addColorStop(0.7143, "indigo");
  gradient.addColorStop(0.8571, "violet");
  gradient.addColorStop(1.0, "red");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  const texture = new THREE.CanvasTexture(canvas);
  texture.wrapS = THREE.RepeatWrapping;
  texture.wrapT = THREE.ClampToEdgeWrapping;
  return texture;
}

export class TrackViewer extends GameObject {
  // Konfigurationsparameter
  #checkpointCount = 15;
  #stepDistance = 100;
  #maxAngleDeg = 100;
  #tolerance = 0.1;
  #trackWidth = 30;
  #roadHeight = 4; // Fahrfläche ist 4 Einheiten hoch/dick
  #sideWidth = 2;
  #sideHeight = 5;
  #sideDistance = 3; // Abstand der Seitenstreifen von der Fahrfläche
  #bankingFactor = 0.4;
  #maxBankingAngle = 25;
  #textureRepeat = 10;
  
  // Definition der globalen Richtungsvektoren
  #GLOBAL_UP = new THREE.Vector3(0, 0, 1);    // Globale "Oben"-Richtung (Z+)
  #GLOBAL_DOWN = new THREE.Vector3(0, 0, -1); // Globale "Unten"-Richtung (Z-)

  // Standardvektoren für Frenet-Frames
  #DEFAULT_NORMAL = new THREE.Vector3(0, 0, 1);
  #DEFAULT_BINORMAL = new THREE.Vector3(0, 1, 0);
  #DEFAULT_TANGENT = new THREE.Vector3(1, 0, 0);

  constructor() {
    super();
    this.checkpoints = [];
    this.splineGroup = new THREE.Group();
    this.wireframe = false;
    this.addLighting();
    this.initCheckpoints();
    this.createTrack();
    this.setupKeyToggle();
    this.addCheckpointMarkers();
    this.focusOnTrack();
  }

  addLighting() {
    const ambientLight = new THREE.AmbientLight(0xffffff, 0.5);
    const directionalLight = new THREE.DirectionalLight(0xffffff, 0.8);
    directionalLight.position.set(100, 100, 100);
    directionalLight.castShadow = true;
    this.addToScene(ambientLight);
    this.addToScene(directionalLight);
  }

  setupKeyToggle() {
    window.addEventListener("keydown", (event) => {
      if (event.key === "0") {
        this.toggleWireframe();
      }
    });
  }

  toggleWireframe() {
    this.wireframe = !this.wireframe;
    this.splineGroup.traverse((child) => {
      if (child.isMesh) {
        if (Array.isArray(child.material)) {
          child.material.forEach((mat) => (mat.wireframe = this.wireframe));
        } else {
          child.material.wireframe = this.wireframe;
        }
        child.material.needsUpdate = true;
      }
    });
  }

  initCheckpoints() {
    let positions = null;
    while (!positions) {
      positions = this.generateClosedChain(
        this.#checkpointCount,
        this.#stepDistance,
        this.#maxAngleDeg,
        this.#tolerance
      );
    }
    this.checkpointPositions = positions;
  }

  generateClosedChain(checkpointCount, stepDistance, maxAngleDeg, tolerance) {
    const maxAttempts = 10000;
    const maxAngleRad = THREE.MathUtils.degToRad(maxAngleDeg);
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const v = [];
      v.push(new THREE.Vector3(1, 0, 0).multiplyScalar(stepDistance));
      for (let i = 1; i < checkpointCount - 1; i++) {
        const prevDir = v[i - 1].clone().normalize();
        const newDir = this.randomDirectionInCone(prevDir, maxAngleRad);
        v.push(newDir.multiplyScalar(stepDistance));
      }

      const sum = new THREE.Vector3(0, 0, 0);
      for (let i = 0; i < checkpointCount - 1; i++) {
        sum.add(v[i]);
      }
      
      const vLast = sum.clone().negate();
      if (Math.abs(vLast.length() - stepDistance) > tolerance) continue;
      
      // Überprüfe, ob der neue Winkel innerhalb der Grenzen liegt
      const prevLastDir = v[checkpointCount - 2].clone().normalize();
      const firstDir = v[0].clone().normalize();
      const lastDir = vLast.clone().normalize();
      
      // Berechne den Ausrichtungsfaktor zwischen letztem und erstem Vektor
      // 1 = perfekt ausgerichtet, -1 = gegenüberliegend
      const alignmentFactor = firstDir.dot(lastDir.clone().negate());
      
      // Wenn die Ausrichtung schlecht ist, passe den letzten Vektor an
      if (alignmentFactor < 0.7) {
        // Erstelle eine gewichtete Mischung aus aktueller Richtung und idealer Richtung
        const blendedDir = new THREE.Vector3()
          .addScaledVector(lastDir, 0.6)
          .addScaledVector(firstDir, 0.4)
          .normalize();
        vLast.copy(blendedDir.multiplyScalar(stepDistance));
      }
      
      // Überprüfe, ob der neue Winkel innerhalb der Grenzen liegt
      // Erhöhen der maximalen Winkeltoleranz für den letzten Checkpoint, um eine bessere Verbindung zum Startpunkt zu ermöglichen
      const lastSegmentAngle = prevLastDir.angleTo(vLast);
      if (lastSegmentAngle > maxAngleRad * 1.1) { // 10% mehr Toleranz für den letzten Abschnitt
        // Debug-Information, wenn ein Versuch aufgrund des Winkels fehlschlägt
        if (attempt % 100 === 0) {
          console.log(`Versuch ${attempt}: Letzter Winkel zu groß (${THREE.MathUtils.radToDeg(lastSegmentAngle).toFixed(2)}°)`);
        }
        continue;
      }
      
      v.push(vLast.normalize().multiplyScalar(stepDistance));
      const positions = [];
      let pos = new THREE.Vector3(0, 0, 0);
      positions.push(pos.clone());
      
      for (let i = 0; i < checkpointCount; i++) {
        pos.add(v[i]);
        positions.push(pos.clone());
      }
      
      if (positions[positions.length - 1].distanceTo(positions[0]) > tolerance) continue;
      positions.pop();
      return positions;
    }
    return null;
  }

  randomDirectionInCone(baseDirection, maxAngleRad) {
    const cosTheta = THREE.MathUtils.lerp(Math.cos(maxAngleRad), 1, Math.random());
    const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
    const phi = Math.random() * 2 * Math.PI;
    const localDir = new THREE.Vector3(
      sinTheta * Math.cos(phi),
      sinTheta * Math.sin(phi),
      cosTheta
    );
    const quaternion = new THREE.Quaternion().setFromUnitVectors(
      new THREE.Vector3(0, 0, 1),
      baseDirection
    );
    return localDir.applyQuaternion(quaternion).normalize();
  }

  createTrack() {
    // Spline erstellen mit Catmull-Rom-Interpolation für glatte Kurven
    const closedSpline = new THREE.CatmullRomCurve3(
      this.checkpointPositions,
      true, // closed path
      "centripetal", // typ der Interpolation (centripetal gibt glattere Kurven)
      0.5 // Spannung
    );
    
    // Speichere die Spline für später
    this.trackSpline = closedSpline;
    
    // Vorberechnung der Spline-Punkte und Frenet-Frames für spätere Verwendung
    this.splinePoints = this.trackSpline.getPoints(500);
    this.frenetFrames = this.trackSpline.computeFrenetFrames(this.splinePoints.length, true);

    // Validierung der Spline-Punkte
    console.assert(this.checkpointPositions.length >= 4, 
      "Mindestens 4 Kontrollpunkte benötigt");

    const roadGeometry = this.createRoadGeometry(this.trackSpline);
    const leftSideGeometry = this.createSideGeometry(this.trackSpline, "left");
    const rightSideGeometry = this.createSideGeometry(this.trackSpline, "right");
    
    // Materialien mit verschiedenen Farben für leichte Unterscheidung
    const roadMaterial = this.createRoadMaterial(createRainbowTexture());
    const leftMaterial = this.createRoadMaterial(new THREE.Color(0xff8888));
    const rightMaterial = this.createRoadMaterial(new THREE.Color(0x880000));

    const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);
    const leftMesh = new THREE.Mesh(leftSideGeometry, leftMaterial);
    const rightMesh = new THREE.Mesh(rightSideGeometry, rightMaterial);
    
    [roadMesh, leftMesh, rightMesh].forEach(mesh => {
      mesh.receiveShadow = true;
      mesh.castShadow = true;
      this.splineGroup.add(mesh);
    });

    this.addToScene(this.splineGroup);
    
    // Nachdem alle Geometrien erstellt wurden, füge Debug-Pfeile hinzu
    this.addDebugArrowsAlongSpline(this.trackSpline, 2);
  }

  createRoadGeometry(spline) {
    // Debug-Pfeile werden erst nach der Geometrie-Erzeugung hinzugefügt,
    // um Probleme mit der Frenet-Frame-Berechnung zu vermeiden
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const uvs = [];
    const indices = [];

    // Verwende die bereits berechneten Spline-Punkte und Frenet-Frames
    const points = this.splinePoints;
    const frenetFrames = this.frenetFrames; 
    
    // Berechne die Breite der Hauptfahrbahn unter Berücksichtigung der Seitenlinien und Abstände
    const mainWidth = this.#trackWidth - 2 * this.#sideWidth - 4 * this.#sideDistance;

    for (let i = 0; i < points.length; i++) {
      const t = i / (points.length - 1);
      
      // Sicherer Zugriff mit Fallback
      const safeIndex = Math.min(i, frenetFrames.normals.length - 1);
      const normal = frenetFrames.normals[safeIndex] || this.#DEFAULT_NORMAL;
      const binormal = frenetFrames.binormals[safeIndex] || this.#DEFAULT_BINORMAL;
      const tangent = frenetFrames.tangents[safeIndex] || this.#DEFAULT_TANGENT;

      // Banking-Berechnung mit Fehlerabfang
      let banking = 0;
      try {
        const nextIndex = Math.min(i + 1, frenetFrames.tangents.length - 1);
        const curvature = tangent.angleTo(frenetFrames.tangents[nextIndex]);
        banking = THREE.MathUtils.degToRad(
          THREE.MathUtils.clamp(
            curvature * this.#bankingFactor,
            -this.#maxBankingAngle,
            this.#maxBankingAngle
          )
        );
      } catch (e) {
        console.warn(`Banking-Berechnung fehlgeschlagen bei Index ${i}:`, e);
      }

      const rotation = new THREE.Quaternion().setFromAxisAngle(tangent, banking);
      // Berechne exakte Position der Hauptfahrbahn mit korrektem Abstand zu den Seitenstreifen
      const right = binormal.clone()
        .multiplyScalar(mainWidth / 2)
        .applyQuaternion(rotation);
      
      const left = right.clone().negate();
      const center = points[i];

      // Vertices mit Nullchecks
      const topLeft = center.clone().add(left);
      const topRight = center.clone().add(right);
      
      // Untere Vertices direkt entlang der GLOBALEN Z-Achse (nach unten) verschieben
      // für konsistente Dicke und richtige Richtung für die globale Gravitation
      const roadDownVector = new THREE.Vector3(0, 0, this.#roadHeight);
      const bottomLeft = topLeft.clone().sub(roadDownVector);
      const bottomRight = topRight.clone().sub(roadDownVector);

      vertices.push(
        topLeft.x, topLeft.y, topLeft.z,
        topRight.x, topRight.y, topRight.z,
        bottomLeft.x, bottomLeft.y, bottomLeft.z,
        bottomRight.x, bottomRight.y, bottomRight.z
      );

      // Detailliertere UV-Koordinaten für bessere Texturen
      uvs.push(
        t, 0,  // topLeft
        t, 1,  // topRight
        t, 0,  // bottomLeft
        t, 1   // bottomRight
      );
    }

    // Indizes mit Validierung
    for (let i = 0; i < points.length - 1; i++) {
      const offset = i * 4;
      const nextOffset = (i + 1) * 4;

      // Überlaufschutz
      if (nextOffset + 3 >= vertices.length / 3) break;

      indices.push(
        // Oberfläche - korrigierte Reihenfolge für korrekte Normalen
        offset, nextOffset, offset + 1,
        offset + 1, nextOffset, nextOffset + 1,
        
        // Linke Seite
        offset, offset + 2, nextOffset,
        nextOffset, offset + 2, nextOffset + 2,
        
        // Rechte Seite
        offset + 1, nextOffset + 1, offset + 3,
        nextOffset + 1, nextOffset + 3, offset + 3,
        
        // Unterseite - korrigierte Reihenfolge für korrekte Normalen
        offset + 2, offset + 3, nextOffset + 2,
        nextOffset + 2, offset + 3, nextOffset + 3
      );
    }

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    
    // Automatische Normalenberechnung
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();

    return geometry;
  }

  createSideGeometry(spline, side) {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const uvs = [];
    const indices = [];

    // Verwende die bereits berechneten Spline-Punkte und Frenet-Frames
    const points = this.splinePoints;
    const frenetFrames = this.frenetFrames;
    const isLeft = side === "left";

    for (let i = 0; i < points.length; i++) {
      const t = i / (points.length - 1);
      
      // Sicherer Zugriff mit Fallback
      const safeIndex = Math.min(i, frenetFrames.normals.length - 1);
      const normal = frenetFrames.normals[safeIndex] || this.#DEFAULT_NORMAL;
      const binormal = frenetFrames.binormals[safeIndex] || this.#DEFAULT_BINORMAL;
      const tangent = frenetFrames.tangents[safeIndex] || this.#DEFAULT_TANGENT;

      // Banking-Berechnung mit Fehlerabfang
      let banking = 0;
      try {
        const nextIndex = Math.min(i + 1, frenetFrames.tangents.length - 1);
        const curvature = tangent.angleTo(frenetFrames.tangents[nextIndex]);
        banking = THREE.MathUtils.degToRad(
          THREE.MathUtils.clamp(
            curvature * this.#bankingFactor,
            -this.#maxBankingAngle,
            this.#maxBankingAngle
          )
        );
      } catch (e) {
        console.warn(`Seiten-Banking fehlgeschlagen bei Index ${i}:`, e);
      }

      const rotation = new THREE.Quaternion().setFromAxisAngle(tangent, banking);
      // Berechne die Ränder der Hauptfahrbahn
      const mainRoadHalfWidth = (this.#trackWidth - 2 * this.#sideWidth - 4 * this.#sideDistance) / 2;
      const mainRoadEdge = binormal.clone()
        .multiplyScalar(mainRoadHalfWidth * (isLeft ? -1 : 1))
        .applyQuaternion(rotation);
      
      // Innerer Rand des Seitenstreifens mit definiertem Abstand zur Hauptfahrbahn
      const stripInnerPosition = mainRoadHalfWidth + this.#sideDistance;
      const offset = binormal.clone()
        .multiplyScalar((stripInnerPosition) * (isLeft ? -1 : 1))
        .applyQuaternion(rotation);

      // Äußerer Rand des Seitenstreifens
      const stripOuterPosition = stripInnerPosition + this.#sideWidth;
      const outer = binormal.clone()
        .multiplyScalar((stripOuterPosition) * (isLeft ? -1 : 1))
        .applyQuaternion(rotation);

      const center = points[i];

      // Vertices
      const topInner = center.clone().add(offset);
      const topOuter = center.clone().add(outer);
      
      // Untere Vertices exakt entlang der GLOBALEN Z-Achse (nach unten) verschieben
      // für konsistente Dicke und korrekte Ausrichtung zur Gravitation
      const sideDownVector = new THREE.Vector3(0, 0, this.#sideHeight);
      const bottomInner = topInner.clone().sub(sideDownVector);
      const bottomOuter = topOuter.clone().sub(sideDownVector);

      vertices.push(
        topInner.x, topInner.y, topInner.z,
        topOuter.x, topOuter.y, topOuter.z,
        bottomInner.x, bottomInner.y, bottomInner.z,
        bottomOuter.x, bottomOuter.y, bottomOuter.z
      );

      // Detailliertere UV-Koordinaten für bessere Texturen
      uvs.push(
        t, 0,  // topInner
        t, 1,  // topOuter
        t, 0,  // bottomInner
        t, 1   // bottomOuter
      );
    }

    // Indizes mit Validierung
    for (let i = 0; i < points.length - 1; i++) {
      const offset = i * 4;
      const nextOffset = (i + 1) * 4;

      if (nextOffset + 3 >= vertices.length / 3) break;

      indices.push(
        // Oberfläche - korrigierte Reihenfolge für korrekte Normalen
        offset, nextOffset, offset + 1,
        offset + 1, nextOffset, nextOffset + 1,
        
        // Außenseite
        offset + 1, offset + 3, nextOffset + 1,
        nextOffset + 1, offset + 3, nextOffset + 3,
        
        // Unterseite - korrigierte Reihenfolge für korrekte Normalen
        offset + 2, offset + 3, nextOffset + 2,
        nextOffset + 2, offset + 3, nextOffset + 3,
        
        // Innenseite
        offset, offset + 2, nextOffset,
        nextOffset, offset + 2, nextOffset + 2
      );
    }

    geometry.setAttribute("position", new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute("uv", new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setIndex(indices);
    
    // Automatische Normalenberechnung
    geometry.computeVertexNormals();
    geometry.computeBoundingSphere();

    return geometry;
  }

  createRoadMaterial(map) {
    const material = new THREE.MeshPhongMaterial({
      map: map instanceof THREE.Color ? null : map,
      color: map instanceof THREE.Color ? map : 0xffffff,
      side: THREE.DoubleSide,
      shininess: 50,
      specular: 0x222222,
      shadowSide: THREE.BackSide
    });

    if (map instanceof THREE.Texture) {
      map.repeat.set(this.#textureRepeat, 1);
      map.wrapS = THREE.RepeatWrapping;
      map.needsUpdate = true;
    }
    
    return material;
  }

  focusOnTrack() {
    const box = new THREE.Box3().setFromObject(this.splineGroup);
    const center = box.getCenter(new THREE.Vector3());
    const size = box.getSize(new THREE.Vector3());
    const maxDim = Math.max(size.x, size.y, size.z);

    if (this.camera) {
      this.camera.position.copy(center);
      this.camera.position.z += maxDim * 2;
      this.camera.position.y += maxDim * 0.5;
      this.camera.lookAt(center);
      this.camera.far = maxDim * 10;
      this.camera.updateProjectionMatrix();
    }
  }

  addCheckpointMarkers() {
    const markerGeometry = new THREE.SphereGeometry(4, 16, 16);
    
    // Verwende die bereits berechneten Spline-Punkte und Frenet-Frames
    const splinePoints = this.splinePoints;
    const frenetFrames = this.frenetFrames;
    
    // Array zur Speicherung der exakteren Tangenten
    const tangents = [];
    const normals = [];
    const binormals = [];
    
    // Finde die nächsten Punkte auf der Spline für jeden Checkpoint
    for (let i = 0; i < this.checkpointPositions.length; i++) {
      const checkpoint = this.checkpointPositions[i];
      
      // Finde den nächsten Punkt auf der Spline
      let closestPointIndex = 0;
      let minDistance = Infinity;
      
      for (let j = 0; j < splinePoints.length; j++) {
        const distance = checkpoint.distanceTo(splinePoints[j]);
        if (distance < minDistance) {
          minDistance = distance;
          closestPointIndex = j;
        }
      }
      
      // Verwende die Tangente, Normale und Binormale des nächsten Punktes
      tangents.push(frenetFrames.tangents[closestPointIndex].clone());
      normals.push(frenetFrames.normals[closestPointIndex].clone());
      binormals.push(frenetFrames.binormals[closestPointIndex].clone());
      
      // Debug-Information ausgeben
      console.log(`Checkpoint ${i}: Position (${checkpoint.x.toFixed(2)}, ${checkpoint.y.toFixed(2)}, ${checkpoint.z.toFixed(2)})`);
      console.log(`  Nächster Spline-Punkt: Index ${closestPointIndex}, Abstand: ${minDistance.toFixed(2)}`);
      console.log(`  Tangente: (${tangents[i].x.toFixed(2)}, ${tangents[i].y.toFixed(2)}, ${tangents[i].z.toFixed(2)})`);
    }
    
    // Berechne Zentrum der Strecke für Normalen-Berechnung
    const center = new THREE.Vector3();
    for (let i = 0; i < this.checkpointPositions.length; i++) {
      center.add(this.checkpointPositions[i]);
    }
    center.divideScalar(this.checkpointPositions.length);
    
    // Erstelle für jeden Checkpoint einen Marker mit angepasster Höhe und korrekter Ausrichtung
    this.checkpointPositions.forEach((originalPos, i) => {
      // Verwende den tatsächlichen Punkt auf der Spline für den Marker
      const t = this.trackSpline.getUtoTmapping(i / this.checkpointPositions.length);
      const splinePos = this.trackSpline.getPoint(t);
      
      // Berechne Krümmung basierend auf angrenzenden Punkten
      const prevIdx = (i - 1 + this.checkpointPositions.length) % this.checkpointPositions.length;
      const nextIdx = (i + 1) % this.checkpointPositions.length;
      
      const tangent = tangents[i];
      const normal = normals[i];
      const binormal = binormals[i];
      
      // Berechne Winkeländerung als Maß für die Krümmung
      const prevTangent = tangents[prevIdx];
      const nextTangent = tangents[nextIdx];
      const anglePrev = tangent.angleTo(prevTangent);
      const angleNext = tangent.angleTo(nextTangent);
      const curvatureValue = (anglePrev + angleNext) / 2;
      
      // Debug: Zeige ausführliche Informationen für jeden Checkpoint
      console.log(`Checkpoint ${i} Debug:`);
      console.log(`  Original Position: (${originalPos.x.toFixed(2)}, ${originalPos.y.toFixed(2)}, ${originalPos.z.toFixed(2)})`);
      console.log(`  Spline Position: (${splinePos.x.toFixed(2)}, ${splinePos.y.toFixed(2)}, ${splinePos.z.toFixed(2)})`);
      console.log(`  Krümmung: ${THREE.MathUtils.radToDeg(curvatureValue).toFixed(2)}°`);
      console.log(`  Frenet-Frame: Tangent(${tangent.x.toFixed(2)}, ${tangent.y.toFixed(2)}, ${tangent.z.toFixed(2)}), `
        + `Normal(${normal.x.toFixed(2)}, ${normal.y.toFixed(2)}, ${normal.z.toFixed(2)}), `
        + `Binormal(${binormal.x.toFixed(2)}, ${binormal.y.toFixed(2)}, ${binormal.z.toFixed(2)})`);
      
      // Erstelle ein Debug-Koordinatensystem für den Frenet-Frame
      if (i % 3 === 0) { // Nur bei jedem dritten Checkpoint zur besseren Übersicht
        const axisLength = 8;
        
        // Tangente (Rot, zeigt in Fahrtrichtung)
        const tangentArrow = new THREE.ArrowHelper(
          tangent,
          splinePos,
          axisLength,
          0xff0000
        );
        
        // WICHTIG: Globale Z-Achse (Grün, zeigt exakt nach oben/Himmel)
        // Verwende den GLOBAL_UP-Vektor für konsistente Ausrichtung
        const upArrow = new THREE.ArrowHelper(
          this.#GLOBAL_UP.clone(), // Genau nach oben (Z+)
          splinePos,
          axisLength,
          0x00ff00
        );
        
        // Normale (Gelb, zeigt "nach oben" relativ zur Strecke)
        const normalArrow = new THREE.ArrowHelper(
          normal,
          splinePos,
          axisLength * 0.8,
          0xffff00
        );
        
        // Binormale (Blau, zeigt seitwärts)
        const binormalArrow = new THREE.ArrowHelper(
          0x0000ff
        );
        
        this.addToScene(tangentArrow);
        this.addToScene(upArrow);      // Füge den globalen Up-Pfeil hinzu
        this.addToScene(normalArrow);
        this.addToScene(binormalArrow);
      }
      
      // Höhenanpassung: Mehr Höhe bei stärkerer Krümmung für bessere Sichtbarkeit
      const baseHeight = 5; // Basis-Höhe 5 Einheiten
      const curvatureBonus = curvatureValue * 5; // Zusätzliche Höhe abhängig von der Krümmung
      const totalHeight = baseHeight + Math.min(curvatureBonus, 3); // Maximale Zusatzhöhe begrenzen
      
      // Position auf der Spline setzen und exakt entlang der Z-Achse (nach oben) anheben
      // Verwende die exakten Punkte auf der Spline statt der originalen Checkpoints
      const position = splinePos.clone().add(new THREE.Vector3(0, 0, -totalHeight)); // Negative Z = "nach oben"
      
      // Wähle Farbe basierend auf Position (Start/Ende/normal)
      let markerMaterial;
      if (i === 0) {
        // Startpunkt dunkelgrün
        markerMaterial = new THREE.MeshPhongMaterial({
          color: 0x006400, // Dunkelgrün
          shininess: 100
        });
      } else if (i === this.checkpointPositions.length - 1) {
        // Endpunkt rot - mit besserer Ausrichtung zum Startpunkt
        markerMaterial = new THREE.MeshPhongMaterial({
          color: 0xff0000, // Rot
          shininess: 100
        });
        
        // Für den letzten Checkpoint, optimiere die Ausrichtung zum Startpunkt
        // Berechne den Vektor vom letzten Punkt zum ersten Punkt auf der Spline
        const startSplinePos = this.trackSpline.getPoint(0);
        const vectorToStart = new THREE.Vector3().subVectors(
          startSplinePos,
          splinePos
        ).normalize();
        
        // Debug-Information zur Ausrichtung des Endpunkts zum Startpunkt
        const angleToStart = tangent.angleTo(vectorToStart);
        console.log(`  Winkel zum Startpunkt: ${THREE.MathUtils.radToDeg(angleToStart).toFixed(2)}°`);
        console.log(`  Direkter Vektor zum Startpunkt: (${vectorToStart.x.toFixed(2)}, ${vectorToStart.y.toFixed(2)}, ${vectorToStart.z.toFixed(2)})`);
        
        // Erstelle einen speziellen Pfeil, der die direkte Linie zum Startpunkt zeigt
        const directArrow = new THREE.ArrowHelper(
          vectorToStart,
          position,
          15,
          0xff00ff, // Magenta für die direkte Linie zum Start
          1.5,
          0.7
        );
        this.addToScene(directArrow);
        
        // Tangente für den letzten Checkpoint überarbeiten - mehr in Richtung Start
        // Mische die originale Tangente mit dem Vektor zum Start
        const blendedTangent = new THREE.Vector3()
          .addScaledVector(tangent, 0.2)
          .addScaledVector(vectorToStart, 0.8)
          .normalize();
          
        // Aktualisiere die Tangente und erstelle eine neue Frenet-Frame-Basis
        tangents[i] = blendedTangent;
        
        // Berechne neue Normale und Binormale basierend auf der aktualisierten Tangente
        // Wähle eine temporäre Hilfsvektorrichtung
        const tempUp = new THREE.Vector3(0, 0, 1);
        binormals[i] = new THREE.Vector3().crossVectors(tempUp, blendedTangent).normalize();
        // Falls die Tangente und tempUp parallel sind, wähle einen anderen Vektor
        if (binormals[i].lengthSq() < 0.1) {
          binormals[i].crossVectors(new THREE.Vector3(1, 0, 0), blendedTangent).normalize();
        }
        normals[i] = new THREE.Vector3().crossVectors(blendedTangent, binormals[i]).normalize();
      } else {
        // Normale Checkpoints grün
        markerMaterial = new THREE.MeshPhongMaterial({
          color: 0x00ff00, // Normale Checkpoints grün
          shininess: 100
        });
      }
      
      // Erstelle Checkpoint-Marker
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.copy(position);
      marker.castShadow = true;
      
      // Erstelle Textlabel für Debug-Info (wenn gewünscht)
      if (i % 3 === 0) { // Nur bei jedem dritten Checkpoint
        // Erstelle Wireframe-Box zum Anzeigen der Rotation, ausgerichtet am Frenet-Frame
        const boxSize = 2 + curvatureValue * 3; // Größe abhängig von der Krümmung
        const boxGeometry = new THREE.BoxGeometry(boxSize, boxSize, boxSize);
        const wireframeMaterial = new THREE.MeshBasicMaterial({
          color: 0xffff00,
          wireframe: true
        });
        const wireframe = new THREE.Mesh(boxGeometry, wireframeMaterial);
        
        // Position exakt auf dem Spline-Punkt mit Höhe in Normalenrichtung
        wireframe.position.copy(position);
        
        // Erstelle eine Rotationsmatrix aus den Frenet-Frame-Vektoren
        // Dies richtet die Box präzise entlang der Spline aus
        const rotationMatrix = new THREE.Matrix4();
        const columns = [
          binormal.x, binormal.y, binormal.z, 0,
          normal.x, normal.y, normal.z, 0,
          tangent.x, tangent.y, tangent.z, 0,
          0, 0, 0, 1
        ];
        rotationMatrix.fromArray(columns);
        wireframe.setRotationFromMatrix(rotationMatrix);
        
        // Koordinatensystem-Achsen zur Visualisierung des Frenet-Frames
        const axisLength = boxSize * 0.75;
        
        // X-Achse (Rot = Binormale)
        const xAxis = new THREE.ArrowHelper(
          new THREE.Vector3(1, 0, 0),
          wireframe.position.clone(),
          axisLength,
          0xff0000
        );
        xAxis.setRotationFromMatrix(rotationMatrix);
        
        // Y-Achse (Grün = Normale)
        const yAxis = new THREE.ArrowHelper(
          new THREE.Vector3(0, 1, 0),
          wireframe.position.clone(),
          axisLength,
          0x00ff00
        );
        yAxis.setRotationFromMatrix(rotationMatrix);
        
        // Z-Achse (Blau = Tangente)
        const zAxis = new THREE.ArrowHelper(
          new THREE.Vector3(0, 0, 1),
          wireframe.position.clone(),
          axisLength,
          0x0000ff
        );
        zAxis.setRotationFromMatrix(rotationMatrix);
        
        this.addToScene(xAxis);
        this.addToScene(yAxis);
        this.addToScene(zAxis);
        
        this.addToScene(wireframe);
      }
      
      this.addToScene(marker);
    });
  }

  // Debug-Pfeile entlang der gesamten Spline hinzufügen
  addDebugArrowsAlongSpline(spline, spacing = 2) {
    // Gesamtlänge der Spline berechnen
    const splineLength = spline.getLength();
    
    // Debug-Meldung mit der Gesamtlänge der Strecke
    console.log(`Gesamtlänge der Spline: ${splineLength.toFixed(2)} Einheiten`);
    
    // Anzahl der zu platzierenden Pfeile basierend auf dem Abstand
    const arrowCount = Math.floor(splineLength / spacing);
    
    console.log(`Platziere ${arrowCount} Debug-Pfeile entlang der Spline (Abstand: ${spacing} Einheiten)`);
    
    // Erstelle eine Debug-Gruppe für die Pfeile
    const debugArrowsGroup = new THREE.Group();
    debugArrowsGroup.name = "SplineDebugArrows";
    
    // Schleife durch die Spline und platziere Pfeile in regelmäßigen Abständen
    for (let i = 0; i < arrowCount; i++) {
      // Berechne die Position entlang der Spline (0-1)
      const t = i * spacing / splineLength;
      
      // Berechne den aktuellen Punkt und den Tangent-Vektor
      const point = spline.getPointAt(t);
      const tangent = spline.getTangentAt(t);
      
      // Wir wollen immer eine Normale, die in Richtung der globalen Z-Achse (Himmel) zeigt
      // Anstatt die Normale relativ zur Strecke zu berechnen, verwenden wir einen festen Vektor nach oben
      // und projizieren diesen auf die Ebene senkrecht zur Tangente
      const globalUp = new THREE.Vector3(0, 0, 1); // Globaler "Himmel"-Vektor
      
      // Projektion des globalUp-Vektors auf die Ebene senkrecht zur Tangente
      // Formel: projection = v - (v·n)*n, wobei n die normalisierte Tangente ist
      const dotProduct = globalUp.dot(tangent);
      const normal = new THREE.Vector3()
        .copy(globalUp)
        .sub(tangent.clone().multiplyScalar(dotProduct))
        .normalize();
      
      // Falls der globalUp-Vektor und die Tangente fast parallel sind (was zu einer sehr kleinen Normale führen würde),
      // verwenden wir stattdessen einen zusätzlichen Hilfsvektor
      if (normal.lengthSq() < 0.01) {
        // In diesem Fall ist die Strecke fast vertikal (nahezu parallel zur Z-Achse)
        // Wir wählen einen beliebigen Vector in der XY-Ebene
        const tempVector = new THREE.Vector3(1, 0, 0);
        const axis = new THREE.Vector3().crossVectors(tempVector, tangent).normalize();
        normal.crossVectors(tangent, axis).normalize();
      }
      
      // Erstelle einen Pfeil, der immer in Richtung Z-Achse (Himmel) zeigt
      const arrowLength = 4;
      const arrowHelper = new THREE.ArrowHelper(
        new THREE.Vector3(0, 0, 1), // Immer direkt nach oben (Z-Achse)
        point,
        arrowLength,
        0xffffff, // Weiße Farbe für die Spline-Pfeile
        0.5, // Kleinere Pfeilspitze für eine sauberere Visualisierung
        0.2
      );
      
      // Erstelle zusätzlich einen Pfeil, der in Richtung der Normalen zeigt (rechtwinklig zur Strecke)
      // für Debug-Zwecke, um den Unterschied zu sehen
      if (i % 20 === 0) {
        const normalArrowHelper = new THREE.ArrowHelper(
          normal,
          point,
          arrowLength * 0.8,
          0x00ffff, // Türkis für die Normale zur Strecke
          0.4,
          0.15
        );
        debugArrowsGroup.add(normalArrowHelper);
      }
      
      // Füge die aktuelle Position als Beschriftung hinzu (nur für jeden 10. Pfeil)
      if (i % 10 === 0) {
        // Markiere die Position mit einem kleinen Würfel
        const cube = new THREE.Mesh(
          new THREE.BoxGeometry(0.5, 0.5, 0.5),
          new THREE.MeshBasicMaterial({ color: 0xffff00 })
        );
        cube.position.copy(point);
        
        // Füge t-Wert und Position zu Debug-Konsole hinzu
        console.log(`Pfeil ${i}: t=${t.toFixed(4)}, pos=(${point.x.toFixed(2)}, ${point.y.toFixed(2)}, ${point.z.toFixed(2)})`);
        
        debugArrowsGroup.add(cube);
      }
      
      debugArrowsGroup.add(arrowHelper);
    }
    
    this.addToScene(debugArrowsGroup);
  }
  
  update(deltaTime) {
    this.splineGroup.traverse(child => {
      if (child.isMesh && child.material.map) {
        child.material.map.offset.x += deltaTime * 0.1;
        child.material.map.needsUpdate = true;
      }
    });
  }
}