import { describe, it, expect } from "vitest";
import { parseDeepLink } from "./deep-links";

describe("parseDeepLink", () => {
  it("reads the auth code", () => {
    expect(parseDeepLink("de.latentdev.athlete://auth/callback?code=abc123")).toEqual({
      kind: "auth",
      code: "abc123",
    });
  });

  it("reports a provider error", () => {
    expect(
      parseDeepLink(
        "de.latentdev.athlete://auth/callback?error=access_denied&error_description=Nope",
      ),
    ).toEqual({ kind: "auth-error", message: "Nope" });
  });

  it("reads errors from the hash fragment", () => {
    expect(
      parseDeepLink(
        "de.latentdev.athlete://auth/callback#error=access_denied&error_description=Link+abgelaufen",
      ),
    ).toEqual({ kind: "auth-error", message: "Link abgelaufen" });
  });

  it("keeps dot segments inside the allowed route", () => {
    const link = parseDeepLink("de.latentdev.athlete://sport/../einstellungen");
    expect(link.kind === "route" ? link.path.startsWith("/sport") : true).toBe(true);
  });

  it("maps the strava return to the settings route and keeps the query", () => {
    expect(
      parseDeepLink("de.latentdev.athlete://einstellungen?strava=pending&state=s&claim=c"),
    ).toEqual({ kind: "route", path: "/einstellungen?strava=pending&state=s&claim=c" });
  });

  it("ignores other schemes and unknown hosts", () => {
    expect(parseDeepLink("https://evil.example/einstellungen")).toEqual({ kind: "ignore" });
    expect(parseDeepLink("de.latentdev.athlete://admin/delete")).toEqual({ kind: "ignore" });
    expect(parseDeepLink("not a url")).toEqual({ kind: "ignore" });
  });
});
