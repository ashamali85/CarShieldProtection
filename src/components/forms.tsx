"use client";

import { createContext, startTransition, use, useActionState, useEffect, useRef, type ReactNode } from "react";
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
}: {
  action: FormAction;
  children: ReactNode;
  className?: string;
  hidden?: Record<string, string>;
}) {
  const [state, formAction, pending] = useActionState(action, undefined);
  const formRef = useRef<HTMLFormElement>(null);
  const submitted = useRef(false);

  useEffect(() => {
    if (!pending && submitted.current) {
      submitted.current = false;
      if (!state?.error) formRef.current?.reset();
    }
  }, [pending, state]);

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
          <p role="alert" className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {state.error}
          </p>
        )}
        {children}
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
