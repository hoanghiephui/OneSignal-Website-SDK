import * as swivel from 'swivel';

import Environment from '../Environment';


export interface ServiceWorkerDebugScope {
  environment: Environment;
  swivel: swivel;
  database: any;
  browser: any;
  apiUrl: string;
}
