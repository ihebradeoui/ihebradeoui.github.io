# Galaxy-Specific Planet Names

## Date: 2026-02-16

## Overview

This update makes planet names specific to each galaxy, so naming a planet in one galaxy doesn't affect planets in other galaxies.

---

## Problem Statement

### The Issue
Previously, planet names were shared across all galaxies. If you:
1. Went to Solar System
2. Named the first planet (Mercury) as "My Mercury"
3. Switched to Zephyria galaxy
4. The first planet there (Crystalia) would also show "My Mercury"

This happened because all first planets across galaxies had the same ID: `planet_0`.

### Why This Was Wrong
- **User Expectation**: Each galaxy should have independent planet names
- **Data Confusion**: Users couldn't distinguish between planets in different galaxies
- **Naming Conflicts**: Custom names from one galaxy would override names in other galaxies

---

## Root Cause

### Planet ID Generation
Planet IDs were generated without the galaxy context:

```typescript
// OLD CODE:
private createGalaxyPlanets(galaxy: GalaxyData): void {
  galaxy.planets.forEach((planetConfig, index) => {
    const planetId = `planet_${index}`;  // Same ID across all galaxies!
    this.createPlanet(planetId, { ... });
  });
}
```

**Result**:
- Solar System planet 0: `planet_0` (Mercury)
- Zephyria planet 0: `planet_0` (Crystalia)
- Both shared the same ID, so they shared the same saved name in Firebase

### Firebase Structure (Before)
```
planets/
  ├── planet_0/     (Could be Mercury OR Crystalia - ambiguous!)
  ├── planet_1/     (Could be Venus OR another planet - ambiguous!)
  └── planet_2/     (Could be Earth OR another planet - ambiguous!)
```

---

## Solution

### Galaxy-Specific Planet IDs

Include the galaxy ID in the planet ID to make each planet unique:

```typescript
// NEW CODE:
private createGalaxyPlanets(galaxy: GalaxyData): void {
  galaxy.planets.forEach((planetConfig, index) => {
    const planetId = `${galaxy.id}_planet_${index}`;  // Galaxy-specific!
    this.createPlanet(planetId, { ... });
  });
}
```

**Result**:
- Solar System planet 0: `solar_system_planet_0` (Mercury)
- Zephyria planet 0: `zephyria_planet_0` (Crystalia)
- Each has a unique ID, so they have independent saved names

### Firebase Structure (After)
```
planets/
  ├── solar_system_planet_0/   (Mercury - unambiguous)
  ├── solar_system_planet_1/   (Venus - unambiguous)
  ├── solar_system_planet_2/   (Earth - unambiguous)
  ├── zephyria_planet_0/       (Crystalia - unambiguous)
  ├── zephyria_planet_1/       (Vortexia - unambiguous)
  └── andromeda_planet_0/      (Another galaxy's planet - unambiguous)
```

---

## Implementation Details

### Changes Made

**File**: `src/app/planets/planet-scene.ts`

#### 1. Planet Creation (Line ~1903)

**Before**:
```typescript
const planetId = `planet_${index}`;
```

**After**:
```typescript
// Make planet ID specific to the galaxy to avoid name conflicts across galaxies
const planetId = `${galaxy.id}_planet_${index}`;
```

#### 2. Keyboard Shortcuts (Line ~2168-2177)

The keyboard shortcuts (keys 4-9) allow following specific planets. These also needed updating.

**Before**:
```typescript
case '4': // Follow Mercury (planet_0)
case '5': // Follow Venus (planet_1)
// ...
  const planetIndex = parseInt(event.key) - 4;
  const planetId = `planet_${planetIndex}`;  // Old format
  const planet = this.planets.get(planetId);
```

**After**:
```typescript
case '4': // Follow Mercury (first planet)
case '5': // Follow Venus (second planet)
// ...
  const planetIndex = parseInt(event.key) - 4;
  // Use galaxy-specific planet ID
  const currentGalaxy = this.galaxies[this.currentGalaxyIndex];
  const planetId = `${currentGalaxy.id}_planet_${planetIndex}`;  // New format
  const planet = this.planets.get(planetId);
```

---

## Examples

### Planet ID Mapping

#### Solar System
| Index | Planet | Old ID | New ID |
|-------|--------|--------|--------|
| 0 | Mercury | `planet_0` | `solar_system_planet_0` |
| 1 | Venus | `planet_1` | `solar_system_planet_1` |
| 2 | Earth | `planet_2` | `solar_system_planet_2` |
| 3 | Mars | `planet_3` | `solar_system_planet_3` |

#### Zephyria
| Index | Planet | Old ID | New ID |
|-------|--------|--------|--------|
| 0 | Crystalia | `planet_0` | `zephyria_planet_0` |
| 1 | Vortexia | `planet_1` | `zephyria_planet_1` |
| 2 | Luminara | `planet_2` | `zephyria_planet_2` |

### Usage Scenarios

#### Scenario 1: Naming Planets in Different Galaxies
1. **In Solar System**: Name Mercury → "My Mercury"
   - Saved to Firebase as `solar_system_planet_0`
2. **Switch to Zephyria**: First planet is still "Crystalia" (default name)
   - Would save to Firebase as `zephyria_planet_0`
3. **Name Crystalia** → "Crystal World"
   - Saved to Firebase as `zephyria_planet_0`
4. **Switch back to Solar System**: Mercury is still "My Mercury" ✓

#### Scenario 2: Following Planets with Keyboard
1. **In Solar System**: Press '4' → Follows Mercury (`solar_system_planet_0`)
2. **Switch to Zephyria**: Press '4' → Follows Crystalia (`zephyria_planet_0`)
3. Each galaxy's keyboard shortcuts work independently ✓

---

## Technical Considerations

### Galaxy ID Format

Galaxy IDs are defined in `initializeGalaxies()`:
```typescript
this.galaxies.push({
  id: 'solar_system',  // Used in planet IDs
  name: 'Solar System',
  // ...
});

this.galaxies.push({
  id: 'zephyria',      // Used in planet IDs
  name: 'Zephyria',
  // ...
});
```

**Important**: Galaxy IDs must:
- Be unique across all galaxies
- Use URL-safe characters (no spaces, special chars)
- Be lowercase with underscores (convention)
- Not change after deployment (would break saved data)

### Backward Compatibility

**Old Saved Data**:
- Planets saved with old IDs (`planet_0`, `planet_1`, etc.) will still exist in Firebase
- They won't be loaded for any galaxy (since no galaxy matches)
- This is acceptable - they're effectively orphaned data

**Migration Strategy** (if needed):
- Old data could be migrated by:
  1. Reading all `planet_*` entries
  2. Determining which galaxy they belong to (if possible)
  3. Copying to new galaxy-specific IDs
  4. Cleaning up old entries

**For this implementation**: No migration needed, as it's a new feature and breaking old saved data is acceptable.

---

## Testing

### Manual Testing Steps

#### Test 1: Independent Planet Names
1. Start in Solar System
2. Click on Mercury (first planet)
3. Name it "My Custom Mercury"
4. Save to Firebase
5. Press 'G' to switch to Zephyria
6. Observe first planet (Crystalia) - should have default name "Crystalia"
7. Click on Crystalia
8. Name it "My Crystal World"
9. Save to Firebase
10. Press 'G' to switch back to Solar System
11. **Expected**: Mercury still shows "My Custom Mercury"
12. Press 'G' to switch to Zephyria again
13. **Expected**: Crystalia still shows "My Crystal World"

#### Test 2: Keyboard Shortcuts
1. In Solar System, press '4' (follow Mercury)
2. **Expected**: Camera follows Mercury
3. Switch to Zephyria, press '4' (follow Crystalia)
4. **Expected**: Camera follows Crystalia (not Mercury)

#### Test 3: Firebase Data Structure
1. Name planets in multiple galaxies
2. Open Firebase console
3. Navigate to `planets/` node
4. **Expected**: See entries like:
   - `solar_system_planet_0`
   - `solar_system_planet_2`
   - `zephyria_planet_0`
   - `zephyria_planet_1`

### Automated Testing
- ✅ Build successful (no TypeScript errors)
- ✅ No runtime errors in console
- ✅ All planet operations use consistent ID format

---

## Impact Analysis

### User Experience
- ✅ **Better UX**: Users can name planets independently in each galaxy
- ✅ **No Confusion**: Clear separation between galaxies
- ✅ **Predictable Behavior**: Planet names stay with their galaxy

### Data Storage
- **Firebase Entries**: More entries (one per planet per galaxy)
- **Storage Impact**: Minimal - just longer keys
- **Query Performance**: No impact - still O(1) lookups by ID

### Code Maintainability
- ✅ **Clear Intent**: Galaxy ID in planet ID makes relationship obvious
- ✅ **Easier Debugging**: Can identify which galaxy a planet belongs to from ID
- ✅ **Future-Proof**: Easy to add more galaxies without ID conflicts

---

## Edge Cases

### Multiple Galaxies with Same Structure
- **Scenario**: Two galaxies both have 8 planets
- **Handled**: Each planet has unique ID based on galaxy ID
- **Example**: `galaxy_a_planet_0` vs `galaxy_b_planet_0`

### Galaxy Switching
- **Scenario**: Rapidly switching between galaxies
- **Handled**: Each galaxy creates its own planet set with correct IDs
- **No Conflicts**: IDs are always unique

### Firebase Save/Load
- **Scenario**: Saving a planet, switching galaxy, switching back
- **Handled**: `applySavedPlanetNames()` loads all planets from Firebase
- **Correct Matching**: Only planets with matching IDs get their names updated

---

## Future Enhancements

### Potential Improvements
1. **Galaxy Selection UI**: Show saved planet count per galaxy
2. **Bulk Operations**: Export/import planet names per galaxy
3. **Planet Search**: Search for custom-named planets across all galaxies
4. **Statistics**: Track most popular galaxy based on saved planets

---

## Related Changes

### Previous Issues Fixed
1. **Orbital Path Fix**: Planets follow correct 3D paths
2. **Inclination Preservation**: Orbital inclination saved correctly
3. **Mini Galaxy Orbits**: Distant galaxy rings positioned correctly
4. **Firebase Reload**: Planet names reload after galaxy switch

### This Change Completes
- Galaxy-specific data persistence
- Independent customization per galaxy
- Clean data model for multi-galaxy support

---

## Summary

✅ **Planet IDs now include galaxy identifier**  
✅ **Each galaxy has independent planet names**  
✅ **No naming conflicts between galaxies**  
✅ **Keyboard shortcuts work correctly per galaxy**  
✅ **Firebase data properly segregated**  

This change ensures users can fully customize each galaxy independently, providing a better user experience and cleaner data model.

---

**Implementation Date**: February 16, 2026  
**Status**: Complete and tested  
**Build**: Successful  
**Breaking Changes**: Old saved planet data (if any) won't be loaded
