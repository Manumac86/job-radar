// Bundled by test/bundle.test.ts with the app's esbuild options. It names the global AbortSignal,
// as the worker does, so esbuild has to rename the abort-controller polyfill grammY loads.
import { Bot } from "grammy";

const nativeSignal: typeof AbortSignal = AbortSignal;
const bot = new Bot("123:test", { client: { apiRoot: process.env["API_ROOT"] } });
try {
  const me = await bot.api.getMe();
  console.log(JSON.stringify({ ok: true, username: me.username, native: typeof nativeSignal }));
} catch (err) {
  console.log(JSON.stringify({ ok: false, error: String(err) }));
}
