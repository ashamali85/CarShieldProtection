"use client";

import { createContext, startTransition, use, useActionState, useEffect, useRef, useState, type ReactNode } from "react";
import { useFormStatus } from "react-dom";

export type ActionState = { error?: string } | undefined;
export type FormAction = (state: ActionState, formData: FormData) => Promise<ActionState>;

const PendingContext = createContext(false);

export function SubmitButton({
  children,
  pendingLabel,
  className = "btn-primary",
}: {
  children: ReactNode;
  pendingLabel?: string;
  className?: string;
}) {
  const { pending: formPending } = useFormStatus();
  const pending = formPending || use(PendingContext);
  return (
    <button type="submit" className={className} disabled={pending} aria-busy={pending}>
      {pending && pendingLabel ? pendingLabel : children}
    </button>
  );
}

/**
 * A form bound to a Server Action that returns `{ error }` on failure.
 * Unlike a plain `<form action>`, typed values are kept when the action fails,
 * and the form is cleared only after a successful submit.
 */
export function ActionForm({
  action,
  children,
  className,
  hidden,
  onSuccess,
  resetOnSuccess = true,
  successMessage,
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  hidden?: Record<string, string>;
  /** Called after the action finishes without an error. */
  onSuccess?: () => void;
  resetOnSuccess?: boolean;
  /** Shown briefly after a successful submit. */
  successMessage?: string;
}) {
  const [saved, setSaved] = useState(false);
  const [state, formAction, pending] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (!pending && submitted.current) {
      submitted.current = false;
      if (!state?.error) {
        if (resetOnSuccess) formRef.current?.reset();
        onSuccess?.();
        if (successMessage) {
          // Shown from a timer callback (not during the effect) and hidden again after 3 s.
          window.setTimeout(() => setSaved(true), 0);
          window.setTimeout(() => setSaved(false), 3000);
        }
      }
    }
  }, [pending, state, onSuccess, resetOnSuccess, successMessage]);

  return (
    <PendingContext value={pending}>
      <form
        ref={formRef}
        className={className}
        action={formAction}
        onSubmit={(e) => {
          e.preventDefault();
          submitted.current = true;
          const data = new FormData(e.currentTarget);
          startTransition(() => formAction(data));
        }}
      >
        {hidden &&
          Object.entries(hidden).map(([name, value]) => (
            <input key={name} type="hidden" name={name} value={value} />
          ))}
        {state?.error && (
          <p role="alert" className="col-span-full mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {state.error}
          </p>
        )}
        {children}
        {successMessage && (
          <p role="status" className={`mt-3 text-sm text-emerald-700 ${saved ? "" : "sr-only"}`}>
            {saved ? successMessage : ""}
          </p>
        )}
      </form>
    </PendingContext>
  );
}

export function Field({
  label,
  name,
  hint,
  optionalLabel,
  ...input
}: {
  label: string;
  name: string;
  hint?: string;
  optionalLabel?: string;
} & React.InputHTMLAttributes<HTMLInputElement>) {
  const id = `f-${name}`;
  return (
    <div>
      <label htmlFor={id} className="label">
        {label}
        {optionalLabel && !input.required && (
          <span className="ms-1 font-normal text-muted">({optionalLabel})</span>
        )}
      </label>
      <input id={id} name={name} className="input" {...input} />
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}
