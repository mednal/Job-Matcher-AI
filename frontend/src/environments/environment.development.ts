import { Environment } from './environment.model';

/** The backend's default local port (`backend/.env.example`: `PORT=3000`). */
export const environment: Environment = {
  production: false,
  apiBaseUrl: 'http://localhost:3000/api/v1',
};
