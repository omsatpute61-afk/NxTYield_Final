function clamp(value, min, max) {
  return Math.max(min, Math.min(max, value));
}

function smoothstep(edge0, edge1, value) {
  const x = clamp((value - edge0) / (edge1 - edge0), 0, 1);
  return x * x * (3 - 2 * x);
}

export function timeLightingFromHour(hour) {
  const sunTravel = clamp((hour - 5) / 16, 0, 1);
  const sunHeight = clamp(Math.sin(sunTravel * Math.PI), 0, 1);
  const sunrise = smoothstep(4.85, 7.15, hour);
  const sunset = 1 - smoothstep(18.05, 20.15, hour);
  const dayAmount = clamp(sunrise * sunset, 0, 1);
  const sunLight = clamp(sunHeight * dayAmount, 0, 1);
  const skyLight = clamp(dayAmount * (0.28 + sunHeight * 0.72), 0, 1);
  const moonLight = hour < 12
    ? 1 - smoothstep(5.05, 7.05, hour)
    : smoothstep(18.35, 20.15, hour);

  return {
    daylight: sunHeight,
    sunLight,
    skyLight,
    moonLight: clamp(moonLight, 0, 1),
    sunTravel,
    night: skyLight < 0.16,
    golden: clamp(1 - Math.abs(hour - 6.85) / 2.15, 0, 1) + clamp(1 - Math.abs(hour - 18.25) / 2.15, 0, 1),
  };
}
