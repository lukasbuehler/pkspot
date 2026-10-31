import { NavigationEnd, Router } from "@angular/router";
import { distinctUntilChanged, filter, Observable } from "rxjs";

/** Includes the landing navigation when async startup delayed the subscription. */
export function completedNavigations(router: Router): Observable<NavigationEnd> {
  return new Observable<NavigationEnd>((subscriber) => {
    const subscription = router.events
      .pipe(filter((event) => event instanceof NavigationEnd))
      .subscribe(subscriber);

    const last = router.lastSuccessfulNavigation();
    if (last?.finalUrl) {
      subscriber.next(new NavigationEnd(
        last.id,
        router.serializeUrl(last.initialUrl),
        router.serializeUrl(last.finalUrl),
      ));
    }

    return subscription;
  }).pipe(distinctUntilChanged((previous, current) => previous.id === current.id));
}
