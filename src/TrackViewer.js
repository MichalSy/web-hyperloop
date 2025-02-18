// TrackViewer.js
import * as THREE from 'three';
import { GameObject } from './GameObject.js';

function createRainbowTexture(width = 1024, height = 128) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, width, 0);
  gradient.addColorStop(0.0, 'red');
  gradient.addColorStop(0.1429, 'orange');
  gradient.addColorStop(0.2857, 'yellow');
  gradient.addColorStop(0.4286, 'green');
  gradient.addColorStop(0.5714, 'blue');
  gradient.addColorStop(0.7143, 'indigo');
  gradient.addColorStop(0.8571, 'violet');
  gradient.addColorStop(1.0, 'red');
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
  #trackWidth = 20;
  #roadHeight = 1;
  #sideWidth = 2;
  #sideHeight = 2;
  #bankingFactor = 0.4;
  #maxBankingAngle = 25;
  #textureRepeat = 10;

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
    window.addEventListener('keydown', (event) => {
      if (event.key === "0") {
        this.toggleWireframe();
      }
    });
  }

  toggleWireframe() {
    this.wireframe = !this.wireframe;
    this.splineGroup.traverse(child => {
      if (child.isMesh) {
        if (Array.isArray(child.material)) {
          child.material.forEach(mat => mat.wireframe = this.wireframe);
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
      
      const prevLastDir = v[checkpointCount - 2].clone().normalize();
      if (prevLastDir.angleTo(vLast) > maxAngleRad) continue;
      
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
    const closedSpline = new THREE.CatmullRomCurve3(
      this.checkpointPositions,
      true,
      'centripetal',
      0.5
    );

    // Validierung der Spline-Punkte
    console.assert(this.checkpointPositions.length >= 4, 
      "Mindestens 4 Kontrollpunkte benötigt");

    const roadGeometry = this.createRoadGeometry(closedSpline);
    const leftSideGeometry = this.createSideGeometry(closedSpline, 'left');
    const rightSideGeometry = this.createSideGeometry(closedSpline, 'right');
    
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
  }

  createRoadGeometry(spline) {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const uvs = [];
    const indices = [];

    const points = spline.getPoints(500);
    const frenetFrames = spline.computeFrenetFrames(points.length, true);
    
    // Validierung der Frame-Länge
    console.assert(frenetFrames.normals.length === points.length,
      "Frenet-Frames stimmen nicht mit Punkten überein");

    const mainWidth = this.#trackWidth - 2 * this.#sideWidth;

    for (let i = 0; i < points.length; i++) {
      const t = i / (points.length - 1);
      
      // Sicherer Zugriff mit Fallback
      const safeIndex = Math.min(i, frenetFrames.normals.length - 1);
      const frame = frenetFrames[safeIndex] || {};
      const normal = frame.normal || this.#DEFAULT_NORMAL;
      const binormal = frame.binormal || this.#DEFAULT_BINORMAL;
      const tangent = frame.tangent || this.#DEFAULT_TANGENT;

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
      const right = binormal.clone()
        .multiplyScalar(mainWidth / 2)
        .applyQuaternion(rotation);
      
      const left = right.clone().negate();
      const center = points[i];

      // Vertices mit Nullchecks
      const topLeft = center.clone().add(left);
      const topRight = center.clone().add(right);
      const bottomLeft = topLeft.clone().sub(new THREE.Vector3(0, 0, this.#roadHeight));
      const bottomRight = topRight.clone().sub(new THREE.Vector3(0, 0, this.#roadHeight));

      vertices.push(
        topLeft.x, topLeft.y, topLeft.z,
        topRight.x, topRight.y, topRight.z,
        bottomLeft.x, bottomLeft.y, bottomLeft.z,
        bottomRight.x, bottomRight.y, bottomRight.z
      );

      uvs.push(t, 0, t, 1, t, 0, t, 1);
    }

    // Indizes mit Validierung
    for (let i = 0; i < points.length - 1; i++) {
      const offset = i * 4;
      const nextOffset = (i + 1) * 4;

      // Überlaufschutz
      if (nextOffset + 3 >= vertices.length / 3) break;

      indices.push(
        // Oberfläche
        offset, offset + 1, nextOffset,
        offset + 1, nextOffset + 1, nextOffset,
        
        // Linke Seite
        offset, nextOffset, offset + 2,
        nextOffset, nextOffset + 2, offset + 2,
        
        // Rechte Seite
        offset + 1, nextOffset + 1, offset + 3,
        nextOffset + 1, nextOffset + 3, offset + 3,
        
        // Unterseite
        offset + 2, nextOffset + 2, offset + 3,
        nextOffset + 2, nextOffset + 3, offset + 3
      );
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
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

    const points = spline.getPoints(500);
    const frenetFrames = spline.computeFrenetFrames(points.length, true);
    const isLeft = side === 'left';

    for (let i = 0; i < points.length; i++) {
      const t = i / (points.length - 1);
      
      // Sicherer Zugriff mit Fallback
      const safeIndex = Math.min(i, frenetFrames.normals.length - 1);
      const frame = frenetFrames[safeIndex] || {};
      const normal = frame.normal || this.#DEFAULT_NORMAL;
      const binormal = frame.binormal || this.#DEFAULT_BINORMAL;
      const tangent = frame.tangent || this.#DEFAULT_TANGENT;

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
      const offset = binormal.clone()
        .multiplyScalar((this.#trackWidth / 2 - this.#sideWidth / 2) * (isLeft ? -1 : 1))
        .applyQuaternion(rotation);

      const outer = binormal.clone()
        .multiplyScalar((this.#trackWidth / 2 + this.#sideWidth / 2) * (isLeft ? -1 : 1))
        .applyQuaternion(rotation);

      const center = points[i];

      // Vertices
      const topInner = center.clone().add(offset);
      const topOuter = center.clone().add(outer);
      const bottomInner = topInner.clone().sub(new THREE.Vector3(0, 0, this.#sideHeight));
      const bottomOuter = topOuter.clone().sub(new THREE.Vector3(0, 0, this.#sideHeight));

      vertices.push(
        topInner.x, topInner.y, topInner.z,
        topOuter.x, topOuter.y, topOuter.z,
        bottomInner.x, bottomInner.y, bottomInner.z,
        bottomOuter.x, bottomOuter.y, bottomOuter.z
      );

      uvs.push(t, 0, t, 1, t, 0, t, 1);
    }

    // Indizes mit Validierung
    for (let i = 0; i < points.length - 1; i++) {
      const offset = i * 4;
      const nextOffset = (i + 1) * 4;

      if (nextOffset + 3 >= vertices.length / 3) break;

      indices.push(
        // Oberfläche
        offset, offset + 1, nextOffset,
        offset + 1, nextOffset + 1, nextOffset,
        
        // Außenseite
        offset + 1, nextOffset + 1, offset + 3,
        nextOffset + 1, nextOffset + 3, offset + 3,
        
        // Unterseite
        offset + 2, nextOffset + 2, offset + 3,
        nextOffset + 2, nextOffset + 3, offset + 3,
        
        // Innenseite
        offset, nextOffset, offset + 2,
        nextOffset, nextOffset + 2, offset + 2
      );
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
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
    const markerGeometry = new THREE.SphereGeometry(3, 32, 32);
    const markerMaterial = new THREE.MeshPhongMaterial({
      color: 0x00ff00,
      shininess: 100
    });
    
    this.checkpointPositions.forEach((pos, i) => {
      const marker = new THREE.Mesh(markerGeometry, markerMaterial);
      marker.position.copy(pos);
      marker.position.z += 2;
      marker.castShadow = true;
      this.addToScene(marker);
    });
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