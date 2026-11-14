// Use: see docs/implementation/FUNNEL_MAPPER_CLOUDFLARE.md (go-live log). Env: SPLIT_PROXY (the session proxy), FMP_DIR (apps/funnel-mapper, for undici).
// Sends only Workers static-asset uploads (signed with their own short-lived upload key) straight to Cloudflare;
// everything else goes through the session proxy, which adds the API token. The API token never enters this process.
import { createRequire } from 'node:module';
const require = createRequire(process.env.FMP_DIR + '/package.json');
const { Agent, ProxyAgent, Dispatcher, setGlobalDispatcher } = require('undici');
const proxy = new ProxyAgent(process.env.SPLIT_PROXY);
const direct = new Agent();
class Split extends Dispatcher {
  dispatch(opts, handler) {
    const isUpload = String(opts.path || '').includes('/workers/assets/upload');
    return (isUpload ? direct : proxy).dispatch(opts, handler);
  }
  close() { return Promise.all([proxy.close(), direct.close()]); }
  destroy() { return Promise.all([proxy.destroy(), direct.destroy()]); }
}
setGlobalDispatcher(new Split());
