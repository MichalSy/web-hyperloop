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

    // Static seed functions remain unchanged...
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

    createSplinePoints(numPoints, maxAngle, distanceStep) {
        const points = [];
        const trackParams = {
            baseRadius: 120,       // Larger base radius for more space
            radiusVariation: 0.1,  // Subtle radius changes
            heightBase: 30,        // Lower base height
            heightRange: 60,       // Maximum height variation
            controlPoints: 8,      // Fewer control points for smoother curves
            segments: 30           // More segments between control points
        };

        // Generate evenly spaced control points
        const controlPoints = [];
        for (let i = 0; i < trackParams.controlPoints; i++) {
            const angle = (i / trackParams.controlPoints) * Math.PI * 2;
            const t = i / trackParams.controlPoints;
            
            // Smooth radius variation
            const radiusVariation = Math.sin(angle * 2) * trackParams.radiusVariation + 
                                  Math.sin(angle * 3) * trackParams.radiusVariation * 0.5;
            const radius = trackParams.baseRadius * (1 + radiusVariation);
            
            // Height variation with smooth transitions
            const heightVariation = Math.sin(angle * 1.5) * trackParams.heightRange * 0.5 + 
                                  Math.cos(angle * 2.5) * trackParams.heightRange * 0.3;
            
            controlPoints.push({
                x: Math.cos(angle) * radius,
                y: Math.sin(angle) * radius,
                z: trackParams.heightBase + heightVariation
            });
        }

        // Generate smooth path using Catmull-Rom spline
        for (let i = 0; i < controlPoints.length; i++) {
            const p0 = controlPoints[(i - 1 + controlPoints.length) % controlPoints.length];
            const p1 = controlPoints[i];
            const p2 = controlPoints[(i + 1) % controlPoints.length];
            const p3 = controlPoints[(i + 2) % controlPoints.length];

            for (let j = 0; j < trackParams.segments; j++) {
                const t = j / trackParams.segments;
                const t2 = t * t;
                const t3 = t2 * t;

                // Catmull-Rom coefficients
                const c0 = -0.5 * t3 + t2 - 0.5 * t;
                const c1 = 1.5 * t3 - 2.5 * t2 + 1.0;
                const c2 = -1.5 * t3 + 2.0 * t2 + 0.5 * t;
                const c3 = 0.5 * t3 - 0.5 * t2;

                points.push({
                    x: c0 * p0.x + c1 * p1.x + c2 * p2.x + c3 * p3.x,
                    y: c0 * p0.y + c1 * p1.y + c2 * p2.y + c3 * p3.y,
                    z: c0 * p0.z + c1 * p1.z + c2 * p2.z + c3 * p3.z
                });
            }
        }

        // Apply final smoothing
        const smoothedPoints = [];
        const smoothingWindow = 3;
        for (let i = 0; i < points.length; i++) {
            let sumX = 0, sumY = 0, sumZ = 0;
            let count = 0;
            
            for (let j = -smoothingWindow; j <= smoothingWindow; j++) {
                const idx = (i + j + points.length) % points.length;
                sumX += points[idx].x;
                sumY += points[idx].y;
                sumZ += points[idx].z;
                count++;
            }
            
            smoothedPoints.push({
                x: sumX / count,
                y: sumY / count,
                z: sumZ / count
            });
        }

        return smoothedPoints;
    }

    createSplineGroup(numPoints, maxAngle, distanceStep) {
        const group = new THREE.Group();
        const splinePoints = this.createSplinePoints(numPoints, maxAngle, distanceStep);
        const vectors = splinePoints.map(p => new THREE.Vector3(p.x, p.y, p.z));

        this.startPointCoord.copy(vectors[0]);

        const splineCurve = new THREE.CatmullRomCurve3(vectors, true, 'centripetal');
        const smoothPoints = splineCurve.getPoints(1500);

        // Calculate road edges
        const roadWidth = 12; // Wider road
        const numRoadPoints = 10000;
        const leftPoints = [];
        const rightPoints = [];

        for (let i = 0; i <= numRoadPoints; i++) {
            const t = i / numRoadPoints;
            const point = splineCurve.getPoint(t);
            const tangent = splineCurve.getTangent(t);
            const normal = new THREE.Vector3(-tangent.y, tangent.x, 0).normalize();

            // Smooth banking calculation
            const lookAhead = Math.min(t + 0.05, 1);
            const lookBehind = Math.max(t - 0.05, 0);
            const nextTangent = splineCurve.getTangent(lookAhead);
            const prevTangent = splineCurve.getTangent(lookBehind);
            
            const forwardCurve = tangent.angleTo(nextTangent);
            const backwardCurve = tangent.angleTo(prevTangent);
            const curvature = Math.min(1, (forwardCurve + backwardCurve) * 0.7);
            
            const maxBankAngle = Math.PI * 0.2; // 36 degrees max banking
            const bankingAngle = curvature * maxBankAngle;
            
            const bankingAxis = tangent;
            const bankingQuat = new THREE.Quaternion().setFromAxisAngle(bankingAxis, bankingAngle);
            const bankedNormal = normal.clone().applyQuaternion(bankingQuat);

            leftPoints.push(point.clone().add(bankedNormal.multiplyScalar(roadWidth)));
            rightPoints.push(point.clone().add(bankedNormal.multiplyScalar(-roadWidth)));
        }

        // Create road mesh with rainbow colors
        const roadGeometry = new THREE.BufferGeometry();
        const roadVertices = [];
        const roadIndices = [];
        const colors = [];

        const rainbowColors = [
            new THREE.Color(0xff0000), // Red
            new THREE.Color(0xff8800), // Orange
            new THREE.Color(0xffff00), // Yellow
            new THREE.Color(0x00ff00), // Green
            new THREE.Color(0x0088ff), // Blue
            new THREE.Color(0x8800ff)  // Purple
        ];

        for (let i = 0; i < leftPoints.length; i++) {
            roadVertices.push(
                leftPoints[i].x, leftPoints[i].y, leftPoints[i].z,
                rightPoints[i].x, rightPoints[i].y, rightPoints[i].z
            );

            const colorIndex = Math.floor((i / leftPoints.length) * rainbowColors.length);
            const nextColorIndex = (colorIndex + 1) % rainbowColors.length;
            const mixFactor = (i / leftPoints.length) * rainbowColors.length - colorIndex;
            
            const color = new THREE.Color().lerpColors(
                rainbowColors[colorIndex],
                rainbowColors[nextColorIndex],
                mixFactor
            );
            
            colors.push(color.r, color.g, color.b);
            colors.push(color.r, color.g, color.b);

            if (i < leftPoints.length - 1) {
                const baseIndex = i * 2;
                roadIndices.push(
                    baseIndex, baseIndex + 1, baseIndex + 2,
                    baseIndex + 1, baseIndex + 3, baseIndex + 2
                );
            }
        }

        roadGeometry.setAttribute('position', new THREE.Float32BufferAttribute(roadVertices, 3));
        roadGeometry.setAttribute('color', new THREE.Float32BufferAttribute(colors, 3));
        roadGeometry.setIndex(roadIndices);
        roadGeometry.computeVertexNormals();

        // Create glowing road material
        const roadMaterial = new THREE.MeshStandardMaterial({
            vertexColors: true,
            roughness: 0.2,
            metalness: 0.8,
            side: THREE.DoubleSide,
            emissive: 0x444444,
            emissiveIntensity: 0.5
        });

        const roadMesh = new THREE.Mesh(roadGeometry, roadMaterial);
        group.add(roadMesh);

        // Add glowing edges
        const edgeLineMaterial = new THREE.LineBasicMaterial({ 
            color: 0xffffff,
            transparent: true,
            opacity: 0.8
        });
        
        const leftGeometry = new THREE.BufferGeometry().setFromPoints(leftPoints);
        const rightGeometry = new THREE.BufferGeometry().setFromPoints(rightPoints);
        group.add(new THREE.Line(leftGeometry, edgeLineMaterial));
        group.add(new THREE.Line(rightGeometry, edgeLineMaterial));

        return group;
    }

    adjustCameraToFitSpline(splineGroup) {
        const box = new THREE.Box3().setFromObject(splineGroup);
        const sphere = new THREE.Sphere();
        box.getBoundingSphere(sphere);
        const center = sphere.center;
        const splineRadius = sphere.radius;
        
        const player = GameObjectManager.getInstance().getObjectByType(Player);
        const camera = this.gameEngine.getCamera();
        const fov = THREE.MathUtils.degToRad(camera.fov);
        const margin = 0.7;
        const distance = (splineRadius * margin) / Math.sin(fov / 2);
        
        const offset = new THREE.Vector3(0, splineRadius * 0.3, distance * 1.2);
        player.getControls().getObject().position.copy(center.clone().add(offset));
        
        camera.far = Math.max(distance * 2.5, this.MIN_FAR);
        camera.updateProjectionMatrix();
        camera.lookAt(center);
    }

    updateSpline(numPoints, maxAngle, distanceStep, seed) {
        this.setSeed(seed);
        const gameEngine = GameEngine.getInstance();
        const scene = gameEngine.getScene();
        if (this.splineGroup) scene.remove(this.splineGroup);
        this.splineGroup = this.createSplineGroup(numPoints, maxAngle, distanceStep);
        const player = GameObjectManager.getInstance().getObjectByType(Player);
        player.setInputSplineGroup(this.splineGroup);
        scene.add(this.splineGroup);
        this.adjustCameraToFitSpline(this.splineGroup);
        return this.splineGroup;
    }

    getStartPointCoord() {
        return this.startPointCoord;
    }

    update(deltaTime) {
        // Add any per-frame update logic here if needed
    }
}
