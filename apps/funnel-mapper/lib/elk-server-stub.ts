// The server never lays out maps (Tidy Up runs in the browser). Aliased in next.config.ts so the 1.4 MB elkjs bundle stays out of
// the server bundle, which must fit Cloudflare's free 3 MiB limit.
export default class ELK {
  layout(): never {
    throw new Error("Tidy Up runs in the browser");
  }
}
