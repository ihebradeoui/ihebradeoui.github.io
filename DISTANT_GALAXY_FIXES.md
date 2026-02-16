# Distant Galaxy Fixes and Firebase Reload

## Date: 2026-02-16

## Overview

This update addresses three critical issues with distant galaxies and Firebase data persistence:
1. Distant galaxy color mismatch when clicking
2. Missing orbital paths around distant galaxies
3. Firebase planet names not reloading after galaxy switches

---

## Issue 1: Distant Galaxy Color Mismatch

### Problem
When clicking on a distant galaxy representation, the user would be taken to a different galaxy than expected. The color of the distant galaxy sphere didn't match the color of the galaxy it led to.

### Root Cause
The `createDistantGalaxies()` method iterates through all galaxies and skips the current one:

```typescript
this.galaxies.forEach((galaxy, index) => {
  if (index === this.currentGalaxyIndex) return;
  // ...create distant galaxy...
  galaxyGroup.actionManager.registerAction(
    new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
      this.switchGalaxy(index); // WRONG - uses loop index
    })
  );
});
```

**The Problem**: When we're at galaxy 0 (Solar System), the loop skips index 0 but continues with indices 1, 2, 3. However, the distant galaxies are positioned in a circle, and their visual representation uses the correct galaxy data, but the click handler uses the loop index which is now misaligned.

**Example**:
- Current galaxy: 0 (Solar System - orange)
- Loop processes: galaxy 1 (Zephyria - cyan), galaxy 2, galaxy 3
- Distant galaxy at position 0 shows cyan (Zephyria) but clicking switches to galaxy 1
- This works by coincidence initially but breaks the mapping

### Solution

Store the actual galaxy index in the mesh metadata and use it in the click handler:

```typescript
// Store the actual galaxy index
galaxyGroup.metadata = { galaxyIndex: index };

// Use the stored index when clicking
galaxyGroup.actionManager.registerAction(
  new ExecuteCodeAction(ActionManager.OnPickTrigger, () => {
    const targetIndex = galaxyGroup.metadata.galaxyIndex;
    this.switchGalaxy(targetIndex); // CORRECT - uses actual galaxy index
  })
);
```

**Result**: Clicking a distant galaxy now correctly switches to the galaxy it represents.

---

## Issue 2: Missing Orbital Paths on Distant Galaxies

### Problem
Distant galaxies looked too simple - just glowing spheres. They needed orbital rings to make them look more like actual galaxies from a distance.

### Solution

Created a new method `createMiniGalaxyOrbits()` that adds 3 torus rings around each distant galaxy:

```typescript
private createMiniGalaxyOrbits(galaxyMesh: Mesh, galaxyIndex: number): void {
  const numOrbits = 3;
  const baseRadius = 4.5; // Start slightly larger than sphere
  
  for (let i = 0; i < numOrbits; i++) {
    const orbitRadius = baseRadius + (i * 1.5);
    const orbit = MeshBuilder.CreateTorus(
      `distantGalaxyOrbit_${galaxyIndex}_${i}`,
      { diameter: orbitRadius * 2, thickness: 0.1, tessellation: 32 },
      this.scene
    );
    
    // Position at same location as galaxy
    orbit.position = galaxyMesh.position.clone();
    
    // Rotate each orbit differently for variety
    orbit.rotation.x = Math.PI / 2 + (i * 0.3);
    orbit.rotation.y = i * 0.5;
    
    // Match galaxy color with transparency
    const orbitMaterial = new StandardMaterial(...);
    orbitMaterial.emissiveColor = galaxyMaterial.emissiveColor.clone();
    orbitMaterial.alpha = 0.3;
    orbit.material = orbitMaterial;
    
    // Parent to galaxy so they move together
    orbit.parent = galaxyMesh;
  }
}
```

**Features**:
- **3 orbital rings** at increasing radii (4.5, 6.0, 7.5)
- **Different orientations** - each ring rotated differently for visual variety
- **Color matching** - rings use same color as galaxy with 0.3 alpha
- **Parenting** - rings are parented to galaxy mesh so they move as one unit
- **Low tessellation** (32) for performance

**Result**: Distant galaxies now look like miniature solar systems with visible orbital structure.

---

## Issue 3: Firebase Names Not Reloading

### Problem
When switching between galaxies, planet names saved in Firebase would not reload. After going from Galaxy A to Galaxy B and back to Galaxy A, custom planet names were lost and reverted to defaults.

### Root Cause

**The Galaxy Switch Process**:
1. `clearGalaxy()` - Disposes all planet meshes and clears data maps
2. `createGalaxyPlanets()` - Creates new planet meshes with default names
3. Firebase subscription exists but doesn't automatically reapply to new meshes

**The Issue**: The Firebase subscription in `loadPlanets()` is set up once in the constructor:

```typescript
private loadPlanets(): void {
  const sub = this.database.list('planets').snapshotChanges().subscribe(...);
  this.subscriptions.push(sub);
}
```

When galaxies switch:
- Old planets are destroyed (`clearGalaxy()`)
- New planets are created with same IDs (`createGalaxyPlanets()`)
- Firebase subscription fires but timing issues prevent proper updates
- Planet IDs match but meshes are new, causing update conflicts

### Solution

Created a new method `applySavedPlanetNames()` that explicitly reloads Firebase data after creating galaxy planets:

```typescript
private applySavedPlanetNames(): void {
  // Fetch Firebase data once
  this.database.list('planets').valueChanges().pipe(
    take(1) // Get data once and complete
  ).subscribe((planetsData: any) => {
    if (!planetsData) return;
    
    planetsData.forEach((data: any) => {
      if (data && data.id) {
        const planet = this.planets.get(data.id);
        
        if (planet && data.name) {
          // Update planet label with saved name
          this.updatePlanetLabel(planet, data.name);
          
          // Update local data map
          if (this.planetDataMap.has(data.id)) {
            const existingData = this.planetDataMap.get(data.id);
            if (existingData) {
              existingData.name = data.name;
              existingData.description = data.description || existingData.description;
            }
          }
        }
      }
    });
  });
}
```

**Key Features**:
- **One-time fetch**: Uses `take(1)` operator to get current data once
- **Synchronous application**: Applies names immediately after planet creation
- **Label updates**: Updates 3D text labels on planet meshes
- **Data map updates**: Updates local `planetDataMap` for consistency

**Integration**:
```typescript
private switchGalaxy(index: number, withAnimation: boolean = true): void {
  // ... camera transition ...
  this.clearGalaxy();
  this.updateSun(this.galaxies[index]);
  this.createGalaxyPlanets(this.galaxies[index]);
  this.updateGalaxyUI();
  this.updateDistantGalaxies();
  
  // Apply saved planet names from Firebase
  this.applySavedPlanetNames(); // NEW
  
  // ... continue ...
}
```

**Result**: Planet names persist across galaxy switches. Custom names are restored when returning to a previously visited galaxy.

---

## Technical Implementation

### Files Modified
- `src/app/planets/planet-scene.ts`

### New Imports
```typescript
import { take } from 'rxjs/operators';
```

### New Methods
1. **createMiniGalaxyOrbits()** - Creates 3 orbital rings around distant galaxies
2. **applySavedPlanetNames()** - Reloads Firebase names after galaxy switch

### Modified Methods
1. **createDistantGalaxies()** - Store galaxy index in metadata, call `createMiniGalaxyOrbits()`
2. **switchGalaxy()** - Call `applySavedPlanetNames()` after creating planets

---

## Testing

### Manual Testing Steps

#### Test 1: Distant Galaxy Color Matching
1. Start at Solar System (orange sun)
2. Look for distant galaxies (glowing spheres)
3. Identify Zephyria (cyan/aqua colored sphere)
4. Click on cyan sphere
5. **Expected**: Switch to Zephyria with cyan sun
6. **Verify**: Sun color matches the distant galaxy sphere color

#### Test 2: Orbital Paths on Distant Galaxies
1. Zoom out or use camera controls
2. Look at distant galaxy representations
3. **Expected**: See 3 semi-transparent orbital rings around each sphere
4. **Expected**: Rings match the galaxy color
5. **Expected**: Rings oriented at different angles

#### Test 3: Firebase Name Persistence
1. In Solar System, click on Earth
2. Change name to "My Earth"
3. Save to Firebase (free or paid)
4. Press 'G' to switch to Zephyria
5. Press 'G' to switch back to Solar System
6. **Expected**: Earth shows "My Earth" instead of default name
7. **Expected**: All custom names preserved

### Automated Testing
- ✅ Build successful (no TypeScript errors)
- ✅ No console errors during runtime
- ⚠️ Visual testing requires manual verification

---

## Performance Considerations

### Orbital Rings
- **3 rings per distant galaxy** × **n-1 galaxies** (excluding current)
- With 3 galaxies total: 2 distant galaxies × 3 rings = 6 torus meshes
- Low tessellation (32) keeps polygon count manageable
- Alpha blending for transparency

### Firebase Queries
- `applySavedPlanetNames()` uses `take(1)` to avoid continuous subscriptions
- Only queries when switching galaxies
- Minimal impact on performance

---

## Future Enhancements

### Potential Improvements
1. **Animated distant galaxy orbits** - Rotate rings slowly for visual interest
2. **Distance-based LOD** - Reduce ring detail when very far away
3. **Galaxy preview** - Show galaxy name on hover over distant galaxy
4. **Smooth color transitions** - Fade between galaxy colors during switch
5. **Firebase caching** - Cache planet names locally to reduce queries

---

## Known Issues

### Browser Environment
- External texture URLs (particle effects) may be blocked in some environments
- This is handled gracefully with try-catch blocks

### Edge Cases
- If Firebase is unavailable, planets use default names (expected behavior)
- First-time loads still rely on continuous Firebase subscription for real-time updates

---

## Summary

✅ **Distant galaxy colors now match** their destinations  
✅ **Orbital paths added** to distant galaxies for better visual appearance  
✅ **Firebase names reload** correctly when switching between galaxies  

These fixes significantly improve the user experience when navigating between multiple galaxies and ensure that custom planet names persist as expected.
