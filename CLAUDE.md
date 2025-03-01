# Web Hyperloop Project Guidelines

## Commands
- Development: `npm start` (launches webpack-dev-server)
- Build: `npm run build` (creates production bundle)
- Dev build: `npm run dev` (creates development bundle)
- Lint code: `npm run lint`
- Format code: `npm run format`

## Code Style
- Use ES6+ JavaScript with classes and modules
- Import/export: Named exports for most classes, default export for singletons
- Imports: Import Three.js namespace with `import * as THREE from 'three'`
- Three.js addons: Import from 'three/examples/jsm/*' path
- Formatting: 2-space indentation, semicolons, single quotes
- Naming: camelCase for variables/methods, PascalCase for classes
- Patterns: Singleton pattern via static #instance, getInstance() method
- Architecture: GameObject-based inheritance system
- Error handling: Throw errors for singleton violations
- Comments: Use for section breaks and non-obvious logic

## Dependencies
- three.js: Primary 3D rendering engine
- PointerLockControls: For first-person camera control
- SimplexNoise: Used for procedural generation
- Webpack: For bundling and development server

## Module Structure
- GameEngine: Central singleton managing scene, renderer, camera
- GameObject: Base class for all scene objects
- GameObjectManager: Manages game object lifecycle
- Player: Handles camera and user input
- TrackViewer: Renders and manages track visualization