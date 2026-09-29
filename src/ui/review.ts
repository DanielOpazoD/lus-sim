import type { Simulator } from '../app/simulator';
import type { FrozenReview } from './frozenReview';
import './review.css';

/** La revisión se descarga al congelar por primera vez; no bloquea la primera imagen B. */
export function createReview(host: HTMLElement, bar: HTMLElement, getSim: () => Simulator, onError: (error: unknown) => void) {
  host.parentElement!.classList.add('review-layout');
  host.after(bar); // El cine queda fuera del sector; sus eventos y su controlador no cambian.
  const message = document.createElement('p');
  message.className = 'note';
  message.setAttribute('role', 'status');
  message.hidden = true;
  bar.append(message);
  let view: FrozenReview | null = null;
  let requested = false;
  let lost = false;
  const request = () => {
    requested = true;
    message.hidden = false;
    message.textContent = 'Cargando herramientas de revisión…';
    void import('./frozenReview')
      .then(({ FrozenReview: View }) => {
        view = new View(host, bar, getSim, onError);
        message.hidden = true;
        view.sync(lost);
      })
      .catch((error: unknown) => {
        onError(error);
        message.textContent = 'No se pudo cargar la revisión. ';
        const retry = document.createElement('button');
        retry.textContent = 'Reintentar';
        retry.addEventListener('click', request, { once: true });
        message.append(retry);
      });
  };
  return {
    sync(gpuLost: boolean): void {
      lost = gpuLost;
      if (!requested && getSim().frozen && !lost) request();
      view?.sync(lost);
    },
  };
}
