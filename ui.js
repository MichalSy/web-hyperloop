// ui.js
import { GameObject } from './GameObject.js';
import { GameObjectManager } from './GameObjectManager.js';
import { SplineGraph } from './SplineGraph.js';

export class UI extends GameObject {
  constructor() {
    super();
    this.numPoints = 50;
    this.distanceStep = 10;
    this.maxAngle = 60;
    this.seedString = "hanna";

    // Bind the methods to the instance
    this.onUIUpdate = this.onUIUpdate.bind(this);
    this.onSeedChange = this.onSeedChange.bind(this);
    this.resetView = this.resetView.bind(this);

    // Create a container for the UI
    this.container = document.createElement('div');
    this.container.id = 'ui-container';
    this.container.classList.add('ui-container');

    // Set the inner HTML for UI controls
    this.container.innerHTML = `
      <label class="slider-label">Number of Points:</label>
      <input id="numPoints" type="range" min="1" max="100" step="1" value="${this.numPoints}">
      <span id="numPointsValue">${this.numPoints}</span>
      <label class="slider-label">Distance Step:</label>
      <input id="distanceStep" type="range" min="0.1" max="10" step="0.1" value="${this.distanceStep}">
      <span id="distanceStepValue">${this.distanceStep}</span>
      <label class="slider-label">Max Angle:</label>
      <input id="maxAngle" type="range" min="0" max="80" step="1" value="${this.maxAngle}">
      <span id="maxAngleValue">${this.maxAngle}</span>
      <label class="seed-label">Seed:</label>
      <input class="seed-input" id="seedString" type="text" value="${this.seedString}" autocomplete="off">
      <button id="resetView">Reset Focus</button>
    `;

    document.body.appendChild(this.container);

    // Setup event listeners for UI controls
    this.container.querySelector('#numPoints').addEventListener('input', (e) => {
      const newValue = Number(e.target.value);
      this.numPoints = newValue;
      this.onUIUpdate({ numPoints: newValue });
      this.container.querySelector('#numPointsValue').textContent = newValue;
    });

    this.container.querySelector('#distanceStep').addEventListener('input', (e) => {
      const newValue = Number(e.target.value);
      this.distanceStep = newValue;
      this.onUIUpdate({ distanceStep: newValue });
      this.container.querySelector('#distanceStepValue').textContent = newValue;
    });

    this.container.querySelector('#maxAngle').addEventListener('input', (e) => {
      const newValue = Number(e.target.value);
      this.maxAngle = newValue;
      this.onUIUpdate({ maxAngle: newValue });
      this.container.querySelector('#maxAngleValue').textContent = newValue;
    });

    this.container.querySelector('#seedString').addEventListener('input', (e) => {
      const newValue = e.target.value;
      this.seedString = newValue;
      this.onSeedChange(newValue);
    });

    this.container.querySelector('#resetView').addEventListener('click', () => {
      this.resetView();
    });
  }

  onUIUpdate(changedParams) {
    const gameObjectManager = GameObjectManager.getInstance();
    const splineGraph = gameObjectManager.getObjectByType(SplineGraph);
    if (changedParams.numPoints !== undefined) this.numPoints = changedParams.numPoints;
    if (changedParams.distanceStep !== undefined) this.distanceStep = changedParams.distanceStep;
    if (changedParams.maxAngle !== undefined) this.maxAngle = changedParams.maxAngle;
    splineGraph.updateSpline(this.numPoints, this.maxAngle, this.distanceStep, this.seedString);
  }

  onSeedChange(newSeed) {
    const gameObjectManager = GameObjectManager.getInstance();
    const splineGraph = gameObjectManager.getObjectByType(SplineGraph);
    this.seedString = newSeed;
    splineGraph.updateSpline(this.numPoints, this.maxAngle, this.distanceStep, this.seedString);
  }

  resetView() {
    const gameObjectManager = GameObjectManager.getInstance();
    const splineGraph = gameObjectManager.getObjectByType(SplineGraph);
    splineGraph.adjustCameraToFitSpline(splineGraph.splineGroup);
  }

  update(deltaTime) {
    // Optional: Update dynamic UI elements or animations if needed.
  }
}
