import { Component, OnInit, ChangeDetectionStrategy } from '@angular/core';

@Component({
    selector: 'app-terms-of-service',
    templateUrl: './terms-of-service.component.html',
    styleUrls: ['./terms-of-service.component.scss'],
    changeDetection: ChangeDetectionStrategy.Eager,
    standalone: true
})
export class TermsOfServiceComponent implements OnInit {

  constructor() { }

  ngOnInit(): void {
  }

}
