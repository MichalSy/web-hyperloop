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
    
    // Set the inner HTML for UI controls
    this.container.innerHTML = `
      <div>
        <label>Number of Points: <input id="numPoints" type="number" value="${params.numPoints}"></label>
      </div>
      <div>
        <label>Distance Step: <input id="distanceStep" type="number" value="${params.distanceStep}"></label>
      </div>
      <div>
        <label>Max Angle: <input id="maxAngle" type="number" value="${params.maxAngle}"></label>
      </div>
      <div>
        <label>Seed: <input id="seedString" type="text" value="${params.seedString}"></label>
      </div>
      <button id="resetView">Reset Focus</button>
    `;
    
    document.body.appendChild(this.container);
    
    // Setup event listeners for UI controls
    this.container.querySelector('#numPoints').addEventListener('change', (e) => {
      const newValue = Number(e.target.value);
      this.params.numPoints = newValue;
      this.onUIUpdate({ numPoints: newValue });
    });
    
    this.container.querySelector('#distanceStep').addEventListener('change', (e) => {
      const newValue = Number(e.target.value);
      this.params.distanceStep = newValue;
      this.onUIUpdate({ distanceStep: newValue });
    });
    
    this.container.querySelector('#maxAngle').addEventListener('change', (e) => {
      const newValue = Number(e.target.value);
      this.params.maxAngle = newValue;
      this.onUIUpdate({ maxAngle: newValue });
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
