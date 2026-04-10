import test from "node:test";
import assert from "node:assert/strict";

import {
  getBoardPreviewMode,
  getBoardWindowSize,
  getLayoutMode,
  getSelectedPlanTicketIndex,
  getSelectedStatusIndex,
  getSelectedTicketIndex,
  getVisiblePanes,
  initialUIState,
  uiReducer
} from "../dist/tui/ui-state.js";

test("layout helpers pick responsive modes and pane sets", () => {
  assert.equal(getLayoutMode(180), "wide");
  assert.equal(getLayoutMode(140), "medium");
  assert.equal(getLayoutMode(110), "compact");
  assert.equal(getLayoutMode(90), "narrow");

  assert.deepEqual(getVisiblePanes("wide", "board"), ["epics", "board"]);
  assert.deepEqual(getVisiblePanes("medium", "people"), ["people", "board"]);
  assert.deepEqual(getVisiblePanes("compact", "board"), ["board"]);
  assert.deepEqual(getVisiblePanes("wide", "plan"), ["plan", "board"]);
  assert.deepEqual(getVisiblePanes("narrow", "board"), ["board"]);

  assert.equal(getBoardWindowSize("wide", 180), Number.POSITIVE_INFINITY);
  assert.equal(getBoardWindowSize("medium", 140), 3);
  assert.equal(getBoardWindowSize("medium", 155), 4);
  assert.equal(getBoardWindowSize("compact", 110), 3);
  assert.equal(getBoardWindowSize("compact", 120), 4);
  assert.equal(getBoardWindowSize("narrow", 90), 2);
  assert.equal(getBoardWindowSize("narrow", 60), 1);
  assert.equal(getBoardPreviewMode("compact", 110), true);
  assert.equal(getBoardPreviewMode("narrow", 90), true);
  assert.equal(getBoardPreviewMode("narrow", 60), false);
});

test("repair keeps the selected empty status column instead of snapping away", () => {
  let state = initialUIState;

  state = uiReducer(state, {
    type: "move-status",
    statuses: ["backlog", "ready", "in_progress"],
    offset: 1
  });

  state = uiReducer(state, {
    type: "repair",
    payload: {
      epicIds: ["__all__", "E-0001"],
      assigneeIds: ["codex/main", "__unassigned__"],
      planBucketIds: ["ready", "wave-1"],
      statuses: ["backlog", "ready", "in_progress"],
      ticketCounts: {
        backlog: 1,
        ready: 0,
        in_progress: 2
      },
      personTicketCount: 0,
      planTicketCounts: {
        ready: 1,
        "wave-1": 2
      },
      layoutMode: "wide",
      view: "board"
    }
  });

  assert.equal(getSelectedStatusIndex(state), 1);
  assert.equal(getSelectedTicketIndex(state, "ready"), 0);
});

test("view switching resets focus to the first visible pane for that route", () => {
  let state = uiReducer(initialUIState, {
    type: "set-view",
    view: "people",
    layoutMode: "wide"
  });

  assert.equal(state.view, "people");
  assert.equal(state.focusPane, "people");

  state = uiReducer(state, {
    type: "set-view",
    view: "plan",
    layoutMode: "wide"
  });

  assert.equal(state.view, "plan");
  assert.equal(state.focusPane, "plan");

  state = uiReducer(state, {
    type: "set-view",
    view: "board",
    layoutMode: "medium"
  });

  assert.equal(state.view, "board");
  assert.equal(state.focusPane, "epics");
});

test("select-ticket updates board cursor while select-person-ticket updates people list selection", () => {
  let state = initialUIState;

  state = uiReducer(state, {
    type: "select-ticket",
    status: "in_progress",
    statusIndex: 2,
    ticketIndex: 3
  });

  assert.equal(getSelectedStatusIndex(state), 2);
  assert.equal(getSelectedTicketIndex(state, "in_progress"), 3);

  state = uiReducer(state, {
    type: "set-view",
    view: "people",
    layoutMode: "wide"
  });
  state = uiReducer(state, {
    type: "select-person-ticket",
    ticketIndex: 4
  });

  assert.equal(state.selectedPersonTicketIndex, 4);

  state = uiReducer(state, {
    type: "set-view",
    view: "plan",
    layoutMode: "wide"
  });
  state = uiReducer(state, {
    type: "set-plan-bucket",
    bucketId: "ready"
  });
  state = uiReducer(state, {
    type: "select-plan-ticket",
    ticketIndex: 2
  });

  assert.equal(getSelectedPlanTicketIndex(state, "ready"), 2);
});

test("repair drops detail focus because detail is modal-only", () => {
  let state = uiReducer(initialUIState, {
    type: "set-focus",
    pane: "detail"
  });

  state = uiReducer(state, {
    type: "repair",
    payload: {
      epicIds: ["__all__"],
      assigneeIds: ["__unassigned__"],
      planBucketIds: ["ready"],
      statuses: ["backlog"],
      ticketCounts: { backlog: 1 },
      personTicketCount: 1,
      planTicketCounts: { ready: 1 },
      layoutMode: "wide",
      view: "board"
    }
  });

  assert.equal(state.focusPane, "board");
});
