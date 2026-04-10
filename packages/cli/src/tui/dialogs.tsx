import { useMemo, useState } from "react";
import type { ReactNode } from "react";
import type { ProjectIndex, Ticket } from "@agenttasks/core";
import { useKeyboard, useTerminalDimensions } from "@opentui/react";

import {
  getCreateTicketFieldSpecs,
  getCreateTicketInitialValues,
  getCreateTicketReviewRows,
  getCreateTicketSubmission,
  type CreateDialogOption,
  type CreateFieldSpec,
  type CreateTicketSubmission
} from "./create-ticket.js";
import { COLORS, statusTone } from "./theme.js";
import { formatStatus, truncate } from "./strings.js";

export type DialogOption = CreateDialogOption;

interface DialogFrameProps {
  title: string;
  children: ReactNode;
  subtitle?: string;
  footer?: string;
  error?: string;
  left?: number | `${number}%`;
  width?: number | `${number}%`;
  stepLabel?: string;
  onDismiss?: () => void;
}

function isEnterKey(name?: string, sequence?: string): boolean {
  return name === "return" || name === "enter" || sequence === "\r";
}

function DialogError({ message }: { message: string }) {
  return (
    <box
      border={["left"]}
      borderColor={COLORS.warning}
      backgroundColor={COLORS.dialogHeader}
      paddingLeft={1}
    >
      <text fg={COLORS.warning}>{message}</text>
    </box>
  );
}

function DialogFieldSurface({ children }: { children: ReactNode }) {
  return (
    <box
      backgroundColor={COLORS.dialogField}
      border={["bottom"]}
      borderColor={COLORS.dialogDivider}
      paddingX={1}
      paddingY={0}
    >
      {children}
    </box>
  );
}

export function DialogFrame({
  title,
  children,
  subtitle,
  footer,
  error,
  left,
  width,
  stepLabel,
  onDismiss
}: DialogFrameProps) {
  const { width: termWidth } = useTerminalDimensions();
  const dialogWidth = width ?? 60;
  const numericWidth = typeof dialogWidth === "number" ? dialogWidth : 60;
  const computedLeft = left ?? Math.max(2, Math.floor((termWidth - numericWidth) / 2));

  return (
    <box position="absolute" top={0} left={0} width="100%" height="100%" zIndex={20}>
      <box
        width="100%"
        height="100%"
        backgroundColor={COLORS.overlayMuted}
        opacity={0.55}
        onMouseUp={onDismiss}
      />
      <box
        position="absolute"
        top={3}
        left={computedLeft}
        width={dialogWidth}
        minWidth={36}
        maxWidth="94%"
        maxHeight="84%"
        flexDirection="column"
        border
        borderColor={COLORS.dialogBorder}
        backgroundColor={COLORS.dialogSurface}
        zIndex={21}
      >
        <box
          flexDirection="column"
          backgroundColor={COLORS.dialogHeader}
          border={["bottom"]}
          borderColor={COLORS.dialogDivider}
          paddingX={1}
          paddingY={0}
        >
          <box flexDirection="row" justifyContent="space-between">
            <text fg={COLORS.text}><b>{title}</b></text>
            <box flexDirection="row">
              {stepLabel ? <text fg={COLORS.textDim}>{stepLabel}  </text> : null}
              <text fg={COLORS.textDim}>esc</text>
            </box>
          </box>
          {subtitle ? <text fg={COLORS.textMuted}>{subtitle}</text> : null}
        </box>
        <box flexGrow={1} flexDirection="column" paddingX={2} paddingY={1}>
          {children}
        </box>
        {error ? (
          <>
            <box
              border={["top"]}
              borderColor={COLORS.dialogDivider}
              backgroundColor={COLORS.dialogHeader}
              paddingX={1}
              paddingY={0}
            >
              <DialogError message={error} />
            </box>
          </>
        ) : null}
        {footer ? (
          <box
            border={["top"]}
            borderColor={COLORS.dialogDivider}
            backgroundColor={COLORS.dialogFooter}
            paddingX={1}
            paddingY={0}
          >
            <text fg={COLORS.textMuted}>{footer}</text>
          </box>
        ) : null}
      </box>
    </box>
  );
}

export function PromptDialog({
  title,
  subtitle,
  value,
  placeholder,
  footer,
  error,
  stepLabel,
  width,
  onSubmit,
  onCancel
}: {
  title: string;
  subtitle?: string;
  value: string;
  placeholder?: string;
  footer?: string;
  error?: string;
  stepLabel?: string;
  width?: number | `${number}%`;
  onSubmit: (value: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const [draft, setDraft] = useState(value);
  const [pending, setPending] = useState(false);

  useKeyboard((key) => {
    if (key.name === "escape") {
      key.preventDefault();
      key.stopPropagation();
      if (!pending) {
        onCancel();
      }
    }
  });

  return (
    <DialogFrame
      title={title}
      subtitle={subtitle}
      footer={footer ?? "enter continue  esc back"}
      error={error}
      stepLabel={stepLabel}
      width={width}
      onDismiss={onCancel}
    >
      <DialogFieldSurface>
        <input
          focused
          value={draft}
          placeholder={placeholder ?? ""}
          backgroundColor={COLORS.dialogField}
          onChange={setDraft}
          onSubmit={async (nextValue) => {
            if (pending) {
              return;
            }
            setPending(true);
            try {
              await onSubmit(typeof nextValue === "string" ? nextValue : draft);
            } finally {
              setPending(false);
            }
          }}
        />
      </DialogFieldSurface>
    </DialogFrame>
  );
}

export function SelectDialog({
  title,
  subtitle,
  options,
  selectedValue,
  footer,
  error,
  stepLabel,
  width,
  onSelect,
  onCancel
}: {
  title: string;
  subtitle?: string;
  options: DialogOption[];
  selectedValue?: string;
  footer?: string;
  error?: string;
  stepLabel?: string;
  width?: number | `${number}%`;
  onSelect: (value: string) => void | Promise<void>;
  onCancel: () => void;
}) {
  const selectedIndex = Math.max(0, options.findIndex((option) => option.value === selectedValue));
  const [pending, setPending] = useState(false);

  useKeyboard((key) => {
    if (key.name === "escape") {
      key.preventDefault();
      key.stopPropagation();
      if (!pending) {
        onCancel();
      }
    }
  });

  return (
    <DialogFrame
      title={title}
      subtitle={subtitle}
      footer={footer ?? "j/k move  enter choose  esc back"}
      error={error}
      stepLabel={stepLabel}
      width={width}
      onDismiss={onCancel}
    >
      <select
        focused
        options={options}
        selectedIndex={selectedIndex}
        showDescription
        backgroundColor={COLORS.dialogSurface}
        textColor={COLORS.textMuted}
        focusedBackgroundColor={COLORS.dialogSurface}
        focusedTextColor={COLORS.text}
        selectedBackgroundColor={COLORS.dialogSelected}
        selectedTextColor={COLORS.text}
        descriptionColor={COLORS.textDim}
        selectedDescriptionColor={COLORS.textMuted}
        itemSpacing={0}
        onSelect={async (_index, option) => {
          if (!option || pending) {
            return;
          }
          setPending(true);
          try {
            await onSelect(String(option.value ?? ""));
          } finally {
            setPending(false);
          }
        }}
      />
    </DialogFrame>
  );
}

export function ConfirmDialog({
  title,
  subtitle,
  rows,
  footer,
  error,
  stepLabel,
  width,
  onConfirm,
  onCancel
}: {
  title: string;
  subtitle?: string;
  rows: Array<{ key: string; label: string; value: string; required?: boolean }>;
  footer?: string;
  error?: string;
  stepLabel?: string;
  width?: number | `${number}%`;
  onConfirm: () => void | Promise<void>;
  onCancel: () => void;
}) {
  const [pending, setPending] = useState(false);

  useKeyboard((key) => {
    if (key.name === "escape") {
      key.preventDefault();
      key.stopPropagation();
      if (!pending) {
        onCancel();
      }
      return;
    }

    if (!isEnterKey(key.name, key.sequence) || pending) {
      return;
    }

    key.preventDefault();
    key.stopPropagation();
    setPending(true);
    void Promise.resolve(onConfirm()).finally(() => {
      setPending(false);
    });
  });

  return (
    <DialogFrame
      title={title}
      subtitle={subtitle}
      footer={footer ?? "enter create  esc back"}
      error={error}
      stepLabel={stepLabel}
      width={width}
      onDismiss={onCancel}
    >
      <scrollbox flexGrow={1} border={false} viewportCulling={false}>
        <box flexDirection="column">
          {rows.map((row) => (
            <box
              key={row.key}
              paddingY={0}
            >
              <box flexDirection="column">
                <text fg={COLORS.textMuted}>{row.label}{row.required ? " *" : ""}</text>
                <text fg={COLORS.text}>{truncate(row.value, 72)}</text>
              </box>
            </box>
          ))}
        </box>
      </scrollbox>
    </DialogFrame>
  );
}

export function StatusDialog({
  index,
  ticket,
  onSubmit,
  onCancel
}: {
  index: ProjectIndex;
  ticket: Ticket;
  onSubmit: (status: string) => Promise<void>;
  onCancel: () => void;
}) {
  const transitions = index.config.workflow.transitions[ticket.frontmatter.status] ?? [];
  const [selectedIdx, setSelectedIdx] = useState(0);
  const [pending, setPending] = useState(false);

  useKeyboard((key) => {
    if (pending) {
      return;
    }
    if (key.name === "escape") {
      key.preventDefault();
      key.stopPropagation();
      onCancel();
      return;
    }
    if (transitions.length === 0) {
      return;
    }
    if (key.name === "h" || key.name === "left" || key.name === "k" || key.name === "up") {
      key.preventDefault();
      key.stopPropagation();
      setSelectedIdx((current) => (current - 1 + transitions.length) % transitions.length);
      return;
    }
    if (key.name === "l" || key.name === "right" || key.name === "j" || key.name === "down") {
      key.preventDefault();
      key.stopPropagation();
      setSelectedIdx((current) => (current + 1) % transitions.length);
      return;
    }
    if (isEnterKey(key.name, key.sequence)) {
      key.preventDefault();
      key.stopPropagation();
      const target = transitions[selectedIdx];
      if (!target) {
        return;
      }
      setPending(true);
      void onSubmit(target).finally(() => {
        setPending(false);
      });
    }
  });

  if (transitions.length === 0) {
    return (
      <DialogFrame
        title={`Change Status · ${ticket.frontmatter.id}`}
        subtitle={`No transitions from ${formatStatus(ticket.frontmatter.status)}.`}
        footer="esc close"
        onDismiss={onCancel}
      >
        <text fg={COLORS.textDim}>No transitions available from the current status.</text>
      </DialogFrame>
    );
  }

  const currentTone = statusTone(ticket.frontmatter.status);
  const selected = transitions[selectedIdx];

  return (
    <DialogFrame
      title={`Change Status · ${ticket.frontmatter.id}`}
      footer="h/l switch  enter confirm  esc cancel"
      onDismiss={onCancel}
    >
      <box flexDirection="column" gap={1}>
        <box flexDirection="row" alignItems="center">
          <text fg={currentTone.fg}>{formatStatus(ticket.frontmatter.status)}</text>
          <text fg={COLORS.textDim}>  →  </text>
          <text fg={statusTone(selected ?? ticket.frontmatter.status).fg}><b>{selected ? formatStatus(selected) : "?"}</b></text>
        </box>
        <box flexDirection="row" alignItems="center">
          {transitions.map((status, idx) => {
            const isSelected = idx === selectedIdx;
            const tone = statusTone(status);
            const distance = Math.abs(idx - selectedIdx);
            const fg = isSelected ? tone.fg : distance === 1 ? COLORS.textDim : COLORS.borderMuted;
            return (
              <box key={status} flexDirection="row">
                {idx === 0 ? (
                  <text fg={selectedIdx > 0 ? COLORS.textDim : COLORS.borderMuted}>‹ </text>
                ) : null}
                {isSelected ? (
                  <text fg={fg}><b>{formatStatus(status)}</b></text>
                ) : (
                  <text fg={fg}>{formatStatus(status)}</text>
                )}
                {idx < transitions.length - 1 ? (
                  <text fg={COLORS.borderMuted}>  </text>
                ) : (
                  <text fg={selectedIdx < transitions.length - 1 ? COLORS.textDim : COLORS.borderMuted}> ›</text>
                )}
              </box>
            );
          })}
        </box>
      </box>
    </DialogFrame>
  );
}

export function AssignDialog({
  ticket,
  onSubmit,
  onCancel
}: {
  ticket: Ticket;
  onSubmit: (value: string) => Promise<void>;
  onCancel: () => void;
}) {
  return (
    <PromptDialog
      title={`Assign Ticket · ${ticket.frontmatter.id}`}
      subtitle="Set a human or agent identity. Leave empty to clear."
      value={ticket.frontmatter.assigned_to ?? ""}
      placeholder="codex/main"
      footer="enter save  esc cancel"
      onSubmit={onSubmit}
      onCancel={onCancel}
    />
  );
}

export function SearchDialog({
  initialValue,
  onSubmit,
  onCancel
}: {
  initialValue: string;
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  return (
    <PromptDialog
      title="Search Tickets"
      subtitle="Search title, id, assignee, kind, priority, labels, and custom fields."
      value={initialValue}
      placeholder="parser, codex/main, high"
      footer="enter apply  esc cancel"
      onSubmit={(value) => {
        onSubmit(value);
      }}
      onCancel={onCancel}
    />
  );
}

function HelpList({ lines, onClose }: { lines: string[]; onClose: () => void }) {
  useKeyboard((key) => {
    if (key.name === "escape") {
      key.preventDefault();
      key.stopPropagation();
      onClose();
    }
  });

  return (
    <box flexDirection="column">
      {lines.map((line) => (
        <text key={line} fg={COLORS.textMuted}>{line}</text>
      ))}
    </box>
  );
}

export function HelpDialog({ onClose }: { onClose: () => void }) {
  return (
    <DialogFrame title="Keyboard Help" footer="esc close" onDismiss={onClose}>
      <HelpList
        onClose={onClose}
        lines={[
          "1 / 2 switch views",
          "n create ticket",
          "tab cycle visible panes",
          "h/l move lanes where applicable",
          "j/k move within the focused pane",
          "[ ] previous / next status lane",
          "enter open focused detail",
          ": command palette",
          "/ search",
          "s change status  a assign  x clear",
          "J / K next or previous visible ticket in detail"
        ]}
      />
    </DialogFrame>
  );
}

export function CommandPalette({
  options,
  onSubmit,
  onCancel
}: {
  options: DialogOption[];
  onSubmit: (value: string) => void;
  onCancel: () => void;
}) {
  return (
    <SelectDialog
      title="Command Palette"
      subtitle="Run an action or jump directly to an entity."
      options={options}
      footer="j/k move  enter run  esc cancel"
      width={80}
      onSelect={onSubmit}
      onCancel={onCancel}
    />
  );
}

function getPromptSubtitle(field: CreateFieldSpec): string {
  if (field.help) {
    return field.help;
  }
  return field.required ? `${field.label} is required.` : `${field.label} is optional.`;
}

function normalizePromptValue(field: CreateFieldSpec, value: string): string {
  const trimmed = value.trim();
  if (field.required && !trimmed) {
    throw new Error(`${field.label} is required`);
  }
  if (field.type === "number" && trimmed && Number.isNaN(Number(trimmed))) {
    throw new Error(`${field.label} must be a number`);
  }
  return trimmed;
}

export function CreateTicketDialog({
  index,
  selectedEpicId,
  onSubmit,
  onClose
}: {
  index: ProjectIndex;
  selectedEpicId: string;
  onSubmit: (values: CreateTicketSubmission) => Promise<void>;
  onClose: () => void;
}) {
  const fields = useMemo(() => getCreateTicketFieldSpecs(index), [index]);
  const [values, setValues] = useState<Record<string, string>>(() => getCreateTicketInitialValues(index, selectedEpicId));
  const [stepIndex, setStepIndex] = useState(0);
  const [error, setError] = useState<string>();

  const totalSteps = fields.length + 1;
  const currentField = fields[stepIndex];
  const stepLabel = `${Math.min(stepIndex + 1, totalSteps)}/${totalSteps}`;

  const goBack = () => {
    setError(undefined);
    if (stepIndex === 0) {
      onClose();
      return;
    }
    setStepIndex((current) => Math.max(0, current - 1));
  };

  const goForward = () => {
    setError(undefined);
    setStepIndex((current) => Math.min(totalSteps - 1, current + 1));
  };

  const reviewRows = useMemo(() => getCreateTicketReviewRows(index, values), [index, values]);

  if (!currentField) {
    return (
      <ConfirmDialog
        title="Create Ticket"
        subtitle="Review the ticket before writing the file."
        rows={reviewRows}
        stepLabel={stepLabel}
        error={error}
        width={80}
        onConfirm={async () => {
          try {
            await onSubmit(getCreateTicketSubmission(index, values));
          } catch (nextError) {
            setError((nextError as Error).message);
          }
        }}
        onCancel={goBack}
      />
    );
  }

  if (currentField.options) {
    return (
      <SelectDialog
        title="Create Ticket"
        subtitle={getPromptSubtitle(currentField)}
        options={currentField.options}
        selectedValue={values[currentField.key] ?? ""}
        stepLabel={stepLabel}
        error={error}
        width={80}
        onSelect={(value) => {
          setValues((current) => ({
            ...current,
            [currentField.key]: value
          }));
          goForward();
        }}
        onCancel={goBack}
      />
    );
  }

  return (
    <PromptDialog
      key={currentField.key}
      title="Create Ticket"
      subtitle={getPromptSubtitle(currentField)}
      value={values[currentField.key] ?? ""}
      placeholder={currentField.placeholder}
      stepLabel={stepLabel}
      error={error}
      width={80}
      onSubmit={(value) => {
        try {
          const normalizedValue = normalizePromptValue(currentField, value);
          setValues((current) => ({
            ...current,
            [currentField.key]: normalizedValue
          }));
          goForward();
        } catch (nextError) {
          setError((nextError as Error).message);
        }
      }}
      onCancel={goBack}
    />
  );
}
