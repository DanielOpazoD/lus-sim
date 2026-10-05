import { registerCardiac } from '../../anatomy/organs/heart';
import { attachEchoTwinHeart } from '../../anatomy/heart/cardiacRuntime';
import { registerHeartBaker } from '../../ultrasound/renderer';
import { startHeartBake } from '../../ultrasound/heartBake';

/**
 * Las pruebas tienen el corazón de EchoTwin desde el principio (decisión 49): la aplicación lo carga en su propio chunk después
 * del primer cuadro (`app/session.ts`), con su horneado; aquí se registran antes de que se construya ninguna escena (`setupFiles` de vitest).
 */
registerCardiac(attachEchoTwinHeart);
registerHeartBaker(startHeartBake);
