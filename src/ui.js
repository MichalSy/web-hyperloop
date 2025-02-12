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
    this.container.style.fontFamily = 'Roboto, sans-serif';
    this.container.classList.add('ui-container');

    // Set the inner HTML for UI controls
    this.container.innerHTML = `
      <style>
        .ui-container {
          display: grid;
          grid-template-columns: auto 1fr auto;
          gap: 10px;
          margin-bottom: 15px;
          align-items: center;
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
          border: 1px solid #ccc;
          border-radius: 4px;
          padding: 8px;
          font-family: Roboto, sans-serif;
          box-sizing: border-box; /* Add this to include padding in the width */
        }
        #numPoints {
          grid-column: 2;
        }
        #numPointsValue {
          grid-column: 3;
          width: 2rem;
          text-align: right;
          font-family: Roboto, sans-serif;
        }
        #distanceStep {
          grid-column: 2;
        }
        #distanceStepValue {
          grid-column: 3;
          width: 2rem;
          text-align: right;
          font-family: Roboto, sans-serif;
        }
        #maxAngle {
          grid-column: 2;
        }
        #maxAngleValue {
          grid-column: 3;
          width: 2rem;
          text-align: right;
          font-family: Roboto, sans-serif;
        }
        input[type="range"] {
          -webkit-appearance: none;
          height: 7px;
          border-radius: 5px;
          background: #d3d3d3;
          outline: none;
          -webkit-transition: .2s;
          transition: opacity .2s;
        }

        input[type="range"]::-webkit-slider-thumb {
          -webkit-appearance: none;
          appearance: none;
          width: 16px;
          height: 16px;
          border-radius: 50%;
          background: #32CD32;
          cursor: pointer;
          box-shadow: 0 2px 5px rgba(0, 0, 0, 0.3);
        }

        button {
          grid-column: 1 / 4;
          padding: 10px 20px;
          border-radius: 4px;
          background-color: #32CD32;
          color: white;
          border: none;
          box-shadow: 0 2px 2px 0 rgba(0,0,0,0.14), 0 3px 1px -2px rgba(0,0,0,0.2), 0 1px 5px 0 rgba(0,0,0,0.12);
          cursor: pointer;
          font-family: Roboto, sans-serif;
          font-size: 14px;
          text-transform: uppercase;
        }
        button:hover {
          background-color: #2e8b57;
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
<input class="seed-input" id="seedString" type="text" value="${params.seedString}" autocomplete="off">
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

    this.container.querySelector('#seedString').addEventListener('input', (e) => {
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
