// ui.js
import { GameObject } from './GameObject.js';

export class UI extends GameObject {
  constructor(params, onUIUpdate, resetView, onSeedChange) {
    super();
    this.params = params;
    this.onUIUpdate = onUIUpdate;
    this.resetView = resetView;
    this.onSeedChange = onSeedChange;

    // Create a container for the UI
    this.container = document.createElement('div');
    this.container.id = 'ui-container';
    this.container.style.position = 'absolute';
    this.container.style.top = '10px';
    this.container.style.left = '10px';
    this.container.style.backgroundColor = 'rgba(0, 0, 0, 0.5)';
    this.container.style.padding = '10px';
    this.container.style.color = 'white';
    this.container.style.fontFamily = 'sans-serif';
    this.container.classList.add('ui-container');

    // Set the inner HTML for UI controls
    this.container.innerHTML = `
      <style>
        .ui-container {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 10px;
          margin-bottom: 15px;
        }
        .slider-label {
          text-align: left;
          grid-column: 1;
        }
        .seed-label {
          text-align: left;
          grid-column: 1;
        }
        .seed-input {
          grid-column: 2 / 4;
        }
        #numPoints {
          grid-column: 2;
        }
        #numPointsValue {
          grid-column: 3;
          width: 2rem;
          text-align: right;
        }
        #distanceStep {
          grid-column: 2;
        }
        #distanceStepValue {
          grid-column: 3;
          width: 2rem;
          text-align: right;
        }
        #maxAngle {
          grid-column: 2;
        }
        #maxAngleValue {
          grid-column: 3;
          width: 2rem;
          text-align: right;
        }
      </style>
      <label class="slider-label">Number of Points:</label>
      <input id="numPoints" type="range" min="1" max="100" step="1" value="${params.numPoints}">
      <span id="numPointsValue">${params.numPoints}</span>
      <label class="slider-label">Distance Step:</label>
      <input id="distanceStep" type="range" min="0.1" max="10" step="0.1" value="${params.distanceStep}">
      <span id="distanceStepValue">${params.distanceStep}</span>
      <label class="slider-label">Max Angle:</label>
      <input id="maxAngle" type="range" min="0" max="80" step="1" value="${params.maxAngle}">
      <span id="maxAngleValue">${params.maxAngle}</span>
      <label class="seed-label">Seed:</label>
      <input class="seed-input" id="seedString" type="text" value="${params.seedString}">
      <button style="grid-column: 1 / 4;" id="resetView">Reset Focus</button>
    `;

    document.body.appendChild(this.container);

    // Setup event listeners for UI controls
    this.container.querySelector('#numPoints').addEventListener('input', (e) => {
      const newValue = Number(e.target.value);
      this.params.numPoints = newValue;
      this.onUIUpdate({ numPoints: newValue });
      this.container.querySelector('#numPointsValue').textContent = newValue;
    });

    this.container.querySelector('#distanceStep').addEventListener('input', (e) => {
      const newValue = Number(e.target.value);
      this.params.distanceStep = newValue;
      this.onUIUpdate({ distanceStep: newValue });
      this.container.querySelector('#distanceStepValue').textContent = newValue;
    });

    this.container.querySelector('#maxAngle').addEventListener('input', (e) => {
      const newValue = Number(e.target.value);
      this.params.maxAngle = newValue;
      this.onUIUpdate({ maxAngle: newValue });
      this.container.querySelector('#maxAngleValue').textContent = newValue;
    });

    this.container.querySelector('#seedString').addEventListener('change', (e) => {
      const newValue = e.target.value;
      this.params.seedString = newValue;
      this.onSeedChange(newValue);
    });

    this.container.querySelector('#resetView').addEventListener('click', () => {
      this.resetView();
    });
  }

  update(deltaTime) {
    // Optional: Update dynamic UI elements or animations if needed.
  }
}
