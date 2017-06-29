import '../../support/polyfills/polyfills';

import test from 'ava';
import * as sinon from 'sinon';

import SdkEnvironment from '../../../src/managers/SdkEnvironment';
import { ServiceWorkerManager, ServiceWorkerActiveState } from '../../../src/managers/ServiceWorkerManager';
import Path from '../../../src/models/Path';
import { WindowEnvironmentKind } from '../../../src/models/WindowEnvironmentKind';
import OneSignal from '../../../src/OneSignal';
import { TestEnvironment } from '../../support/sdk/TestEnvironment';
import { ServiceWorkerRegistration } from '../../support/mocks/service-workers/ServiceWorkerRegistration';
import { ServiceWorkerContainer } from '../../support/mocks/service-workers/ServiceWorkerContainer';
import ServiceWorker from '../../support/mocks/service-workers/ServiceWorker';


test.beforeEach(t => {
  const mockInstallingServiceWorker = new ServiceWorker();
  mockInstallingServiceWorker.state = "installing";
  t.context.mockInstallingServiceWorker = mockInstallingServiceWorker;
});

test('getActiveState() detects no installed worker', async t => {
  await TestEnvironment.stubDomEnvironment();
  t.context.getRegistrationStub = sinon.stub(navigator.serviceWorker, 'getRegistration').resolves(null);
  const manager = new ServiceWorkerManager(null, {
    workerAPath: new Path('/wOrKeR-a.js'),
    workerBPath: new Path('/wOrKeR-b.js'),
    registrationOptions: {
      scope: '/'
    }
  });
  t.is(await manager.getActiveState(), ServiceWorkerActiveState.None);
  t.context.getRegistrationStub.restore();
});

test('getActiveState() detects worker A, case insensitive', async t => {
  await TestEnvironment.stubDomEnvironment();

  const mockWorkerRegistration = new ServiceWorkerRegistration();
  const mockInstallingWorker = new ServiceWorker();
  mockInstallingWorker.state = "activated";
  mockInstallingWorker.scriptURL = "https://site.com/Worker-A.js";
  mockWorkerRegistration.active = mockInstallingWorker;

  t.context.getRegistrationStub = sinon.stub(navigator.serviceWorker, 'getRegistration').resolves(mockWorkerRegistration);
  const manager = new ServiceWorkerManager(null, {
    workerAPath: new Path('/wOrKeR-a.js'),
    workerBPath: new Path('/wOrKeR-b.js'),
    registrationOptions: {
      scope: '/'
    }
  });
  t.is(await manager.getActiveState(), ServiceWorkerActiveState.WorkerA);
  t.context.getRegistrationStub.restore();
});

test('getActiveState() detects worker B, case insensitive', async t => {
  await TestEnvironment.stubDomEnvironment();

  const mockWorkerRegistration = new ServiceWorkerRegistration();
  const mockInstallingWorker = new ServiceWorker();
  mockInstallingWorker.state = "activated";
  mockInstallingWorker.scriptURL = "https://site.com/Worker-B.js";
  mockWorkerRegistration.active = mockInstallingWorker;

  t.context.getRegistrationStub = sinon.stub(navigator.serviceWorker, 'getRegistration').resolves(mockWorkerRegistration);
  const manager = new ServiceWorkerManager(null, {
    workerAPath: new Path('/wOrKeR-a.js'),
    workerBPath: new Path('/wOrKeR-b.js'),
    registrationOptions: {
      scope: '/'
    }
  });
  t.is(await manager.getActiveState(), ServiceWorkerActiveState.WorkerB);
  t.context.getRegistrationStub.restore();
});

test('getActiveState() detects a 3rd party worker, a worker that is installing (not active)', async t => {
  await TestEnvironment.stubDomEnvironment();

  const mockWorkerRegistration = new ServiceWorkerRegistration();
  const mockInstallingWorker = new ServiceWorker();
  mockInstallingWorker.state = "installing";
  mockWorkerRegistration.installing = mockInstallingWorker;

  t.context.getRegistrationStub = sinon.stub(navigator.serviceWorker, 'getRegistration').resolves(mockWorkerRegistration);
  const manager = new ServiceWorkerManager(null, {
    workerAPath: new Path('/wOrKeR-a.js'),
    workerBPath: new Path('/wOrKeR-b.js'),
    registrationOptions: {
      scope: '/'
    }
  });
  t.is(await manager.getActiveState(), ServiceWorkerActiveState.ThirdParty);
  t.context.getRegistrationStub.restore();
});

test('getActiveState() detects a 3rd party worker, a worker that is activated but has an unrecognized script URL', async t => {
  await TestEnvironment.stubDomEnvironment();

  const mockWorkerRegistration = new ServiceWorkerRegistration();
  const mockInstallingWorker = new ServiceWorker();
  mockInstallingWorker.state = "activated";
  mockInstallingWorker.scriptURL = "https://site.com/another-service-worker.js";
  mockWorkerRegistration.active = mockInstallingWorker;

  t.context.getRegistrationStub = sinon.stub(navigator.serviceWorker, 'getRegistration').resolves(mockWorkerRegistration);
  const manager = new ServiceWorkerManager(null, {
    workerAPath: new Path('/wOrKeR-a.js'),
    workerBPath: new Path('/wOrKeR-b.js'),
    registrationOptions: {
      scope: '/'
    }
  });
  t.is(await manager.getActiveState(), ServiceWorkerActiveState.ThirdParty);
  t.context.getRegistrationStub.restore();
});


