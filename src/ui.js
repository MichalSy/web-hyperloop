// ui.js
export function createUI(params, onUpdate, onFocus, onSeedChange) {
    // params: { numPoints, distanceStep, maxAngle, seedString }
    const uiDiv = document.createElement('div');
    uiDiv.id = 'ui';
    uiDiv.style.position = 'absolute';
    uiDiv.style.top = '10px';
    uiDiv.style.left = '10px';
    uiDiv.style.background = 'rgba(255,255,255,0.8)';
    uiDiv.style.padding = '10px';
    uiDiv.style.fontFamily = 'Arial, sans-serif';
    uiDiv.innerHTML = `
      <label for="pointsSlider">Punktanzahl: <span id="pointsValue">${params.numPoints}</span></label><br>
      <input id="pointsSlider" type="range" min="10" max="200" step="1" value="${params.numPoints}"><br><br>
      <label for="distanceSlider">Punktabstand: <span id="distanceValue">${params.distanceStep}</span></label><br>
      <input id="distanceSlider" type="range" min="1" max="20" step="0.1" value="${params.distanceStep}"><br><br>
      <label for="angleSlider">Max Winkel (Grad): <span id="angleValue">${params.maxAngle}</span></label><br>
      <input id="angleSlider" type="range" min="5" max="90" step="1" value="${params.maxAngle}"><br><br>
      <label for="seedInput">Seed:</label>
      <input id="seedInput" type="text" value="${params.seedString}"><br><br>
      <button id="focusButton">Focus Start</button>
    `;
    uiDiv.addEventListener('click', e => e.stopPropagation());
    document.body.appendChild(uiDiv);
    
    const pointsSlider = document.getElementById('pointsSlider');
    const distanceSlider = document.getElementById('distanceSlider');
    const angleSlider = document.getElementById('angleSlider');
    const seedInput = document.getElementById('seedInput');
    const pointsValueSpan = document.getElementById('pointsValue');
    const distanceValueSpan = document.getElementById('distanceValue');
    const angleValueSpan = document.getElementById('angleValue');
    const focusButton = document.getElementById('focusButton');
    
    pointsSlider.addEventListener('input', () => {
      const newNumPoints = parseInt(pointsSlider.value);
      pointsValueSpan.textContent = newNumPoints;
      onUpdate({ numPoints: newNumPoints });
    });
    
    distanceSlider.addEventListener('input', () => {
      const newDistance = parseFloat(distanceSlider.value);
      distanceValueSpan.textContent = newDistance;
      onUpdate({ distanceStep: newDistance });
    });
    
    angleSlider.addEventListener('input', () => {
      const newAngle = parseFloat(angleSlider.value);
      angleValueSpan.textContent = newAngle;
      onUpdate({ maxAngle: newAngle });
    });
    
    seedInput.addEventListener('input', () => {
      onSeedChange(seedInput.value);
    });
    
    focusButton.addEventListener('click', e => {
      e.stopPropagation();
      onFocus();
    });
  }
  