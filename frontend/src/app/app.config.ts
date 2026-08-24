import { ApplicationConfig, provideBrowserGlobalErrorListeners } from '@angular/core';
import { provideHttpClient, withInterceptors } from '@angular/common/http';
import { provideRouter } from '@angular/router';
import { routes } from './app.routes';
import { authInterceptor } from './core/interceptors/auth-interceptor';
import { errorInterceptor } from './core/interceptors/error-interceptor';

export const appConfig: ApplicationConfig = {
  providers: [
    provideBrowserGlobalErrorListeners(),
    provideRouter(routes),
    // Order is the chain order: `errorInterceptor` is outermost, so it
    // normalizes what is left after `authInterceptor` has tried to refresh and
    // replay a 401. Swapping them would hand `authInterceptor` an `ApiError` it
    // does not recognise, and the refresh path would go dead.
    provideHttpClient(withInterceptors([errorInterceptor, authInterceptor])),
  ],
};
