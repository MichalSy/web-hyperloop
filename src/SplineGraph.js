// SplineGraph.js
import * as THREE from 'three';
import { GameObject } from './GameObject.js';
import { GameObjectManager } from './GameObjectManager.js';
import { Player } from './Player.js';
import GameEngine from './GameEngine.js';

export class SplineGraph extends GameObject {
    constructor() {
        super();
        this.splineGroup = null;
        this.startPointCoord = new THREE.Vector3();
        this.MIN_FAR = 1500; // Minimum value for camera's far clipping plane
        this.seededRandom = null;
    }

    // --- Static Seed Functions ---
    static cyrb128(str) {
        let h1 = 1779033703, h2 = 3144134277, h3 = 1013904242, h4 = 2773480762;
        for (let i = 0, k; i < str.length; i++) {
            k = str.charCodeAt(i);
            h1 = h2 ^ Math.imul(h1 ^ k, 597399067);
            h2 = h3 ^ Math.imul(h2 ^ k, 2869860233);
            h3 = h4 ^ Math.imul(h3 ^ k, 951274213);
            h4 = h1 ^ Math.imul(h4 ^ k, 2716044179);
        }
        return [(h1 >>> 0), (h2 >>> 0), (h3 >>> 0), (h4 >>> 0)];
    }

    static mulberry32(a) {
        return function() {
            var t = a += 0x6D2B79F5;
            t = Math.imul(t ^ (t >>> 15), t | 1);
            t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
            return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
        }
    }

    setSeed(newSeed) {
        const seedArray = SplineGraph.cyrb128(newSeed);
        this.seededRandom = SplineGraph.mulberry32(seedArray[0]);
    }

    seededRandFloat(min, max) {
        return this.seededRandom() * (max - min) + min;
    }

    // Returns a random unit vector within a cone around the given forward vector.
    randomDirectionWithinCone(forward, maxAngleDegrees) {
        const maxAngleRad = THREE.MathUtils.degToRad(maxAngleDegrees);
        const cosTheta = THREE.MathUtils.lerp(Math.cos(maxAngleRad), 1, this.seededRandom());
        const sinTheta = Math.sqrt(1 - cosTheta * cosTheta);
        const phi = this.seededRandom() * 2 * Math.PI;
        const x = sinTheta * Math.cos(phi);
        const y = sinTheta * Math.sin(phi);
        const z = cosTheta;
        let dir = new THREE.Vector3(x, y, z);
        const defaultAxis = new THREE.Vector3(0, 0, 1);
        const quaternion = new THREE.Quaternion().setFromUnitVectors(defaultAxis, forward.clone().normalize());
        dir.applyQuaternion(quaternion);
        return dir.normalize();
    }

    // Generates a closing path from the last open spline point back to the start point.
    createClosingPath(lastPoint, startPoint, penultimatePoint, openDirection, stepDistance, maxAngleDeviation) {
        const path = [];
        let current = new THREE.Vector3(lastPoint.x, lastPoint.y, lastPoint.z);
        const target = new THREE.Vector3(startPoint.x, startPoint.y, startPoint.z);
        const penultimate = new THREE.Vector3(penultimatePoint.x, penultimatePoint.y, penultimatePoint.z);
        
        let currentForward = new THREE.Vector3().subVectors(current, penultimate).normalize();
        const initialDistance = current.distanceTo(target);
        const maxSteps = 1000;
        let steps = 0;
        
        while (current.distanceTo(target) > stepDistance && steps < maxSteps) {
            const d = current.distanceTo(target);
            const biasFactor = 0.1 + 0.5 * (1 - Math.min(d / initialDistance, 1));
            const toTarget = new THREE.Vector3().subVectors(target, current).normalize();
            currentForward.lerp(toTarget, biasFactor).normalize();
            
            const randomDir = this.randomDirectionWithinCone(currentForward, maxAngleDeviation);
            const candidate = current.clone().add(randomDir.multiplyScalar(stepDistance));
            
            if (candidate.distanceTo(target) < stepDistance) {
                const idealBackwards = openDirection.clone().negate();
                const finalDirection = this.randomDirectionWithinCone(idealBackwards, maxAngleDeviation);
                const finalCandidate = target.clone().add(finalDirection.multiplyScalar(stepDistance));
                path.push({ x: finalCandidate.x, y: finalCandidate.y, z: finalCandidate.z });
                break;
            }
            
            current.copy(candidate);
            path.push({ x: current.x, y: current.y, z: current.z });
            steps++;
        }
        return path;
    }

    // Generates an open spline with random deviations and appends a closing path.
    createSplinePoints(numPoints, maxAngle, distanceStep) {
        const points = [];
        points.push({ x: 0, y: 0, z: 0 });
        let currentAngleXY = 0;
        let currentAngleZ = 0;
        
        for (let i = 1; i < numPoints; i++) {
            const angleChangeXY = this.seededRandFloat(-maxAngle, maxAngle);
            const angleChangeZ = this.seededRandFloat(-maxAngle, maxAngle);
            currentAngleXY += angleChangeXY;
            currentAngleZ += angleChangeZ;
            const angleRadXY = THREE.MathUtils.degToRad(currentAngleXY);
            const angleRadZ = THREE.MathUtils.degToRad(currentAngleZ);
            const lastPoint = points[points.length - 1];
            const newX = lastPoint.x + distanceStep * Math.cos(angleRadXY);
            const newY = lastPoint.y + distanceStep * Math.sin(angleRadXY);
            const newZ = lastPoint.z + distanceStep * Math.sin(angleRadZ);
            points.push({ x: newX, y: newY, z: newZ });
        }
        
        let openDirection = new THREE.Vector3(0, 0, 1);
        if (points.length >= 2) {
            const start = new THREE.Vector3(points[0].x, points[0].y, points[0].z);
            const second = new THREE.Vector3(points[1].x, points[1].y, points[1].z);
            openDirection = new THREE.Vector3().subVectors(second, start).normalize();
        }
        
        if (points.length >= 2) {
            const startPoint = points[0];
            const lastPoint = points[points.length - 1];
            const penultimatePoint = points[points.length - 2];
            const closingPath = this.createClosingPath(lastPoint, startPoint, penultimatePoint, openDirection, distanceStep, maxAngle);
            for (let pt of closingPath) {
                points.push(pt);
            }
        }
        return points;
    }

    // Creates a spline group (a THREE.Group) containing spheres, the spline line, and arrow helpers.
    createSplineGroup(numPoints, maxAngle, distanceStep) {
        const group = new THREE.Group();
        const splinePoints = this.createSplinePoints(numPoints, maxAngle, distanceStep);
        const vectors = splinePoints.map(p => new THREE.Vector3(p.x, p.y, p.z));
        
        // Save the start point.
        this.startPointCoord.copy(vectors[0]);
        
        // Create spheres: first point dark green, last point dark red, others blue.
        vectors.forEach((vector, i) => {
            const sphereGeometry = new THREE.SphereGeometry(0.5, 32, 32);
            let sphereMaterial;
            if (i === 0) {
                sphereMaterial = new THREE.MeshBasicMaterial({ color: 0x006400 });
            } else if (i === vectors.length - 1) {
                sphereMaterial = new THREE.MeshBasicMaterial({ color: 0x8B0000 });
            } else {
                sphereMaterial = new THREE.MeshBasicMaterial({ color: 0x0000ff });
            }
            const sphere = new THREE.Mesh(sphereGeometry, sphereMaterial);
            sphere.position.copy(vector);
            group.add(sphere);
        });
        
        // Create a smooth Catmull-Rom spline from the points.
        const splineCurve = new THREE.CatmullRomCurve3(vectors, true, 'centripetal');
        const smoothPoints = splineCurve.getPoints(200);
        const smoothGeometry = new THREE.BufferGeometry().setFromPoints(smoothPoints);
        const lineMaterial = new THREE.LineBasicMaterial({ color: 0x39FF14 });
        const smoothLine = new THREE.Line(smoothGeometry, lineMaterial);
        group.add(smoothLine);
        
        // Visualize view directions at each sphere.
        const arrowLength = 2;
        let openDir = new THREE.Vector3(0, 0, 1);
        if (vectors.length >= 2) {
            openDir = new THREE.Vector3().subVectors(vectors[1], vectors[0]).normalize();
        }
        for (let i = 0; i < vectors.length; i++) {
            const pos = vectors[i];
            let forwardDir;
            if (i < vectors.length - 1) {
                forwardDir = new THREE.Vector3().subVectors(vectors[i + 1], pos).normalize();
            } else {
                forwardDir = openDir.clone().negate();
            }
            const backwardDir = forwardDir.clone().negate();
            const arrowForward = new THREE.ArrowHelper(forwardDir, pos, arrowLength, 0x00ff00);
            const arrowBackward = new THREE.ArrowHelper(backwardDir, pos, arrowLength, 0xff0000);
            group.add(arrowForward);
            group.add(arrowBackward);
        }
        return group;
    }

    // Passt die Kamera an die Spline-Route an
    adjustCameraToFitSpline(splineGroup) {
        const box = new THREE.Box3().setFromObject(splineGroup);
        const sphere = new THREE.Sphere();
        box.getBoundingSphere(sphere);
        const center = sphere.center;
        const splineRadius = sphere.radius;
        
        const player = GameObjectManager.getInstance().getObjectByType(Player);
        const camera = this.gameEngine.getCamera();
        const fov = THREE.MathUtils.degToRad(camera.fov);
        const margin = 0.7; // Adjusted margin for better visibility
        const distance = (splineRadius * margin) / Math.sin(fov / 2);
        
        // Position camera slightly above and behind to get a better overview
        const offset = new THREE.Vector3(
            0,
            splineRadius * 0.3, // Lift camera up a bit
            distance * 1.2 // Move camera back a bit more
        );
        player.getControls().getObject().position.copy(center.clone().add(offset));
        
        // Set far clipping plane to ensure everything is visible
        camera.far = Math.max(distance * 2.5, this.MIN_FAR);
        camera.updateProjectionMatrix();
        
        camera.lookAt(center);
    }

    // Updates the spline and adjusts the camera
    updateSpline(numPoints, maxAngle, distanceStep, seed) {
        this.setSeed(seed);
        const gameEngine = GameEngine.getInstance();
        const scene = gameEngine.getScene();
        if (this.splineGroup) scene.remove(this.splineGroup);
        this.splineGroup = this.createSplineGroup(numPoints, maxAngle, distanceStep);
        // Set the current spline group for the input logic:
        const player = GameObjectManager.getInstance().getObjectByType(Player);
        player.setInputSplineGroup(this.splineGroup);
        scene.add(this.splineGroup);
        this.adjustCameraToFitSpline(this.splineGroup);
        return this.splineGroup;
    }

    // Getter for start point coordinates
    getStartPointCoord() {
        return this.startPointCoord;
    }

    // GameObject update method
    update(deltaTime) {
        // Add any per-frame update logic here if needed
    }
}
