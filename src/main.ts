import { bootstrapApplication } from '@angular/platform-browser';
import { appConfig } from './app/app.config';
import { App } from './app/app';

bootstrapApplication(App, appConfig)
  .then(() => {
    // Register push service worker
    if ('serviceWorker' in navigator) {
      navigator.serviceWorker
        .register('/sw-push.js')
        .then((registration) => {
          console.log('Push SW registered:', registration.scope);
        })
        .catch((error) => {
          console.error('Push SW registration failed:', error);
        });
    }
  })
  .catch((err) => console.error(err));
