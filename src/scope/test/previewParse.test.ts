import { describe, expect, it } from "vitest";
import { parseCaCommand, parsePreviewCommand, parseTrackingSlewBuffer } from "../previewParse";
import { commitPreviewCommand } from "../previewArea";

describe("T02-114: Preview Grammar for Conflict Alert (CA) & Purge Invented Aliases", () => {
  describe("1. Purged Invented Aliases (*CA, *LA)", () => {
    it("strictly rejects *CA in parsePreviewCommand and commitPreviewCommand", () => {
      expect(parsePreviewCommand("*CA").kind).toBe("invalid");
      expect(parsePreviewCommand("* CA").kind).toBe("invalid");
      expect(commitPreviewCommand("*CA").kind).toBe("invalid");
      expect(commitPreviewCommand("* CA").kind).toBe("invalid");
    });

    it("purges *CA and *LA from parseTrackingSlewBuffer", () => {
      expect(parseTrackingSlewBuffer("*CA")).toBeNull();
      expect(parseTrackingSlewBuffer("*LA")).toBeNull();
    });

    it("does not allow bare *LA to commit as an action", () => {
      expect(commitPreviewCommand("*LA").kind).toBe("invalid");
    });
  });

  describe("2. Authentic CA Command Parsing", () => {
    it("parses bare CA and CA with trailing spaces as caPairSlew", () => {
      expect(parseCaCommand("CA")).toEqual({
        kind: "action",
        action: { type: "caPairSlew" },
      });
      expect(parsePreviewCommand("CA")).toEqual({
        kind: "action",
        action: { type: "caPairSlew" },
      });
      expect(parsePreviewCommand("CA ")).toEqual({
        kind: "action",
        action: { type: "caPairSlew" },
      });
      expect(commitPreviewCommand("CA")).toEqual({
        kind: "action",
        action: { type: "caPairSlew" },
      });
    });

    it("parses CA K <trk> as single-track inhibit toggle", () => {
      expect(parsePreviewCommand("CA K 12")).toEqual({
        kind: "action",
        action: { type: "caSingleTrackInhibit", trk: "12" },
      });
      expect(parsePreviewCommand("CA K AAL100")).toEqual({
        kind: "action",
        action: { type: "caSingleTrackInhibit", trk: "AAL100" },
      });
      expect(parsePreviewCommand("CAK 12")).toEqual({
        kind: "action",
        action: { type: "caSingleTrackInhibit", trk: "12" },
      });
      expect(commitPreviewCommand("CA K 12")).toEqual({
        kind: "action",
        action: { type: "caSingleTrackInhibit", trk: "12" },
      });
    });

    it("parses CA K without a track as a single-track slew action", () => {
      expect(parsePreviewCommand("CA K")).toEqual({
        kind: "action",
        action: { type: "caSingleTrackInhibit" },
      });
      expect(commitPreviewCommand("CAK")).toEqual({
        kind: "action",
        action: { type: "caSingleTrackInhibit" },
      });
    });

    it("rejects CA K with excess arguments", () => {
      expect(parsePreviewCommand("CA K 12 34").kind).toBe("invalid");
    });

    it("parses CA P <trk1> [<trk2>] as pairwise inhibit", () => {
      // trk2 omitted -> wait for slew
      expect(parsePreviewCommand("CA P 12")).toEqual({
        kind: "action",
        action: { type: "caPairInhibit", trk1: "12" },
      });
      expect(parsePreviewCommand("CA P DAL123")).toEqual({
        kind: "action",
        action: { type: "caPairInhibit", trk1: "DAL123" },
      });
      // trk1 and trk2 provided
      expect(parsePreviewCommand("CA P 12 34")).toEqual({
        kind: "action",
        action: { type: "caPairInhibit", trk1: "12", trk2: "34" },
      });
      expect(parsePreviewCommand("CA P DAL123 AAL456")).toEqual({
        kind: "action",
        action: { type: "caPairInhibit", trk1: "DAL123", trk2: "AAL456" },
      });
      expect(parsePreviewCommand("CAP 12 34")).toEqual({
        kind: "action",
        action: { type: "caPairInhibit", trk1: "12", trk2: "34" },
      });
    });

    it("parses CA P without tracks as a two-track inhibit slew action", () => {
      expect(parsePreviewCommand("CA P")).toEqual({
        kind: "action",
        action: { type: "caPairInhibit" },
      });
      expect(commitPreviewCommand("CAP")).toEqual({
        kind: "action",
        action: { type: "caPairInhibit" },
      });
    });

    it("rejects CA P with more than 2 track arguments", () => {
      expect(parsePreviewCommand("CA P 12 34 56").kind).toBe("invalid");
    });

    it("parses CA E <trk1> [<trk2>] as pairwise enable", () => {
      // trk2 omitted -> wait for slew
      expect(parsePreviewCommand("CA E 12")).toEqual({
        kind: "action",
        action: { type: "caPairEnable", trk1: "12" },
      });
      // trk1 and trk2 provided
      expect(parsePreviewCommand("CA E 12 34")).toEqual({
        kind: "action",
        action: { type: "caPairEnable", trk1: "12", trk2: "34" },
      });
      expect(parsePreviewCommand("CAE 12 34")).toEqual({
        kind: "action",
        action: { type: "caPairEnable", trk1: "12", trk2: "34" },
      });
    });

    it("parses CA E without tracks as a two-track enable slew action", () => {
      expect(parsePreviewCommand("CA E")).toEqual({
        kind: "action",
        action: { type: "caPairEnable" },
      });
      expect(commitPreviewCommand("CAE")).toEqual({
        kind: "action",
        action: { type: "caPairEnable" },
      });
    });

    it("rejects CA E with more than 2 track arguments", () => {
      expect(parsePreviewCommand("CA E 12 34 56").kind).toBe("invalid");
    });

    it("strictly rejects non-standard supervisor command aliases (CA A, CA M, CA Q)", () => {
      expect(parsePreviewCommand("CA A").kind).toBe("invalid");
      expect(parsePreviewCommand("CA M").kind).toBe("invalid");
      expect(parsePreviewCommand("CA Q").kind).toBe("invalid");
      expect(parsePreviewCommand("CA XYZ").kind).toBe("invalid");
    });

    it("treats single letter 'C' as incomplete prefix", () => {
      expect(parsePreviewCommand("C")).toEqual({ kind: "incomplete" });
      expect(commitPreviewCommand("C").kind).toBe("invalid");
    });
  });
});
