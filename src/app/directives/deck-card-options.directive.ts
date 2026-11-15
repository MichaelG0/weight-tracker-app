import { Directive, ElementRef, NgZone, OnDestroy, OnInit, inject } from '@angular/core';

/**
 * Mirrors the swipe distance of an `ion-item-sliding` into its `--open-amount` CSS variable,
 * so the options container can always span the area uncovered by the item (see "Item Options" in
 * global.scss). This keeps the first option at a fixed distance from the item's edge while the
 * expandable option fills the remaining space.
 */
@Directive({
  selector: 'ion-item-sliding[appDeckCardOptions]',
})
export class DeckCardOptionsDirective implements OnInit, OnDestroy {
  private readonly zone = inject(NgZone);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  private readonly onDrag = (event: Event): void => {
    const { amount } = (event as CustomEvent<{ amount: number }>).detail;
    this.host.style.setProperty('--open-amount-px', `${Math.abs(amount)}px`);
    this.host.style.setProperty('--open-amount', `${Math.abs(amount)}`);
  };

  ngOnInit(): void {
    // Runs outside Angular to avoid triggering change detection on every drag frame
    this.zone.runOutsideAngular(() => this.host.addEventListener('ionDrag', this.onDrag));
  }

  ngOnDestroy(): void {
    this.host.removeEventListener('ionDrag', this.onDrag);
  }
}