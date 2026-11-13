// Funnel Mapper runs under the ecosystem's own address (office.example.com/fmp: one address for every app, owner 13 Nov 2026).
// Next.js adds the base path to <Link>, router and redirect() itself; plain addresses (fetch, <form action>, <img src>, copied share links)
// go through withBase. Empty in local development and tests.
export const BASE_PATH = (process.env.NEXT_PUBLIC_BASE_PATH ?? "").replace(/\/$/, "");
export const withBase = (path: string) => `${BASE_PATH}${path}`;
