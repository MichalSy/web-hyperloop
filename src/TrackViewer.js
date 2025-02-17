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
  // Checkpoint-Einstellungen
  #checkpointCount = 15;
  #stepDistance = 100;
  #maxAngleDeg = 100;
  #tolerance = 0.1;
  #trackWidth = 14;
  #roadHeight = 1;
  #bankingFactor = 0.4;
  #maxBankingAngle = 25;
  #textureRepeat = 10;

  constructor() {
    super();
    this.checkpoints = [];
    this.splineGroup = new THREE.Group();
    this.wireframe = false;
    
    // Beleuchtung hinzufügen
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
        child.material.forEach(mat => mat.wireframe = this.wireframe);
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

    const geometry = this.createRoadGeometry(closedSpline);
    const materials = this.createRoadMaterials();
    
    const roadMesh = new THREE.Mesh(geometry, materials);
    roadMesh.receiveShadow = true;
    roadMesh.castShadow = true;
    
    // Debug-Wireframe
    const edges = new THREE.EdgesGeometry(geometry);
    const lineMaterial = new THREE.LineBasicMaterial({ color: 0x000000 });
    const wireframe = new THREE.LineSegments(edges, lineMaterial);
    // roadMesh.add(wireframe);

    this.splineGroup.add(roadMesh);
    this.addToScene(this.splineGroup);
  }

  createRoadGeometry(spline) {
    const geometry = new THREE.BufferGeometry();
    const vertices = [];
    const uvs = [];
    const indices = [];
    const normals = [];

    const points = spline.getPoints(500);
    const frenetFrames = spline.computeFrenetFrames(points.length, true);

    for (let i = 0; i < points.length; i++) {
      const t = i / (points.length - 1);
      const safeIndex = THREE.MathUtils.clamp(i, 0, frenetFrames.normals.length - 1);

      const normal = frenetFrames.normals[safeIndex];
      const binormal = frenetFrames.binormals[safeIndex];
      const tangent = frenetFrames.tangents[safeIndex];
      const halfWidth = this.#trackWidth / 2;

      // Banking-Berechnung
      const curvature = tangent.angleTo(frenetFrames.tangents[Math.min(i + 1, frenetFrames.tangents.length - 1)]);
      const banking = THREE.MathUtils.degToRad(
        THREE.MathUtils.clamp(
          curvature * this.#bankingFactor,
          -this.#maxBankingAngle,
          this.#maxBankingAngle
        )
      );

      // Straßenpunkte
      const right = binormal
        .clone()
        .multiplyScalar(halfWidth)
        .applyAxisAngle(tangent, banking);
      const left = right.clone().negate();
      const center = points[i];

      // Vertices
      vertices.push(
        // Links oben (Fahrbahn)
        center.x + left.x, 
        center.y + left.y, 
        center.z + left.z,
        
        // Rechts oben (Fahrbahn)
        center.x + right.x, 
        center.y + right.y, 
        center.z + right.z,
        
        // Links unten (Seitenwand)
        center.x + left.x, 
        center.y + left.y, 
        center.z + left.z - this.#roadHeight,
        
        // Rechts unten (Seitenwand)
        center.x + right.x, 
        center.y + right.y, 
        center.z + right.z - this.#roadHeight
      );

      // UVs
      uvs.push(t, 0, t, 1, t, 0, t, 1);

      // Normals
      const roadNormal = new THREE.Vector3(0, 0, 1).applyAxisAngle(tangent, banking);
      normals.push(
        ...roadNormal.toArray(),
        ...roadNormal.toArray(),
        ...normal.toArray(),
        ...normal.toArray()
      );

      if (i > 0) {
        const offset = i * 4;
        indices.push(
          // Oberfläche
          offset - 4, offset, offset - 3,
          offset - 3, offset, offset + 1,
          
          // Linke Seite
          offset - 4, offset - 2, offset,
          offset - 2, offset, offset + 2,
          
          // Rechte Seite
          offset - 3, offset + 1, offset - 1,
          offset - 1, offset + 1, offset + 3
        );
      }
    }

    geometry.setAttribute('position', new THREE.Float32BufferAttribute(vertices, 3));
    geometry.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
    geometry.setAttribute('normal', new THREE.Float32BufferAttribute(normals, 3));
    geometry.setIndex(indices);

    // Materialgruppen
    geometry.clearGroups();
    geometry.addGroup(0, indices.length, 0);

    geometry.computeBoundingSphere();
    geometry.computeBoundingBox();
    geometry.computeVertexNormals();

    return geometry;
  }

  createRoadMaterials() {
    const rainbowTexture = createRainbowTexture();
    rainbowTexture.repeat.set(this.#textureRepeat, 1);
    rainbowTexture.wrapS = THREE.RepeatWrapping;
    rainbowTexture.needsUpdate = true;

    return [
      new THREE.MeshPhongMaterial({ // Fahrbahn
        map: rainbowTexture,
        side: THREE.DoubleSide,
        shininess: 50,
        specular: 0x222222
      })
    ];
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
      marker.position.z += 2; // Über der Strecke
      marker.castShadow = true;
      this.addToScene(marker);
    });
  }

  update(deltaTime) {
    // Texturanimation
    this.splineGroup.traverse(child => {
      if (child.isMesh && child.material[0]?.map) {
        child.material[0].map.offset.x += deltaTime * 0.1;
        child.material[0].map.needsUpdate = true;
      }
    });
  }
}