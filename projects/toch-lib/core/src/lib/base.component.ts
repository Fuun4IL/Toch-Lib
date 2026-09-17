import { AfterViewInit, Directive, OnDestroy, OnInit } from '@angular/core';
import { Observable, Subject } from 'rxjs';

/**
 * Base class for components exposing lifecycle events as observables:
 * `init$`, `viewInit$` and `destroyed$` (use with `takeUntil(this.destroyed$)`).
 */
@Directive()
export abstract class BaseComponent implements OnInit, AfterViewInit, OnDestroy {
  protected readonly init$ = new Subject<void>();
  protected readonly viewInit$ = new Subject<void>();
  private readonly destroySubject$ = new Subject<void>();
  protected readonly destroyed$: Observable<void> = this.destroySubject$.asObservable();

  ngOnInit(): void {
    this.init$.next();
    this.init$.complete();
  }

  ngAfterViewInit(): void {
    this.viewInit$.next();
    this.viewInit$.complete();
  }

  ngOnDestroy(): void {
    this.init$.complete();
    this.viewInit$.complete();
    this.destroySubject$.next();
    this.destroySubject$.complete();
  }
}
