
import { bootstrapApplication } from '@angular/platform-browser';
import { inject, provideAppInitializer } from '@angular/core';
import { AuthService } from './app/services/auth.service';

import {
  RouteReuseStrategy,
  provideRouter,
  withComponentInputBinding,
  withPreloading,
  PreloadAllModules,
} from '@angular/router';

import {
  IonicRouteStrategy,
  provideIonicAngular
} from '@ionic/angular';

// NEW: Enable Angular HTTP requests
import { provideHttpClient } from '@angular/common/http';

import { AppComponent } from './app/app.component';
import { routes } from './app/app.routes';

bootstrapApplication(AppComponent, {
  providers: [
    // Complete session verification before rendering app routes.
    provideAppInitializer(() => inject(AuthService).initialize()),
    // Existing Ionic route strategy
    {
      provide: RouteReuseStrategy,
      useClass: IonicRouteStrategy
    },

    // Existing Ionic configuration
    provideIonicAngular(),

    // Existing application routes
    provideRouter(
      routes,
      withPreloading(PreloadAllModules),
      withComponentInputBinding()
    ),

    // NEW: Enable HttpClient for Shed RESTful API
    provideHttpClient(),
  ],
});
