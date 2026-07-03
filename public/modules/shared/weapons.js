// Weapon definitions shared by client (prediction/HUD/VFX) and server (authoritative damage).

export const WEAPON_SLOT = Object.freeze({ 1: 'ar', 2: 'shotgun', 3: 'sniper', 4: 'rocket' });

export const WEAPONS = Object.freeze({
  ar: {
    id: 'ar',
    name: 'Assault Rifle',
    slot: 1,
    fireInterval: 0.11, // seconds between shots (~545 RPM)
    automatic: true,
    hitscan: true,
    pellets: 1,
    spread: 0.018, // radians of cone half-angle at full auto sustained fire
    spreadRamp: 0.05, // extra spread added per consecutive shot, capped
    maxSpread: 0.05,
    damage: 18,
    falloffStart: 18,
    falloffEnd: 45,
    minDamageMultiplier: 0.45,
    magazineSize: 30,
    reloadTime: 2.1,
  },
  shotgun: {
    id: 'shotgun',
    name: 'Shotgun',
    slot: 2,
    fireInterval: 0.75,
    automatic: false,
    hitscan: true,
    pellets: 9,
    spread: 0.11,
    spreadRamp: 0,
    maxSpread: 0.11,
    damage: 11, // per pellet
    falloffStart: 6,
    falloffEnd: 16,
    minDamageMultiplier: 0.2,
    magazineSize: 6,
    reloadTime: 2.4,
  },
  sniper: {
    id: 'sniper',
    name: 'Sniper Rifle',
    slot: 3,
    fireInterval: 1.35,
    automatic: false,
    hitscan: true,
    pellets: 1,
    spread: 0.001,
    spreadRamp: 0,
    maxSpread: 0.001,
    damage: 95,
    falloffStart: 60,
    falloffEnd: 100,
    minDamageMultiplier: 0.7,
    magazineSize: 5,
    reloadTime: 3.0,
  },
  rocket: {
    id: 'rocket',
    name: 'Rocket Launcher',
    slot: 4,
    fireInterval: 1.6,
    automatic: false,
    hitscan: false,
    projectileSpeed: 32,
    projectileGravity: 4,
    splashRadius: 5.5,
    damage: 110, // direct/near-center hit
    minDamageMultiplier: 0.15, // at edge of splash radius
    magazineSize: 1,
    reloadTime: 2.6,
  },
});

// Linear damage falloff for hitscan weapons based on travel distance.
export function computeFalloffDamage(weapon, distance) {
  if (distance <= weapon.falloffStart) return weapon.damage;
  if (distance >= weapon.falloffEnd) return weapon.damage * weapon.minDamageMultiplier;
  const t = (distance - weapon.falloffStart) / (weapon.falloffEnd - weapon.falloffStart);
  const mult = 1 - t * (1 - weapon.minDamageMultiplier);
  return weapon.damage * mult;
}

// Splash damage for the rocket launcher based on distance from explosion center.
export function computeSplashDamage(weapon, distance) {
  if (distance >= weapon.splashRadius) return 0;
  const t = distance / weapon.splashRadius;
  const mult = 1 - t * (1 - weapon.minDamageMultiplier);
  return weapon.damage * mult;
}
