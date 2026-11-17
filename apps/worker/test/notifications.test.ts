import { listNotifications, unreadCount } from "@job-radar/db";
import request from "supertest";
import { describe, expect, it } from "vitest";
import { createApp } from "../src/app";
import { Notifier } from "../src/notifier";
import { strongMatchNotification } from "../src/notifications/messages";
import { seedScoredOffer } from "./helpers";

describe("in-app notifications", () => {
  it("stores one strong-match notification per offer and runs delivery hooks once", () => {
    const s = seedScoredOffer();
    const notifier = new Notifier(s.db);
    const delivered: number[] = [];
    notifier.onCreated((n) => void delivered.push(n.id));
    const first = notifier.notify(strongMatchNotification(s.offer, s.score));
    const again = notifier.notify(strongMatchNotification(s.offer, s.score));
    expect(first).not.toBeNull();
    expect(again).toBeNull();
    expect(delivered).toEqual([first!.id]);
    expect(first).toMatchObject({
      kind: "strong_match",
      title: "Strong match 88: Senior AI Engineer at " + s.offer.companyName,
      offerId: s.offer.id,
    });
    expect(first!.body).toBe("Score 88 · 90 EUR per hour\nExcellent overlap with your RAG work.");
  });

  it("lists, counts and marks notifications read through the API", async () => {
    const s = seedScoredOffer();
    const notifier = new Notifier(s.db);
    notifier.notify(strongMatchNotification(s.offer, s.score));
    notifier.notify({ kind: "source_stopped", title: "RemoteOK stopped", body: "429" });
    const app = createApp({ db: s.db, profile: s.profile });
    const list = await request(app).get("/notifications").expect(200);
    expect(list.body.unread).toBe(2);
    expect(list.body.items.map((n: { kind: string }) => n.kind).sort()).toEqual([
      "source_stopped",
      "strong_match",
    ]);
    const firstId = list.body.items[0].id as number;
    await request(app)
      .post("/notifications/read")
      .send({ ids: [firstId] })
      .expect(200, { changed: 1, unread: 1 });
    expect((await request(app).get("/notifications?unread=1")).body.items).toHaveLength(1);
    await request(app).post(`/notifications/${firstId}/unread`).expect(200, { unread: 2 });
    await request(app)
      .post("/notifications/read")
      .send({ all: true })
      .expect(200, { changed: 2, unread: 0 });
    await request(app).post("/notifications/read").send({ nope: 1 }).expect(400);
    expect(unreadCount(s.db)).toBe(0);
    expect(listNotifications(s.db)).toHaveLength(2);
  });
});
