/** Use real contacts during the .15 s flight hysteresis, not just mode labels. */
export function simulationTimeScale(body,settings={}) {
  if(!settings.bulletTime)return 1;
  const airborne=body.mode==='FLIGHT'||body.grounded===false||
    (Array.isArray(body.wheels)&&body.wheels.length>0&&body.wheels.every(wheel=>!wheel.contact));
  return airborne?.5:1;
}
