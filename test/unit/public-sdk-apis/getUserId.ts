import "../../support/polyfills/polyfills";
import test from "ava";
import Database from "../../../src/services/Database";
import Macros from "../../support/tester/Macros";
import {TestEnvironment} from "../../support/sdk/TestEnvironment";
import OneSignal from "../../../src/OneSignal";
import { Subscription } from '../../../src/models/Subscription';
import { Uuid } from '../../../src/models/Uuid';


test("getUserId should return the correct string", async t => {
  await TestEnvironment.initialize();
  const subscription = new Subscription();
  subscription.deviceId = new Uuid('f7cf25b7-246a-42a1-8c40-eb8eae19cc9e');
  await OneSignal.database.setSubscription(subscription);
  const userIdByPromise = await OneSignal.getUserId()
  const userIdByCallback = await new Promise(resolve => {
    OneSignal.getUserId(resolve)
  });
  t.is(userIdByPromise, 'f7cf25b7-246a-42a1-8c40-eb8eae19cc9e');
  t.is(userIdByCallback, 'f7cf25b7-246a-42a1-8c40-eb8eae19cc9e');
});
