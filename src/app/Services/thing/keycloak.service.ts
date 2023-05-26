import { Injectable } from '@angular/core';
import * as Keycloak from 'keycloak-js';

@Injectable({
  providedIn: 'root'
})
export class KeycloakService {

  private keycloakAuth: Keycloak.KeycloakInstance;

  constructor() {
    this.initKeycloak();
  }

  private initKeycloak(): void {
    const config = {
      url: 'https://keycloak.local.labs.digitaltrust.dev:8443/',
      realm: 'myrealm',
      clientId: 'myclient'
    };
    this.keycloakAuth = Keycloak.default(config);
    this.keycloakAuth.init({
      onLoad: 'check-sso'
    }).then((authenticated) => {
      console.log(`Keycloak authentication successful: ${authenticated}`);
    }).catch((err) => {
      console.error('Keycloak authentication error:', err);
    });
  }

  getKeycloakInstance(): Keycloak.KeycloakInstance {
    return this.keycloakAuth;
  }

  getToken(): Promise<string> {
    return new Promise((resolve, reject) => {
      if (this.keycloakAuth.authenticated) {
        resolve(this.keycloakAuth.token);
      } else {
        this.keycloakAuth.onAuthSuccess = () => resolve(this.keycloakAuth.token);
        this.keycloakAuth.onAuthError = () => reject('Failed to obtain token');
        this.keycloakAuth.login();
      }
    });
  }

  logout(): Promise<void> {
    return this.keycloakAuth.logout();
  }
}
