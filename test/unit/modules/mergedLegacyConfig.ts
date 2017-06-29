import "../../support/polyfills/polyfills";
import test from "ava";
import InitHelper from "../../../src/helpers/InitHelper";
import { AppConfig } from '../../../src/models/AppConfig';

test.beforeEach(t => {
  t.context.serverConfig = new AppConfig();
});

test("should assign a default service worker file path if not provided", async t => {
  const result = InitHelper.getMergedLegacyConfig({}, t.context.serverConfig);
  t.is(result.path, '/');
});

test("should not overwrite a provided service worker file path", async t => {
  const result = InitHelper.getMergedLegacyConfig({
    path: '/existing-path'
  }, t.context.serverConfig);
  t.is(result.path, '/existing-path');
});

test("should not assign downloaded subdomain if not provided", async t => {
  t.context.serverConfig.subdomain = 'test-subdomain';
  const result = InitHelper.getMergedLegacyConfig({}, t.context.serverConfig);
  t.is(result.subdomainName, undefined);
});

test("should not overwrite provided subdomain", async t => {
  t.context.serverConfig.subdomain = 'test-subdomain';
  const result = InitHelper.getMergedLegacyConfig({
    subdomainName: 'existing-subdomain'
  }, t.context.serverConfig);
  t.is(result.subdomainName, 'existing-subdomain');
});

test("should assign downloaded safari web ID if not provided", async t => {
  t.context.serverConfig.safariWebId = 'web.onesignal.auto.01ea4289-b460-45e4-8d90-838752554827';
  const result = InitHelper.getMergedLegacyConfig({}, t.context.serverConfig);
  t.is(result.safari_web_id, t.context.serverConfig.safariWebId);
});

test("should not overwrite provided safari web ID", async t => {
  t.context.serverConfig.safariWebId = 'web.onesignal.auto.01ea4289-b460-45e4-8d90-838752554827';
  const result = InitHelper.getMergedLegacyConfig({
    safari_web_id: 'web.onesignal.auto.01ea4289-b460-45e4-8d90-838752551111'
  }, t.context.serverConfig);
  t.is(result.safari_web_id, 'web.onesignal.auto.01ea4289-b460-45e4-8d90-838752551111');
});


