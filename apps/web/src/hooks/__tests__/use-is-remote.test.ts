import { createElement } from "react";
import { renderToString } from "react-dom/server";
import { describe, expect, it } from "vitest";
import { isRemoteHost, useIsRemote } from "../use-is-remote";

function Probe() {
  return createElement("span", null, String(useIsRemote()));
}

describe("useIsRemote (remote-access spec, design D4)", () => {
  it("is false on the server", () => {
    expect(renderToString(createElement(Probe))).toBe("<span>false</span>");
  });

  it("is false for the Mac's own addresses", () => {
    for (const host of ["127.0.0.1", "localhost", "[::1]", "LOCALHOST"])
      expect(isRemoteHost(host), host).toBe(false);
  });

  it("is true for any other host, such as the tailnet name", () => {
    expect(isRemoteHost("my-mac.tailnet-name.ts.net")).toBe(true);
    expect(isRemoteHost("100.64.0.1")).toBe(true);
  });
});
