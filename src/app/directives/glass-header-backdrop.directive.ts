import { AfterViewInit, Directive, ElementRef, OnDestroy, Renderer2 } from '@angular/core';

@Directive({
  selector: 'ion-header[appGlassBackdrop]',
  standalone: true,
})
export class GlassHeaderBackdropDirective implements AfterViewInit, OnDestroy {
  private readonly layerHeightOffsets = [11, 10, 9, 8, 7, 6, 5, 4, 3, 2, 1, 0];

  private backdropEl?: HTMLElement;
  private layerEls: HTMLElement[] = [];
  private resizeObserver?: ResizeObserver;

  constructor(
    private readonly hostRef: ElementRef<HTMLElement>,
    private readonly renderer: Renderer2,
  ) {}

  ngAfterViewInit(): void {
    const host = this.hostRef.nativeElement;

    this.renderer.addClass(host, 'app-glass-header-host');
    this.renderer.setStyle(host, 'position', 'relative');
    this.renderer.setStyle(host, 'overflow', 'visible');

    const toolbar = host.querySelector('ion-toolbar');
    if (toolbar) {
      this.renderer.setStyle(toolbar, 'position', 'relative');
      this.renderer.setStyle(toolbar, 'z-index', '2');
    }

    this.mountLayers(host);
    this.updateHeightVar();
    this.observeHostSize();
  }

  ngOnDestroy(): void {
    this.resizeObserver?.disconnect();
    this.resizeObserver = undefined;

    if (this.backdropEl) {
      this.renderer.removeChild(this.hostRef.nativeElement, this.backdropEl);
      this.backdropEl = undefined;
    }

    this.layerEls = [];
  }

  private mountLayers(host: HTMLElement): void {
    if (this.backdropEl) {
      return;
    }

    const backdrop = this.renderer.createElement('div') as HTMLElement;
    this.renderer.addClass(backdrop, 'app-glass-header-backdrop');
    this.renderer.setAttribute(backdrop, 'aria-hidden', 'true');

    this.layerHeightOffsets.forEach(() => {
      const layer = this.renderer.createElement('div') as HTMLElement;
      this.renderer.addClass(layer, 'app-glass-header-backdrop__layer');
      this.renderer.appendChild(backdrop, layer);
      this.layerEls.push(layer);
    });

    this.renderer.insertBefore(host, backdrop, host.firstChild);
    this.backdropEl = backdrop;
  }

  private observeHostSize(): void {
    if (typeof ResizeObserver === 'undefined') {
      return;
    }

    this.resizeObserver = new ResizeObserver(() => {
      this.updateHeightVar();
    });
    this.resizeObserver.observe(this.hostRef.nativeElement);
  }

  private updateHeightVar(): void {
    const host = this.hostRef.nativeElement;
    const toolbar = host.querySelector('ion-toolbar') as HTMLElement | null;
    const baseHeight = Math.max(44, Math.round(toolbar?.offsetHeight ?? host.offsetHeight ?? 56)) + 12;

    this.layerEls.forEach((layer, index) => {
      const offset = this.layerHeightOffsets[index] ?? 0;
      const layerHeight = Math.max(8, baseHeight - offset);
      this.renderer.setStyle(layer, 'height', `${layerHeight}px`);
    });
  }
}