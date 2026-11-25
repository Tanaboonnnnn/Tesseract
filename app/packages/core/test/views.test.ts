import { describe, expect, it } from "vitest";
import { noteDetail } from "../src/index.ts";
import { makeStore } from "./helpers.ts";

describe("noteDetail", () => {
  it("resolves wikilinks by note title, note id and other entity ids", () => {
    const store = makeStore();
    store.createNote({ id: "tcp-handshake", title: "TCP Handshake", body: "SYN, SYN-ACK, ACK" });
    store.createNote({
      id: "network-study",
      title: "Network study",
      body: "See [[TCP Handshake]], [[tcp-handshake]], [[weather-app]], [[Kubernetes]], [[Packet Analysis]] and [[nothing here]].",
    });
    const n = noteDetail(store, "network-study");
    expect(n.wikilinks).toEqual([
      { text: "TCP Handshake", ref: "notes/tcp-handshake" },
      { text: "tcp-handshake", ref: "notes/tcp-handshake" },
      { text: "weather-app", ref: "projects/weather-app" },
      { text: "Kubernetes", ref: "learning/kubernetes" },
      { text: "Packet Analysis", ref: "skills/packet-analysis" },
      { text: "nothing here", ref: null },
    ]);
  });

  it("finds backlinks from wikilinks and explicit links", () => {
    const store = makeStore();
    store.createNote({ id: "target", title: "Target" });
    store.createNote({ id: "a", title: "A", body: "Points to [[Target]]" });
    store.createNote({ id: "b", title: "B", links: ["notes/target"] });
    store.createNote({ id: "c", title: "C", body: "Unrelated" });
    expect(noteDetail(store, "target").backlinks.map((b) => b.id)).toEqual(["a", "b"]);
  });

  it("supports [[target|alias]]", () => {
    const store = makeStore();
    store.createNote({ id: "x", title: "X", body: "[[weather-app|my lab]]" });
    expect(noteDetail(store, "x").wikilinks).toEqual([{ text: "weather-app|my lab", ref: "projects/weather-app" }]);
  });
});
