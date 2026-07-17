import { AfterViewInit, Directive, ElementRef, NgZone, OnDestroy, Renderer2, inject } from '@angular/core';

@Directive({
  selector: 'ion-item-sliding[appDeckCardOptions]',
  standalone: true,
})
export class DeckCardOptionsDirective implements AfterViewInit, OnDestroy {
  private observer?: MutationObserver;
  private readonly zone = inject(NgZone);

  constructor(
    private readonly hostRef: ElementRef<HTMLElement>,
    private readonly renderer: Renderer2,
  ) {}

  ngAfterViewInit(): void {
    const host = this.hostRef.nativeElement;

    // Ionic can sometimes re-build the item dynamically, but usually they are present after view init.
    // A microtask or short timeout ensures ShadowDOM slots are evaluated.
    requestAnimationFrame(() => {
      const item = host.querySelector('ion-item');
      const options = host.querySelector('ion-item-options') as HTMLElement | null;
      if (!item || !options) {
        return;
      }

      // Measure options width, then push them fully off-screen to the right.
      // Ionic briefly sets display:flex to measure, so we force it to get the width.
      options.style.display = 'flex';
      const optionsWidth = options.offsetWidth || 120;
      options.style.display = '';

      // Ensure options sit ABOVE the list item to hide the transparent leak
      this.renderer.setStyle(options, 'zIndex', '2');

      // Start fully hidden to the right
      this.renderer.setStyle(options, 'transform', `translateX(${optionsWidth}px)`);
      this.renderer.setStyle(options, 'opacity', '0');

      // Run outside Angular to prevent the MutationObserver from triggering change detection 60fps during swipe
      this.zone.runOutsideAngular(() => {
        this.observer = new MutationObserver(() => {
          const transform = item.style.transform;
          const transition = item.style.transition;

          // Extract how far the item has been swiped
          const match = transform?.match(/translate3d\((-?[\d.]+)px/);
          const translateX = match ? Math.abs(parseFloat(match[1])) : 0;

          // Slide options in from the right proportionally
          const offset = Math.max(0, optionsWidth - translateX);
          const opacity = Math.min(translateX / optionsWidth, 1);

          this.renderer.setStyle(options, 'transform', `translateX(${offset}px)`);
          this.renderer.setStyle(options, 'opacity', `${opacity}`);

          // Mirror CSS transition (essential for snap-back animation)
          if (transition) {
            this.renderer.setStyle(options, 'transition', `${transition}, opacity 0.15s ease`);
          } else {
            this.renderer.removeStyle(options, 'transition');
          }
        });

        this.observer.observe(item, { attributes: true, attributeFilter: ['style'] });
      });
    });
  }

  ngOnDestroy(): void {
    this.observer?.disconnect();
    this.observer = undefined;
  }
}
