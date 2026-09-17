import { inject, Injectable } from '@angular/core';
import { ComponentPortal } from '@angular/cdk/portal';
import { Overlay, OverlayRef } from '@angular/cdk/overlay';
import { firstValueFrom, timer } from 'rxjs';

/**
 * Ref-counted fullscreen overlay base (CDK): nested `show()` calls stack,
 * the overlay disappears when every caller has called `hide()`.
 *
 * Subclass per overlay kind and return the component to render:
 * ```ts
 * @Injectable({ providedIn: 'root' })
 * export class LoadingService extends BaseOverlayService {
 *   protected getComponentPortal() { return new ComponentPortal(SpinnerComponent); }
 * }
 * ```
 */
@Injectable()
export abstract class BaseOverlayService {
  private readonly overlay = inject(Overlay);
  private counter = 0;
  private overlayRef: OverlayRef | null = null;

  protected abstract getComponentPortal(): ComponentPortal<unknown>;

  private getOrCreateOverlayRef(): OverlayRef {
    if (!this.overlayRef) {
      this.overlayRef = this.overlay.create({
        panelClass: ['overlay-wrapper'],
        hasBackdrop: true,
        backdropClass: 'cdk-overlay-dark-backdrop',
        positionStrategy: this.overlay.position().global().centerHorizontally().centerVertically(),
      });
    }
    return this.overlayRef;
  }

  /** Raises the overlay above other panels by adding the `top-panel` class. */
  moveTop(): void {
    this.getOrCreateOverlayRef().addPanelClass('top-panel');
  }

  show(): void {
    const overlayRef = this.getOrCreateOverlayRef();
    if (this.counter <= 0 && !overlayRef.hasAttached()) {
      overlayRef.attach(this.getComponentPortal());
    }
    this.counter++;
  }

  hide(): void {
    if (this.counter > 0) {
      this.counter--;
    }
    if (this.counter <= 0 && this.overlayRef) {
      this.overlayRef.dispose();
      this.overlayRef = null;
    }
  }

  /** Force-closes regardless of how many `show()` calls are outstanding. */
  removeAll(): void {
    this.counter = 0;
    if (this.overlayRef) {
      this.overlayRef.dispose();
      this.overlayRef = null;
    }
  }

  /** Like `hide()`, but fades out (add a CSS transition on `.overlay-fade-out`). */
  async hideWithFade(durationMs = 350): Promise<void> {
    if (this.counter > 0) {
      this.counter--;
    }
    if (this.counter === 0 && this.overlayRef) {
      this.overlayRef.addPanelClass('overlay-fade-out');
      await firstValueFrom(timer(durationMs));
      this.overlayRef.removePanelClass('overlay-fade-out');
      this.overlayRef.dispose();
      this.overlayRef = null;
    }
  }
}
