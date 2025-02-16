// TrackViewer.js
import * as THREE from 'three';
import { GameObject } from './GameObject.js';

export class TrackViewer extends GameObject {
  // Private configuration
  #checkpointCount = 20;      // Anzahl der Checkpoints/Segmente
  #stepDistance = 50;         // Feste Länge jedes Segments
  #maxAngleDeg = 120;         // Maximale Abweichung in Grad für jeden Schritt
  #tolerance = 0.1;           // Toleranz für numerische Vergleiche

  constructor() {
    super();
    this.checkpoints = [];
    this.lineGroup = new THREE.Group();
    this.labelGroup = new THREE.Group();
    this.initCheckpoints();
  }

  initCheckpoints() {
    // Versuche solange, bis ein gültiger, geschlossener Pfad generiert wurde.
    let positions = null;
    while (!positions) {
      positions = this.generateClosedChain(
        this.#checkpointCount,
        this.#stepDistance,
        this.#maxAngleDeg,
        this.#tolerance
      );
    }

    // Visualisiere die Checkpoints.
    // Start-Checkpoint (Index 0) = blau, letzter Checkpoint (Index count-1) = rot, alle anderen = grün.
    positions.forEach((pos, i) => {
      const next = positions[(i + 1) % positions.length]; // Schließt den Pfad
      const direction = new THREE.Vector3().subVectors(next, pos).normalize();
      let sphereColor = 0x00ff00; // Standard: grün
      if (i === 0) sphereColor = 0x0000ff;     // Start: blau
      if (i === positions.length - 1) sphereColor = 0xff0000; // Letzter: rot
      const checkpointGroup = this.createCheckpoint(pos, direction, sphereColor);
      this.checkpoints.push(checkpointGroup);
      this.addToScene(checkpointGroup);
    });

    // Erzeuge für jedes Segment eine lila Linie mit einem Textsprite, das "50.00" anzeigt.
    for (let i = 0; i < positions.length; i++) {
      const current = positions[i];
      const next = positions[(i + 1) % positions.length];
      const segmentGeometry = new THREE.BufferGeometry().setFromPoints([current, next]);
      const segmentMaterial = new THREE.LineBasicMaterial({ color: 0x800080 });
      const segmentLine = new THREE.Line(segmentGeometry, segmentMaterial);
      this.lineGroup.add(segmentLine);
      
      // Textlabel in der Mitte des Segments
      const midpoint = new THREE.Vector3().addVectors(current, next).multiplyScalar(0.5);
      const textSprite = this.createTextSprite("50.00");
      textSprite.position.copy(midpoint);
      this.labelGroup.add(textSprite);
    }
    this.addToScene(this.lineGroup);
    this.addToScene(this.labelGroup);
  }

  /**
   * Generiert eine geschlossene Kette von Checkpoints mit exakt fixen Schritten.
   * Für die ersten (checkpointCount - 1) Schritte werden zufällige Richtungen (maximal #maxAngleDeg)
   * gewählt. Der letzte Schritt wird so berechnet, dass der Pfad geschlossen ist.
   * Wird dabei festgestellt, dass der letzte Schritt (innerhalb einer Toleranz)
   * nicht exakt die Länge stepDistance hat oder der Winkel zur vorletzten Richtung zu groß ist,
   * wird der Pfad verworfen.
   *
   * @param {number} checkpointCount - Anzahl der Checkpoints/Segmente.
   * @param {number} stepDistance - Fixe Länge jedes Schrittes.
   * @param {number} maxAngleDeg - Maximale Abweichung in Grad.
   * @param {number} tolerance - Numerische Toleranz.
   * @returns {THREE.Vector3[]|null} - Array der Checkpoint-Positionen oder null, wenn nicht gültig.
   */
  generateClosedChain(checkpointCount, stepDistance, maxAngleDeg, tolerance) {
    const maxAttempts = 10000;
    const maxAngleRad = THREE.MathUtils.degToRad(maxAngleDeg);
    for (let attempt = 0; attempt < maxAttempts; attempt++) {
      const v = []; // Array der Schrittvektoren
      // Erster Schritt in +X-Richtung
      v.push(new THREE.Vector3(1, 0, 0).multiplyScalar(stepDistance));
      
      // Generiere die Schritte 1 bis (checkpointCount - 2)
      for (let i = 1; i < checkpointCount - 1; i++) {
        const prevDir = v[i - 1].clone().normalize();
        const newDir = this.randomDirectionInCone(prevDir, maxAngleRad);
        v.push(newDir.multiplyScalar(stepDistance));
      }
      
      // Summe der ersten (checkpointCount - 1) Schritte
      const sum = new THREE.Vector3(0, 0, 0);
      for (let i = 0; i < checkpointCount - 1; i++) {
        sum.add(v[i]);
      }
      // Erforderlicher letzter Schritt, um den Pfad zu schließen
      const vLast = sum.clone().negate();
      const lastLength = vLast.length();
      if (Math.abs(lastLength - stepDistance) > tolerance) {
        continue; // Letzter Schritt passt nicht in der Länge.
      }
      // Prüfe den Winkel des letzten Schrittes relativ zum vorletzten
      const prevLastDir = v[checkpointCount - 2].clone().normalize();
      const angle = prevLastDir.angleTo(vLast);
      if (angle > maxAngleRad) {
        continue; // Winkelbedingung nicht erfüllt.
      }
      // Akzeptiere den Pfad: Letzten Schritt normieren und auf genau stepDistance setzen.
      v.push(vLast.normalize().multiplyScalar(stepDistance));
      
      // Berechne die Positionen durch kumulative Summierung.
      const positions = [];
      let pos = new THREE.Vector3(0, 0, 0);
      positions.push(pos.clone());
      for (let i = 0; i < checkpointCount; i++) {
        pos = pos.clone().add(v[i]);
        positions.push(pos.clone());
      }
      // Letzter Punkt muss (innerhalb der Toleranz) dem Start entsprechen.
      if (positions[positions.length - 1].distanceTo(positions[0]) > tolerance) {
        continue;
      }
      // Entferne den doppelten letzten Punkt und gib die Checkpoints zurück.
      positions.pop();
      return positions;
    }
    return null;
  }

  /**
   * Generiert einen zufälligen normierten Richtungsvektor innerhalb eines Kegels
   * um baseDirection mit maximalem Winkel maxAngleRad.
   *
   * @param {THREE.Vector3} baseDirection - Basisrichtung (normiert).
   * @param {number} maxAngleRad - Maximaler Winkel in Radiant.
   * @returns {THREE.Vector3} - Neuer, zufälliger normierter Richtungsvektor.
   */
  randomDirectionInCone(baseDirection, maxAngleRad) {
    const cosTheta = THREE.MathUtils.lerp(Math.cos(maxAngleRad), 1, Math.random());
    const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
    const phi = Math.random() * 2 * Math.PI;
    const localDir = new THREE.Vector3(
      sinTheta * Math.cos(phi),
      sinTheta * Math.sin(phi),
      cosTheta
    );
    const quaternion = new THREE.Quaternion().setFromUnitVectors(new THREE.Vector3(0, 0, 1), baseDirection);
    localDir.applyQuaternion(quaternion);
    return localDir.normalize();
  }

  /**
   * Erzeugt die Visualisierung eines Checkpoints als Gruppe aus einer Sphere und einem Pfeil.
   *
   * @param {THREE.Vector3} position - Position des Checkpoints.
   * @param {THREE.Vector3} direction - Normierter Richtungsvektor zum nächsten Checkpoint.
   * @param {number} sphereColor - Farbe der Kugel (Hex-Wert).
   * @returns {THREE.Group} - Gruppe, die die Kugel und den Pfeil enthält.
   */
  createCheckpoint(position, direction, sphereColor) {
    const sphereGeometry = new THREE.SphereGeometry(1, 32, 32);
    const sphereMaterial = new THREE.MeshBasicMaterial({ color: sphereColor });
    const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
    sphere.position.copy(position);
    
    const arrowLength = 3;
    const arrowColor = 0x0000ff;
    const arrowHelper = new THREE.ArrowHelper(direction, position, arrowLength, arrowColor);
    
    const checkpointGroup = new THREE.Group();
    checkpointGroup.add(sphere);
    checkpointGroup.add(arrowHelper);
    return checkpointGroup;
  }

  /**
   * Erstellt ein Textsprite mittels Canvas, das den übergebenen Text anzeigt.
   *
   * @param {string} message - Der anzuzeigende Text.
   * @returns {THREE.Sprite} - Das resultierende Textsprite.
   */
  createTextSprite(message) {
    const canvas = document.createElement('canvas');
    const context = canvas.getContext('2d');
    const fontSize = 24;
    context.font = `Bold ${fontSize}px Arial`;
    const metrics = context.measureText(message);
    const textWidth = metrics.width;
    canvas.width = textWidth;
    canvas.height = fontSize * 1.4;
    context.font = `Bold ${fontSize}px Arial`;
    context.fillStyle = "rgba(255,255,255,1.0)";
    context.fillText(message, 0, fontSize);
    const texture = new THREE.Texture(canvas);
    texture.needsUpdate = true;
    const spriteMaterial = new THREE.SpriteMaterial({ map: texture, transparent: true });
    const sprite = new THREE.Sprite(spriteMaterial);
    sprite.scale.set(canvas.width * 0.2, canvas.height * 0.2, 1);
    return sprite;
  }

  update(deltaTime) {
    // Optional: Update-Logik falls benötigt.
  }
}
