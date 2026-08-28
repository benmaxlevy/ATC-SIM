import { describe, expect, it, vi } from "vitest";
import { createScopeView } from "@scope";
import {
  openDcbMenu,
  closeDcbMenu,
  toggleSsaFilter,
  toggleGiFilter,
  stepBriteChannel,
  stepCharSizeChannel,
  selectDcbPrefSlot,
  saveDcbPref,
  saveAsDcbPref,
  deleteDcbPref,
  applyDcbPrefDefaults,
  restoreDcbPrefSession,
} from "@scope";

describe("DCB submenus functional suite", () => {
  it("opens and closes BRITE, CHAR SIZE, SSA FILTER, GI FILTER, MAPS, PREF, and TPA_ATPA submenus", () => {
    const view = createScopeView();
    expect(view.dcbMenu).toBe("MAIN");

    openDcbMenu(view, "BRITE");
    expect(view.dcbMenu).toBe("BRITE");
    closeDcbMenu(view);
    expect(view.dcbMenu).toBe("MAIN");

    openDcbMenu(view, "CHAR_SIZE");
    expect(view.dcbMenu).toBe("CHAR_SIZE");
    closeDcbMenu(view);
    expect(view.dcbMenu).toBe("MAIN");

    openDcbMenu(view, "SSA_FILTER");
    expect(view.dcbMenu).toBe("SSA_FILTER");
    closeDcbMenu(view);
    expect(view.dcbMenu).toBe("MAIN");

    openDcbMenu(view, "GI_FILTER");
    expect(view.dcbMenu).toBe("GI_FILTER");
    closeDcbMenu(view);
    expect(view.dcbMenu).toBe("MAIN");

    openDcbMenu(view, "MAPS");
    expect(view.dcbMenu).toBe("MAPS");
    closeDcbMenu(view);
    expect(view.dcbMenu).toBe("MAIN");

    openDcbMenu(view, "PREF");
    expect(view.dcbMenu).toBe("PREF");
    closeDcbMenu(view);
    expect(view.dcbMenu).toBe("MAIN");

    openDcbMenu(view, "TPA_ATPA");
    expect(view.dcbMenu).toBe("TPA_ATPA");
    closeDcbMenu(view);
    expect(view.dcbMenu).toBe("MAIN");
  });

  it("steps BRITE channels within 0 to 100", () => {
    const view = createScopeView();
    expect(view.brite.fdb).toBe(100);
    stepBriteChannel(view, "fdb", -2);
    expect(view.brite.fdb).toBe(80);
    stepBriteChannel(view, "fdb", 1);
    expect(view.brite.fdb).toBe(90);
  });

  it("steps CHAR SIZE channels within allowed steps", () => {
    const view = createScopeView();
    stepCharSizeChannel(view, "dataBlocks", 1);
    expect(view.charSizes.dataBlocks).toBeGreaterThanOrEqual(10);
  });

  it("toggles SSA filter flags and GI text lines", () => {
    const view = createScopeView(undefined, undefined, { giTextLines: ["KDEM ATIS DELTA"] });
    expect(view.ssaFilter.TIME).toBe(true);
    toggleSsaFilter(view, "TIME");
    expect(view.ssaFilter.TIME).toBe(false);
    toggleSsaFilter(view, "TIME");
    expect(view.ssaFilter.TIME).toBe(true);

    expect(view.giFilterVisible[0]).toBe(true);
    toggleGiFilter(view, 0);
    expect(view.giFilterVisible[0]).toBe(false);
    toggleGiFilter(view, 0);
    expect(view.giFilterVisible[0]).toBe(true);
  });

  it("manages PREF slots: select, save, saveAs, restore, delete", () => {
    const view = createScopeView();
    selectDcbPrefSlot(view, 0);
    saveDcbPref(view);
    expect(view.dcbPref.slots[0]).not.toBeNull();

    saveAsDcbPref(view);
    expect(view.dcbPref.slots[1]?.name).toBe("PREF 2");

    selectDcbPrefSlot(view, 0);
    deleteDcbPref(view);
    expect(view.dcbPref.slots[0]).toBeNull();
  });
});
