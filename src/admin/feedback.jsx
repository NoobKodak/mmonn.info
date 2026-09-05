import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import { IconAlert, IconCheck, IconInfo, IconX } from "./icons.jsx";

/* ---------------------------------------------------------------------------
   Toasts

   Replaces a single status line that the next event silently overwrites.
   Success and info toasts clear themselves after a few seconds; error toasts
   stay until dismissed, since those are exactly the ones worth not missing.
   ------------------------------------------------------------------------ */

const ToastContext = createContext(null);

const TOAST_ICON = { success: IconCheck, error: IconAlert, info: IconInfo };
const AUTO_DISMISS_MS = { success: 4500, info: 4500, error: 0 };

export function ToastProvider({ children }) {
  const [toasts, setToasts] = useState([]);
  const nextId = useRef(0);
  const timers = useRef(new Map());

  const dismiss = useCallback((id) => {
    setToasts((current) => current.filter((toast) => toast.id !== id));
    const timer = timers.current.get(id);
    if (timer) {
      window.clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const push = useCallback(
    ({ tone = "info", message, action }) => {
      const id = (nextId.current += 1);
      setToasts((current) => [...current, { id, tone, message, action }]);

      const timeout = AUTO_DISMISS_MS[tone];
      if (timeout) {
        timers.current.set(
          id,
          window.setTimeout(() => dismiss(id), timeout),
        );
      }
      return id;
    },
    [dismiss],
  );

  useEffect(() => () => timers.current.forEach((timer) => window.clearTimeout(timer)), []);

  const value = useMemo(() => ({ push, dismiss }), [push, dismiss]);

  return (
    <ToastContext.Provider value={value}>
      {children}
      <div className="ad-toast-stack" role="region" aria-label="Notifications">
        {toasts.map((toast) => (
          <Toast key={toast.id} toast={toast} onDismiss={() => dismiss(toast.id)} />
        ))}
      </div>
    </ToastContext.Provider>
  );
}

function Toast({ toast, onDismiss }) {
  const Icon = TOAST_ICON[toast.tone] || IconInfo;
  return (
    <div
      className={`ad-toast ad-toast--${toast.tone}`}
      role={toast.tone === "error" ? "alert" : "status"}
    >
      <span className="ad-toast-icon">
        <Icon />
      </span>
      <div className="ad-toast-body">
        <p className="ad-toast-message">{toast.message}</p>
        {toast.action && (
          <button
            className="ad-toast-action"
            type="button"
            onClick={() => {
              toast.action.onClick();
              onDismiss();
            }}
          >
            {toast.action.label}
          </button>
        )}
      </div>
      <button className="ad-toast-dismiss" type="button" onClick={onDismiss} aria-label="Dismiss">
        <IconX />
      </button>
    </div>
  );
}

export function useToast() {
  const context = useContext(ToastContext);
  if (!context) throw new Error("useToast must be used within a ToastProvider.");
  return context;
}

/* ---------------------------------------------------------------------------
   Confirm dialog

   One shared native <dialog> for every destructive action in the panel —
   removing a collaboration, a slide, an outlet, a role — so nothing is ever
   deleted from a single click. `confirm()` resolves true/false, the same
   shape `window.confirm` has, but styled, accessible, and not blocking.
   ------------------------------------------------------------------------ */

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);
  const dialogRef = useRef(null);
  const triggerRef = useRef(null);

  const confirm = useCallback(({ title, message, confirmLabel = "Remove", tone = "danger" }) => {
    triggerRef.current = document.activeElement;
    return new Promise((resolve) => {
      setRequest({ title, message, confirmLabel, tone, resolve });
    });
  }, []);

  useEffect(() => {
    const dialog = dialogRef.current;
    if (!dialog) return;
    if (request && !dialog.open) dialog.showModal();
    if (!request && dialog.open) dialog.close();
  }, [request]);

  const settle = (result) => {
    request?.resolve(result);
    setRequest(null);
    // The trigger button is often removed along with its list row on
    // confirm, so only try to refocus it when it is still there.
    window.requestAnimationFrame(() => {
      if (triggerRef.current?.isConnected) triggerRef.current.focus({ preventScroll: true });
    });
  };

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <dialog
        className="ad-confirm"
        ref={dialogRef}
        onCancel={(event) => {
          event.preventDefault();
          settle(false);
        }}
        onClick={(event) => {
          if (event.target === dialogRef.current) settle(false);
        }}
      >
        {request && (
          <>
            <span className="ad-confirm-icon">
              <IconAlert />
            </span>
            <h3>{request.title}</h3>
            <p>{request.message}</p>
            <div className="ad-confirm-actions">
              <button className="ad-button ad-button--quiet" type="button" onClick={() => settle(false)}>
                Cancel
              </button>
              <button
                className={`ad-button ${request.tone === "danger" ? "ad-button--danger" : ""}`}
                type="button"
                onClick={() => settle(true)}
                autoFocus
              >
                {request.confirmLabel}
              </button>
            </div>
          </>
        )}
      </dialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm must be used within a ConfirmProvider.");
  return context.confirm;
}
