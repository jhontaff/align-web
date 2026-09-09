import { TestBed } from '@angular/core/testing';
import { provideHttpClient } from '@angular/common/http';
import { provideHttpClientTesting } from '@angular/common/http/testing';
import { provideRouter } from '@angular/router';
import { provideServiceWorker } from '@angular/service-worker';
import { App } from './app';

describe('App', () => {
  beforeEach(async () => {
    await TestBed.configureTestingModule({
      imports: [App],
      // El shell rehidrata la sesión en su constructor, así que necesita un
      // HttpClient aunque el test no compruebe la petición.
      //
      // `provideServiceWorker(..., { enabled: false })` tampoco es decorativo:
      // el shell inyecta `PushService` (→ `SwPush`) y `AppUpdateService`
      // (→ `SwUpdate`). Sin él, `NG0201` y el componente ni se instancia.
      providers: [
        provideRouter([]),
        provideHttpClient(),
        provideHttpClientTesting(),
        provideServiceWorker('ngsw-worker.js', { enabled: false })
      ]
    }).compileComponents();
  });

  it('should create the app', () => {
    const fixture = TestBed.createComponent(App);
    expect(fixture.componentInstance).toBeTruthy();
  });
});
