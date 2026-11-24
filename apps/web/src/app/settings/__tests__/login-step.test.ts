import { describe, expect, it } from "vitest";
import { loginStep } from "../login-step";

const docker = {
  viewerUrl: "http://127.0.0.1:6080/vnc.html",
  message:
    "Open http://127.0.0.1:6080/vnc.html, log in with your password manager and 2FA, then click Done.",
};
const mac = {
  viewerUrl: null,
  message:
    "A Google Chrome window opened with the isolated profile. Log in there, then click Done.",
};

describe("loginStep (remote-access spec: actions that happen on the Mac)", () => {
  it("at the Mac, keeps the worker's message and the local viewer link", () => {
    expect(loginStep(false, docker)).toEqual(docker);
    expect(loginStep(false, mac)).toEqual(mac);
  });

  it("through another address, says the login happens on the Mac, with no link", () => {
    const window = loginStep(true, mac);
    expect(window).toEqual({
      viewerUrl: null,
      message:
        "A login window opened on the Mac, with the isolated profile. Log in there, then click Done.",
    });
  });

  it("in Docker, names the viewer address on the Mac as text instead of a link", () => {
    expect(loginStep(true, docker)).toEqual({
      viewerUrl: null,
      message:
        "On the Mac, open http://127.0.0.1:6080/vnc.html, log in with your password manager and 2FA, then click Done.",
    });
  });
});
