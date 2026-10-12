"use client";

import {
  cloneElement,
  createContext,
  isValidElement,
  useActionState,
  useContext,
  useEffect,
  useRef,
  useState,
  type ReactElement,
  type ReactNode,
} from "react";
import { useRouter } from "next/navigation";
import toast from "react-hot-toast";

// Setup wizard as a modal popup, built on the native <dialog> (focus trap,
// backdrop and inert background come for free). One <form> wraps every step;
// all panels stay mounted (inactive get `hidden`) so values survive step
// switches and a single submit sends everything. No per-field state, no form
// library. Closes only via the X; backdrop and Esc are deliberately disabled so
// the user can't lose input by accident. See the task brief / docs/ui-audit.md.
export type WizardState = {
  error?: string;
  fieldErrors?: Record<string, string>;
  // Success: the action returns this instead of redirect() so the dialog can
  // close, toast, and navigate/refresh client-side.
  ok?: boolean;
  message?: string;
  redirectTo?: string;
};

export interface WizardStep {
  id: string;
  title: string;
  icon?: string;
  desc?: string;
  intro: ReactNode;
  content: ReactNode;
}

type Status = "ok" | "error" | "none";
type ReviewItem = { label: string; value: string };

const FieldErrorContext = createContext<Record<string, string>>({});

export function Field({
  name,
  label,
  hint,
  children,
}: {
  name: string;
  label: string;
  hint?: string;
  children: ReactNode;
}) {
  const errors = useContext(FieldErrorContext);
  const error = errors[name];
  const hintId = hint ? `${name}-hint` : undefined;
  const errorId = error ? `${name}-error` : undefined;
  const describedBy = [hintId, errorId].filter(Boolean).join(" ") || undefined;

  const control = isValidElement(children)
    ? cloneElement(children as ReactElement<Record<string, unknown>>, {
        id: name,
        "aria-describedby": describedBy,
        "aria-invalid": error ? true : undefined,
      })
    : children;

  return (
    <div className="input-wrapper spico-wizard-field">
      <label htmlFor={name}>{label}</label>
      {control}
      {hint && (
        <span id={hintId} className="spico-muted spico-wizard-hint">
          {hint}
        </span>
      )}
      {error && (
        <span id={errorId} className="spico-field-error" role="alert">
          {error}
        </span>
      )}
    </div>
  );
}

type NamedControl = HTMLInputElement | HTMLSelectElement | HTMLTextAreaElement;
const namedControls = (panel: HTMLElement) => Array.from(panel.querySelectorAll<NamedControl>("[name]"));

export function WizardDialog({
  trigger,
  title,
  action,
  hidden = {},
  submitLabel,
  steps,
  review = true,
  defaultOpen = false,
}: {
  trigger: string;
  title: string;
  action: (prev: WizardState, formData: FormData) => Promise<WizardState>;
  hidden?: Record<string, string>;
  submitLabel: string;
  steps: WizardStep[];
  review?: boolean;
  defaultOpen?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {} as WizardState);
  const dialogRef = useRef<HTMLDialogElement>(null);
  const formRef = useRef<HTMLFormElement>(null);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const stepRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const router = useRouter();
  const [active, setActive] = useState(0);
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [itemsByStep, setItemsByStep] = useState<ReviewItem[][]>([]);

  const reviewIndex = review ? steps.length : -1;
  const lastIndex = review ? steps.length : steps.length - 1;
  const onReview = review && active === reviewIndex;

  // Open on mount when deep-linked (e.g. ?create=1 or a /new route redirect).
  useEffect(() => {
    if (defaultOpen) dialogRef.current?.showModal();
  }, [defaultOpen]);

  // Success: close, toast, navigate/refresh. Not setState — safe in an effect.
  useEffect(() => {
    if (!state.ok) return;
    dialogRef.current?.close();
    if (state.message) toast.success(state.message);
    if (state.redirectTo) router.push(state.redirectTo);
    else router.refresh();
  }, [state, router]);

  function recompute() {
    const fe = state.fieldErrors ?? {};
    const form = formRef.current;
    const nextStatuses: Status[] = [];
    const nextItems: ReviewItem[][] = [];
    for (let i = 0; i < steps.length; i += 1) {
      const panel = panelRefs.current[i];
      if (!panel) {
        nextStatuses.push("none");
        nextItems.push([]);
        continue;
      }
      const controls = namedControls(panel);
      let status: Status = "none";
      if (controls.some((el) => fe[el.name])) {
        status = "error";
      } else {
        const required = controls.filter((el) => el.required);
        if (required.length > 0 && required.every((el) => el.value !== "" && el.checkValidity())) status = "ok";
      }
      nextStatuses.push(status);

      const rows: ReviewItem[] = [];
      const seen = new Set<string>();
      for (const el of controls) {
        if (seen.has(el.name)) continue;
        seen.add(el.name);
        let value = "";
        if (el.tagName === "SELECT") value = (el as HTMLSelectElement).selectedOptions[0]?.textContent?.trim() ?? "";
        else if (el instanceof HTMLInputElement && el.type === "checkbox") value = el.checked ? "Yes" : "";
        else value = el.value;
        if (!value) continue;
        const label = form?.querySelector(`label[for="${el.id}"]`)?.textContent?.trim() ?? el.name;
        rows.push({ label, value });
      }
      nextItems.push(rows);
    }
    setStatuses(nextStatuses);
    setItemsByStep(nextItems);
  }

  function goto(i: number) {
    setActive(i);
    recompute();
  }

  // Server field errors: open the step holding the first bad field + focus it.
  useEffect(() => {
    const first = state.fieldErrors ? Object.keys(state.fieldErrors)[0] : undefined;
    if (!first) return;
    for (let i = 0; i < steps.length; i += 1) {
      const el = panelRefs.current[i]?.querySelector<HTMLElement>(`[name="${first}"]`);
      if (el) {
        setActive(i);
        requestAnimationFrame(() => el.focus());
        break;
      }
    }
  }, [state, steps.length]);

  function firstInvalid(i: number): NamedControl | null {
    const panel = panelRefs.current[i];
    if (!panel) return null;
    const wasHidden = panel.hidden;
    if (wasHidden) panel.hidden = false;
    const bad = namedControls(panel).find((el) => !el.checkValidity()) ?? null;
    if (wasHidden) panel.hidden = true;
    return bad;
  }

  function goNext() {
    if (active < steps.length) {
      const bad = firstInvalid(active);
      if (bad) {
        bad.reportValidity();
        return;
      }
    }
    goto(Math.min(active + 1, lastIndex));
  }

  function handleSubmit(e: React.FormEvent<HTMLFormElement>) {
    for (let i = 0; i < steps.length; i += 1) {
      const bad = firstInvalid(i);
      if (bad) {
        e.preventDefault();
        setActive(i);
        requestAnimationFrame(() => bad.reportValidity());
        return;
      }
    }
  }

  function onStepKeys(e: React.KeyboardEvent) {
    if (e.key !== "ArrowDown" && e.key !== "ArrowUp") return;
    e.preventDefault();
    const count = reviewIndex >= 0 ? steps.length + 1 : steps.length;
    const dir = e.key === "ArrowDown" ? 1 : -1;
    const next = (active + dir + count) % count;
    goto(next);
    requestAnimationFrame(() => stepRefs.current[next]?.focus());
  }

  const stepTitles = review ? [...steps.map((s) => s.title), "Review"] : steps.map((s) => s.title);

  return (
    <>
      <button type="button" className="rts-btn btn-primary" onClick={() => dialogRef.current?.showModal()}>
        {trigger}
      </button>

      <dialog
        ref={dialogRef}
        className="spico-wizard-dialog"
        closedby="none"
        onCancel={(e) => e.preventDefault()}
        aria-label={title}
      >
        <FieldErrorContext.Provider value={state.fieldErrors ?? {}}>
          <form ref={formRef} action={formAction} onSubmit={handleSubmit} onInput={recompute} className="spico-wizard">
            <div className="spico-wizard-dialog-head">
              <h2 className="spico-wizard-dialog-title">{title}</h2>
              <button type="button" className="spico-wizard-dialog-close" aria-label="Close" onClick={() => dialogRef.current?.close()}>
                <i className="fa-solid fa-xmark" aria-hidden="true" />
              </button>
            </div>

            <div className="spico-wizard-dialog-body">
              <div className="spico-wizard-steps" role="tablist" aria-orientation="vertical" aria-label="Setup steps" onKeyDown={onStepKeys}>
                {stepTitles.map((t, i) => {
                  const status = i < steps.length ? statuses[i] ?? "none" : "none";
                  const selected = active === i;
                  const mark = status === "ok" ? "✓" : status === "error" ? "!" : "";
                  const step = steps[i];
                  return (
                    <button
                      key={t + i}
                      type="button"
                      role="tab"
                      id={`wstep-${i}`}
                      ref={(el) => {
                        stepRefs.current[i] = el;
                      }}
                      aria-selected={selected}
                      aria-controls={`wpanel-${i}`}
                      tabIndex={selected ? 0 : -1}
                      className={`spico-wizard-step is-${status} ${selected ? "is-active" : ""}`}
                      onClick={() => goto(i)}
                    >
                      <span className="spico-wizard-step-badge">
                        {step?.icon ? <i className={step.icon} aria-hidden="true" /> : i + 1}
                      </span>
                      <span className="spico-wizard-step-text">
                        <span className="spico-wizard-step-title">{t}</span>
                        {step?.desc && <span className="spico-wizard-step-desc">{step.desc}</span>}
                      </span>
                      {mark && (
                        <span className={`spico-wizard-step-mark is-${status}`} aria-hidden="true">
                          {mark}
                        </span>
                      )}
                    </button>
                  );
                })}
              </div>

              <div className="spico-wizard-dialog-content">
                {Object.entries(hidden).map(([k, v]) => (
                  <input key={k} type="hidden" name={k} value={v} />
                ))}

                {steps.map((step, i) => (
                  <div
                    key={step.id}
                    id={`wpanel-${i}`}
                    role="tabpanel"
                    aria-labelledby={`wstep-${i}`}
                    hidden={active !== i}
                    ref={(el) => {
                      panelRefs.current[i] = el;
                    }}
                    className="spico-wizard-panel"
                  >
                    <p className="spico-wizard-intro">{step.intro}</p>
                    {step.content}
                  </div>
                ))}

                {onReview && (
                  <div id={`wpanel-${reviewIndex}`} role="tabpanel" aria-labelledby={`wstep-${reviewIndex}`} className="spico-wizard-panel">
                    <p className="spico-wizard-intro">Review everything below, then create. Use Edit to jump back to a step.</p>
                    {steps.map((step, i) => (
                      <div key={step.id} className="spico-wizard-review-group">
                        <div className="spico-wizard-review-head">
                          <strong>{step.title}</strong>
                          <button type="button" className="rts-btn btn-ghost btn-sm" onClick={() => goto(i)}>
                            Edit
                          </button>
                        </div>
                        {(itemsByStep[i] ?? []).length === 0 ? (
                          <p className="spico-muted">Nothing entered.</p>
                        ) : (
                          <dl className="spico-wizard-review-list">
                            {(itemsByStep[i] ?? []).map((it) => (
                              <div key={it.label} className="spico-wizard-review-row">
                                <dt className="spico-muted">{it.label}</dt>
                                <dd>{it.value}</dd>
                              </div>
                            ))}
                          </dl>
                        )}
                      </div>
                    ))}
                  </div>
                )}

                {state.error && (
                  <p className="spico-form-error" role="alert">
                    {state.error}
                  </p>
                )}
              </div>
            </div>

            <div className="spico-wizard-dialog-foot">
              {active > 0 && (
                <button type="button" className="rts-btn btn-secondary" onClick={() => goto(Math.max(active - 1, 0))}>
                  Back
                </button>
              )}
              <span className="spico-wizard-foot-spacer" />
              {active < lastIndex && (
                <button type="button" className="rts-btn btn-secondary" onClick={goNext}>
                  Next
                </button>
              )}
              {active === lastIndex && (
                <button type="submit" className="rts-btn btn-primary" disabled={pending}>
                  {pending ? "Creating…" : submitLabel}
                </button>
              )}
            </div>
          </form>
        </FieldErrorContext.Provider>
      </dialog>
    </>
  );
}
