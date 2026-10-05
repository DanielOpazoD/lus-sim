/**
 * El chunk del corazón de EchoTwin (decisión 49): lo que lo coloca en la escena (`anatomy/heart/cardiacRuntime.ts`) y lo que hornea
 * su volumen en la GPU (`ultrasound/heartBake.ts`), juntos en un import diferido de `app/session.ts` (`anatomy/` no importa
 * `ultrasound/`).
 */
export { attachEchoTwinHeart } from '../anatomy/heart/cardiacRuntime';
export { startHeartBake } from '../ultrasound/heartBake';
export { echoTwinBeatModel } from '../physiology/echoTwinBeat';
