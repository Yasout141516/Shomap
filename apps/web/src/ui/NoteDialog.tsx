import { useState, type ReactNode } from "react";
import { useI18n } from "../i18n";
import { Modal } from "./Modal";

/**
 * A confirm dialog that asks for a short note (resolve, redirect, remove). It owns its own text,
 * so pages don't keep and reset note state. `children` can add extra fields above the note.
 */
export function NoteDialog({
  title,
  label,
  placeholder,
  required = true,
  canConfirm = true,
  onConfirm,
  onClose,
  children,
}: {
  title: string;
  label: string;
  placeholder?: string;
  required?: boolean;
  canConfirm?: boolean;
  onConfirm: (note: string) => void;
  onClose: () => void;
  children?: ReactNode;
}) {
  const { t } = useI18n();
  const [note, setNote] = useState("");
  const ok = canConfirm && (!required || note.trim().length >= 3);
  return (
    <Modal
      title={title}
      onClose={onClose}
      footer={
        <>
          <button className="btn btn-ghost" onClick={onClose}>
            {t("common.cancel")}
          </button>
          <button
            className="btn btn-primary"
            disabled={!ok}
            onClick={() => {
              onConfirm(note.trim());
              onClose();
            }}
          >
            {t("authority.confirm")}
          </button>
        </>
      }
    >
      {children}
      {label ? (
        <label className="field">
          <span className="field-label">{label}</span>
          <textarea id="note-dialog-text" rows={3} maxLength={300} value={note} placeholder={placeholder} onChange={(e) => setNote(e.target.value)} />
        </label>
      ) : null}
    </Modal>
  );
}
