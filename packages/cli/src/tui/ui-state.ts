import { ALL_EPICS_ID, UNASSIGNED_ID } from "./model.js";

export type AppView = "board" | "people" | "plan";
export type FocusPane = "epics" | "people" | "plan" | "board" | "detail";
export type DialogKind = "status" | "assign" | "search" | "help" | "command" | "create-ticket";
export type OverlayKind = "epics" | "detail" | "people" | "plan";
export type LayoutMode = "wide" | "medium" | "compact" | "narrow";

export interface BoardCursor {
  statusIndex: number;
  ticketIndexByStatus: Record<string, number>;
}

export interface UIState {
  view: AppView;
  focusPane: FocusPane;
  selectedEpicId: string;
  selectedAssignee: string;
  selectedPlanBucket: string;
  selectedPersonTicketIndex: number;
  searchQuery: string;
  dialog: DialogKind | null;
  overlay: OverlayKind | null;
  boardByEpic: Record<string, BoardCursor>;
  planTicketIndexByBucket: Record<string, number>;
}

interface RepairPayload {
  epicIds: string[];
  assigneeIds: string[];
  planBucketIds: string[];
  statuses: string[];
  ticketCounts: Record<string, number>;
  personTicketCount: number;
  planTicketCounts: Record<string, number>;
  layoutMode: LayoutMode;
  view: AppView;
}

type UIAction =
  | { type: "set-view"; view: AppView; layoutMode: LayoutMode }
  | { type: "cycle-focus"; layoutMode: LayoutMode; view: AppView }
  | { type: "set-focus"; pane: FocusPane }
  | { type: "move-epic"; epicIds: string[]; offset: number }
  | { type: "set-epic"; epicId: string }
  | { type: "move-person"; assigneeIds: string[]; offset: number }
  | { type: "set-person"; assignee: string }
  | { type: "move-plan-bucket"; bucketIds: string[]; offset: number }
  | { type: "set-plan-bucket"; bucketId: string }
  | { type: "move-status"; statuses: string[]; offset: number }
  | { type: "move-ticket"; statuses: string[]; ticketCounts: Record<string, number>; offset: number }
  | { type: "move-person-ticket"; ticketCount: number; offset: number }
  | { type: "move-plan-ticket"; ticketCount: number; offset: number }
  | { type: "select-ticket"; status: string; statusIndex: number; ticketIndex: number }
  | { type: "select-person-ticket"; ticketIndex: number }
  | { type: "select-plan-ticket"; ticketIndex: number }
  | { type: "open-dialog"; dialog: DialogKind }
  | { type: "close-dialog" }
  | { type: "open-overlay"; overlay: OverlayKind }
  | { type: "close-overlay" }
  | { type: "set-search"; searchQuery: string }
  | { type: "repair"; payload: RepairPayload };

export const initialUIState: UIState = {
  view: "board",
  focusPane: "board",
  selectedEpicId: ALL_EPICS_ID,
  selectedAssignee: UNASSIGNED_ID,
  selectedPlanBucket: "ready",
  selectedPersonTicketIndex: 0,
  searchQuery: "",
  dialog: null,
  overlay: null,
  boardByEpic: {},
  planTicketIndexByBucket: {}
};

export function getLayoutMode(width: number): LayoutMode {
  if (width >= 168) {
    return "wide";
  }
  if (width >= 132) {
    return "medium";
  }
  if (width >= 96) {
    return "compact";
  }
  return "narrow";
}

export function getVisiblePanes(layoutMode: LayoutMode, view: AppView): FocusPane[] {
  if (view === "board") {
    if (layoutMode === "wide") {
      return ["epics", "board"];
    }
    if (layoutMode === "medium") {
      return ["epics", "board"];
    }
    if (layoutMode === "compact") {
      return ["board"];
    }
    return ["board"];
  }

  if (view === "people") {
    if (layoutMode === "wide") {
      return ["people", "board"];
    }
    if (layoutMode === "medium") {
      return ["people", "board"];
    }
    if (layoutMode === "compact") {
      return ["board"];
    }
    return ["board"];
  }

  if (layoutMode === "wide") {
    return ["plan", "board"];
  }
  if (layoutMode === "medium") {
    return ["plan", "board"];
  }
  if (layoutMode === "compact") {
    return ["board"];
  }
  return ["board"];
}

export function getBoardWindowSize(layoutMode: LayoutMode, width: number): number {
  if (layoutMode === "wide") {
    return Number.POSITIVE_INFINITY;
  }
  if (layoutMode === "medium") {
    return width >= 152 ? 4 : 3;
  }
  if (layoutMode === "compact") {
    return width >= 118 ? 4 : 3;
  }
  return width >= 68 ? 2 : 1;
}

export function getBoardPreviewMode(layoutMode: LayoutMode, width: number): boolean {
  if (layoutMode === "compact") {
    return true;
  }
  if (layoutMode === "narrow") {
    return width >= 68;
  }
  return false;
}

function clamp(value: number, minimum: number, maximum: number): number {
  return Math.max(minimum, Math.min(maximum, value));
}

function getCursor(state: UIState, epicId: string): BoardCursor {
  return state.boardByEpic[epicId] ?? { statusIndex: 0, ticketIndexByStatus: {} };
}

function withCursor(state: UIState, epicId: string, cursor: BoardCursor): UIState {
  return {
    ...state,
    boardByEpic: {
      ...state.boardByEpic,
      [epicId]: cursor
    }
  };
}

function repairCursor(cursor: BoardCursor, payload: RepairPayload): BoardCursor {
  const maxStatusIndex = Math.max(0, payload.statuses.length - 1);
  const statusIndex = clamp(cursor.statusIndex, 0, maxStatusIndex);
  const ticketIndexByStatus: Record<string, number> = {};

  for (const status of payload.statuses) {
    const count = payload.ticketCounts[status] ?? 0;
    const currentIndex = cursor.ticketIndexByStatus[status] ?? 0;
    ticketIndexByStatus[status] = count > 0 ? clamp(currentIndex, 0, count - 1) : 0;
  }

  return {
    statusIndex,
    ticketIndexByStatus
  };
}

function cycleCurrentFocus(current: FocusPane, layoutMode: LayoutMode, view: AppView): FocusPane {
  const panes = getVisiblePanes(layoutMode, view);
  const currentIndex = panes.indexOf(current);
  const baseIndex = currentIndex >= 0 ? currentIndex : 0;
  return panes[(baseIndex + 1) % panes.length] ?? panes[0] ?? "board";
}

function repairState(state: UIState, payload: RepairPayload): UIState {
  const epicIds = payload.epicIds.length > 0 ? payload.epicIds : [ALL_EPICS_ID];
  const assigneeIds = payload.assigneeIds.length > 0 ? payload.assigneeIds : [UNASSIGNED_ID];
  const planBucketIds = payload.planBucketIds.length > 0 ? payload.planBucketIds : ["ready"];
  const nextEpicId = epicIds.includes(state.selectedEpicId) ? state.selectedEpicId : ALL_EPICS_ID;
  const nextAssignee = assigneeIds.includes(state.selectedAssignee) ? state.selectedAssignee : assigneeIds[0] ?? UNASSIGNED_ID;
  const nextPlanBucket = planBucketIds.includes(state.selectedPlanBucket) ? state.selectedPlanBucket : planBucketIds[0] ?? "ready";
  const nextCursor = repairCursor(getCursor(state, nextEpicId), payload);
  const visiblePanes = getVisiblePanes(payload.layoutMode, payload.view);

  const overlay = payload.layoutMode === "wide"
    ? null
    : payload.layoutMode === "medium" && (state.overlay === "epics" || state.overlay === "people" || state.overlay === "plan")
      ? null
      : state.overlay;

  const nextState = withCursor(
    {
      ...state,
      view: payload.view,
      selectedEpicId: nextEpicId,
      selectedAssignee: nextAssignee,
      selectedPlanBucket: nextPlanBucket,
      selectedPersonTicketIndex: payload.personTicketCount > 0
        ? clamp(state.selectedPersonTicketIndex, 0, payload.personTicketCount - 1)
        : 0,
      planTicketIndexByBucket: Object.fromEntries(
        planBucketIds.map((bucketId) => {
          const count = payload.planTicketCounts[bucketId] ?? 0;
          const currentIndex = state.planTicketIndexByBucket[bucketId] ?? 0;
          return [bucketId, count > 0 ? clamp(currentIndex, 0, count - 1) : 0];
        })
      ),
      focusPane: visiblePanes.includes(state.focusPane) ? state.focusPane : "board",
      overlay
    },
    nextEpicId,
    nextCursor
  );

  if (nextState.focusPane === "detail") {
    return {
      ...nextState,
      focusPane: "board"
    };
  }

  return nextState;
}

export function uiReducer(state: UIState, action: UIAction): UIState {
  switch (action.type) {
    case "set-view":
      return {
        ...state,
        view: action.view,
        focusPane: getVisiblePanes(action.layoutMode, action.view)[0] ?? "board",
        overlay: null,
        dialog: null
      };
    case "cycle-focus":
      if (state.dialog || state.overlay) {
        return state;
      }
      return {
        ...state,
        focusPane: cycleCurrentFocus(state.focusPane, action.layoutMode, action.view)
      };
    case "set-focus":
      return {
        ...state,
        focusPane: action.pane
      };
    case "move-epic": {
      const epicIds = action.epicIds.length > 0 ? action.epicIds : [ALL_EPICS_ID];
      const currentIndex = epicIds.indexOf(state.selectedEpicId);
      const baseIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = clamp(baseIndex + action.offset, 0, epicIds.length - 1);
      return {
        ...state,
        selectedEpicId: epicIds[nextIndex] ?? ALL_EPICS_ID
      };
    }
    case "set-epic":
      return {
        ...state,
        selectedEpicId: action.epicId,
        overlay: state.overlay === "epics" ? null : state.overlay,
        focusPane: "board"
      };
    case "move-person": {
      const assigneeIds = action.assigneeIds.length > 0 ? action.assigneeIds : [UNASSIGNED_ID];
      const currentIndex = assigneeIds.indexOf(state.selectedAssignee);
      const baseIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = clamp(baseIndex + action.offset, 0, assigneeIds.length - 1);
      return {
        ...state,
        selectedAssignee: assigneeIds[nextIndex] ?? UNASSIGNED_ID,
        selectedPersonTicketIndex: 0
      };
    }
    case "set-person":
      return {
        ...state,
        selectedAssignee: action.assignee,
        selectedPersonTicketIndex: 0,
        overlay: state.overlay === "people" ? null : state.overlay,
        focusPane: "board"
      };
    case "move-plan-bucket": {
      const bucketIds = action.bucketIds.length > 0 ? action.bucketIds : ["ready"];
      const currentIndex = bucketIds.indexOf(state.selectedPlanBucket);
      const baseIndex = currentIndex >= 0 ? currentIndex : 0;
      const nextIndex = clamp(baseIndex + action.offset, 0, bucketIds.length - 1);
      return {
        ...state,
        selectedPlanBucket: bucketIds[nextIndex] ?? "ready"
      };
    }
    case "set-plan-bucket":
      return {
        ...state,
        selectedPlanBucket: action.bucketId,
        overlay: state.overlay === "plan" ? null : state.overlay,
        focusPane: "board"
      };
    case "move-status": {
      const cursor = getCursor(state, state.selectedEpicId);
      const maxStatusIndex = Math.max(0, action.statuses.length - 1);
      const nextCursor: BoardCursor = {
        ...cursor,
        statusIndex: clamp(cursor.statusIndex + action.offset, 0, maxStatusIndex)
      };
      return withCursor(state, state.selectedEpicId, nextCursor);
    }
    case "move-ticket": {
      const cursor = getCursor(state, state.selectedEpicId);
      const status = action.statuses[cursor.statusIndex];
      if (!status) {
        return state;
      }
      const count = action.ticketCounts[status] ?? 0;
      const currentIndex = cursor.ticketIndexByStatus[status] ?? 0;
      const nextCursor: BoardCursor = {
        ...cursor,
        ticketIndexByStatus: {
          ...cursor.ticketIndexByStatus,
          [status]: count > 0 ? clamp(currentIndex + action.offset, 0, count - 1) : 0
        }
      };
      return withCursor(state, state.selectedEpicId, nextCursor);
    }
    case "move-person-ticket":
      return {
        ...state,
        selectedPersonTicketIndex: action.ticketCount > 0
          ? clamp(state.selectedPersonTicketIndex + action.offset, 0, action.ticketCount - 1)
          : 0
      };
    case "move-plan-ticket": {
      const bucketId = state.selectedPlanBucket;
      const currentIndex = state.planTicketIndexByBucket[bucketId] ?? 0;
      return {
        ...state,
        planTicketIndexByBucket: {
          ...state.planTicketIndexByBucket,
          [bucketId]: action.ticketCount > 0
            ? clamp(currentIndex + action.offset, 0, action.ticketCount - 1)
            : 0
        }
      };
    }
    case "select-ticket": {
      const cursor = getCursor(state, state.selectedEpicId);
      const nextCursor: BoardCursor = {
        ...cursor,
        statusIndex: action.statusIndex,
        ticketIndexByStatus: {
          ...cursor.ticketIndexByStatus,
          [action.status]: action.ticketIndex
        }
      };
      return withCursor(state, state.selectedEpicId, nextCursor);
    }
    case "select-person-ticket":
      return {
        ...state,
        selectedPersonTicketIndex: Math.max(0, action.ticketIndex)
      };
    case "select-plan-ticket":
      return {
        ...state,
        planTicketIndexByBucket: {
          ...state.planTicketIndexByBucket,
          [state.selectedPlanBucket]: Math.max(0, action.ticketIndex)
        }
      };
    case "open-dialog":
      return {
        ...state,
        dialog: action.dialog,
        overlay: null
      };
    case "close-dialog":
      return {
        ...state,
        dialog: null
      };
    case "open-overlay":
      return {
        ...state,
        overlay: action.overlay,
        dialog: null
      };
    case "close-overlay":
      return {
        ...state,
        overlay: null
      };
    case "set-search":
      return {
        ...state,
        searchQuery: action.searchQuery
      };
    case "repair":
      return repairState(state, action.payload);
    default:
      return state;
  }
}

export function getSelectedStatusIndex(state: UIState): number {
  return getCursor(state, state.selectedEpicId).statusIndex;
}

export function getSelectedTicketIndex(state: UIState, status: string): number {
  return getCursor(state, state.selectedEpicId).ticketIndexByStatus[status] ?? 0;
}

export function getSelectedPlanTicketIndex(state: UIState, bucketId: string): number {
  return state.planTicketIndexByBucket[bucketId] ?? 0;
}
