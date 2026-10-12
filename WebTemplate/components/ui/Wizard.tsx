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

// Shared setup-wizard. One <form> wraps every step; all panels stay mounted
// (inactive ones get `hidden`) so values survive tab switches and a single
// submit sends everything to the existing server action. No per-field state,
// no form library. See the task brief / docs/ui-audit.md.
export type WizardState = { error?: string; fieldErrors?: Record<string, string> };

export interface WizardStep {
  id: string;
  title: string;
  intro: ReactNode;
  content: ReactNode;
}

type Status = "ok" | "error" | "none";
type ReviewItem = { label: string; value: string };

const FieldErrorContext = createContext<Record<string, string>>({});

// Label + control + hint + inline error. The caller passes the bare control as
// a single child (with its own `name`); Field wires up id, aria-describedby and
// aria-invalid so the server's fieldErrors[name] shows under the right field.
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

export function Wizard({
  action,
  hidden = {},
  submitLabel,
  steps,
  review = true,
}: {
  action: (prev: WizardState, formData: FormData) => Promise<WizardState>;
  hidden?: Record<string, string>;
  submitLabel: string;
  steps: WizardStep[];
  review?: boolean;
}) {
  const [state, formAction, pending] = useActionState(action, {} as WizardState);
  const formRef = useRef<HTMLFormElement>(null);
  const panelRefs = useRef<(HTMLDivElement | null)[]>([]);
  const tabRefs = useRef<(HTMLButtonElement | null)[]>([]);
  const [active, setActive] = useState(0);
  // Tab marks and the review summary are derived from the DOM, refreshed from
  // event handlers (input + navigation) — never from render or an effect, and
  // deliberately not per-field state.
  const [statuses, setStatuses] = useState<Status[]>([]);
  const [itemsByStep, setItemsByStep] = useState<ReviewItem[][]>([]);

  const reviewIndex = review ? steps.length : -1;
  const lastIndex = review ? steps.length : steps.length - 1;
  const singleNoTabs = steps.length === 1 && !review;
  const onReview = review && active === reviewIndex;

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

  // Server validation errors: open the step holding the first bad field, focus it.
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

  // Validate a step's fields. Inactive panels are `hidden` (barred from native
  // validation), so un-hide briefly to read validity.
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

  function onTabKeys(e: React.KeyboardEvent) {
    if (e.key !== "ArrowRight" && e.key !== "ArrowLeft") return;
    e.preventDefault();
    const count = reviewIndex >= 0 ? steps.length + 1 : steps.length;
    const dir = e.key === "ArrowRight" ? 1 : -1;
    const next = (active + dir + count) % count;
    goto(next);
    requestAnimationFrame(() => tabRefs.current[next]?.focus());
  }

  const tabTitles = review ? [...steps.map((s) => s.title), "Review"] : steps.map((s) => s.title);

  return (
    <FieldErrorContext.Provider value={state.fieldErrors ?? {}}>
      <form ref={formRef} action={formAction} onSubmit={handleSubmit} onInput={recompute} className="spico-wizard">
        {Object.entries(hidden).map(([k, v]) => (
          <input key={k} type="hidden" name={k} value={v} />
        ))}

        {!singleNoTabs && (
          <>
            <div className="spico-wizard-tabs" role="tablist" aria-label="Setup steps" onKeyDown={onTabKeys}>
              {tabTitles.map((title, i) => {
                const status = i < steps.length ? statuses[i] ?? "none" : "none";
                const selected = active === i;
                const mark = status === "ok" ? "✓" : status === "error" ? "!" : "";
                return (
                  <button
                    key={title + i}
                    type="button"
                    role="tab"
                    id={`wtab-${i}`}
                    ref={(el) => {
                      tabRefs.current[i] = el;
                    }}
                    aria-selected={selected}
                    aria-controls={`wpanel-${i}`}
                    tabIndex={selected ? 0 : -1}
                    className={`spico-wizard-tab ${selected ? "is-active" : ""} is-${status}`}
                    onClick={() => goto(i)}
                  >
                    <span className="spico-wizard-tab-num">{i + 1}</span>
                    <span className="spico-wizard-tab-title">{title}</span>
                    {mark && (
                      <span className={`spico-wizard-tab-mark is-${status}`} aria-hidden="true">
                        {mark}
                      </span>
                    )}
                  </button>
                );
              })}
            </div>
            <div className="spico-wizard-steps-mobile" aria-hidden="true">
              Step {active + 1} of {tabTitles.length} · {tabTitles[active]}
              <span className="spico-wizard-dots">
                {tabTitles.map((t, i) => (
                  <span key={t + i} className={`spico-wizard-dot ${i === active ? "on" : ""}`} />
                ))}
              </span>
            </div>
          </>
        )}

        {steps.map((step, i) => (
          <div
            key={step.id}
            id={`wpanel-${i}`}
            role={singleNoTabs ? undefined : "tabpanel"}
            aria-labelledby={singleNoTabs ? undefined : `wtab-${i}`}
            hidden={!singleNoTabs && active !== i}
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
          <div id={`wpanel-${reviewIndex}`} role="tabpanel" aria-labelledby={`wtab-${reviewIndex}`} className="spico-wizard-panel">
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

        <div className="spico-wizard-nav">
          {active > 0 && (
            <button type="button" className="rts-btn btn-secondary" onClick={() => goto(Math.max(active - 1, 0))}>
              Back
            </button>
          )}
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
  );
}
