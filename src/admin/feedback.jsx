import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from "react";

import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from "./components/ui/alert-dialog.jsx";
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

   One shared AlertDialog for every destructive action in the panel —
   removing a collaboration, a slide, an outlet, a role — so nothing is ever
   deleted from a single click. `confirm()` resolves true/false, the same
   shape `window.confirm` has, but styled, accessible, and not blocking.
   Radix's AlertDialog restores focus to whatever triggered it on close, so
   this needs no manual focus bookkeeping.
   ------------------------------------------------------------------------ */

const ConfirmContext = createContext(null);

export function ConfirmProvider({ children }) {
  const [request, setRequest] = useState(null);

  const confirm = useCallback(({ title, message, confirmLabel = "Remove", tone = "danger" }) => {
    return new Promise((resolve) => {
      setRequest({ title, message, confirmLabel, tone, resolve });
    });
  }, []);

  const settle = (result) => {
    request?.resolve(result);
    setRequest(null);
  };

  const value = useMemo(() => ({ confirm }), [confirm]);

  return (
    <ConfirmContext.Provider value={value}>
      {children}
      <AlertDialog open={Boolean(request)} onOpenChange={(open) => !open && settle(false)}>
        <AlertDialogContent>
          {request && (
            <>
              <AlertDialogHeader>
                <span className="ad-confirm-icon" aria-hidden="true">
                  <IconAlert />
                </span>
                <AlertDialogTitle>{request.title}</AlertDialogTitle>
                <AlertDialogDescription>{request.message}</AlertDialogDescription>
              </AlertDialogHeader>
              <AlertDialogFooter>
                <AlertDialogCancel size="touch" onClick={() => settle(false)}>
                  Cancel
                </AlertDialogCancel>
                <AlertDialogAction
                  size="touch"
                  variant={request.tone === "danger" ? "destructive" : "default"}
                  onClick={() => settle(true)}
                  autoFocus
                >
                  {request.confirmLabel}
                </AlertDialogAction>
              </AlertDialogFooter>
            </>
          )}
        </AlertDialogContent>
      </AlertDialog>
    </ConfirmContext.Provider>
  );
}

export function useConfirm() {
  const context = useContext(ConfirmContext);
  if (!context) throw new Error("useConfirm must be used within a ConfirmProvider.");
  return context.confirm;
}
