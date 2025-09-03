import React, { useEffect, useState } from "react";
import QuestionLogicEditor from "./QuestionLogicEditor";
import QuestionQuotaEditor from "./QuestionQuotaEditor";

/*
  QuestionBlock.jsx
  - fixed: question text input now editable even if editingDrafts prop
    isn't forwarded by the parent. Uses local fallback state.
  - still calls onQuestionTextChange on each keystroke and onQuestionTextBlur on blur.
*/

export default function QuestionBlock({
  question,
  qIndex,
  mode,
  responses,
  visibleSet,
  onQuestionTextChange,
  onQuestionTextBlur,
  onOptionTextChange,
  onAddOption,
  onRemoveOption,
  onRemoveQuestion,
  onToggleType,
  onToggleLogicEditor,
  onToggleQuotaEditor,
  onEndUserChange,
  openLogicEditor,
  openQuotaEditor,
  saveLogicForOption,
  removeLogicForOption,
  saveQuotaForQuestion,
  removeQuotaForQuestion,
  setOpenLogicEditor,
  setOpenQuotaEditor,
  editingDrafts
}) {
  // treat everything that isn't explicit 'endUser' as editor mode
  const isEditor = mode !== "endUser";

  // LOCAL fallback for question text when editingDrafts isn't provided or doesn't contain this index
  const [localDraft, setLocalDraft] = useState(() => (question ? question.text : ""));

  // keep localDraft synced when the canonical question.text changes (e.g., replaced from code)
  useEffect(() => {
    setLocalDraft(question ? question.text : "");
  }, [question && question.text, qIndex]);

  // decide what to show in the input:
  // prefer editingDrafts[qIndex] when present (parent-driven), otherwise use localDraft (fallback).
  const inputValue =
    editingDrafts && Object.prototype.hasOwnProperty.call(editingDrafts, qIndex) && editingDrafts[qIndex] !== undefined
      ? editingDrafts[qIndex]
      : localDraft;

  // onChange: inform parent (if handler exists) and update local fallback
  const handleQuestionInputChange = (e) => {
    const v = e.target.value;
    if (typeof onQuestionTextChange === "function") {
      try { onQuestionTextChange(qIndex, v); } catch (err) { /* swallow handler errors */ }
    }
    // update local fallback so input remains responsive if parent doesn't forward editingDrafts
    setLocalDraft(v);
  };

  // onBlur: call parent's blur handler if present (to show modal / commit). If not present,
  // attempt to push final value via onQuestionTextChange so parent can still commit.
  const handleQuestionInputBlur = () => {
    if (typeof onQuestionTextBlur === "function") {
      try { onQuestionTextBlur(qIndex); } catch (err) { /* swallow */ }
    } else if (typeof onQuestionTextChange === "function") {
      // parent doesn't have blur handler — send final value so it can commit
      try { onQuestionTextChange(qIndex, inputValue); } catch (err) { /* swallow */ }
    }
  };

  // Editor Mode rendering
  if (isEditor) {
    return (
      <div className="question-block">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="index-chip">#{qIndex + 1}</div>

            <input
              className="question-input"
              value={inputValue}
              onChange={handleQuestionInputChange}
              onBlur={handleQuestionInputBlur}
            />

            <button
              type="button"
              onClick={() => onToggleQuotaEditor && onToggleQuotaEditor(qIndex)}
              title="Edit quota for this question"
              style={{ marginLeft: 6, background: "transparent", color: "#7c3aed", border: "1px solid rgba(124,58,237,0.08)", padding: "6px 8px", borderRadius: 6 }}
            >
              Quota
            </button>
          </div>

          <div className="type-switch" style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <label>
              <input type="radio" name={`type-${qIndex}`} checked={question.type === "radio"} onChange={() => onToggleType && onToggleType(qIndex, "radio")} /> radio
            </label>
            <label>
              <input type="radio" name={`type-${qIndex}`} checked={question.type === "checkbox"} onChange={() => onToggleType && onToggleType(qIndex, "checkbox")} /> checkbox
            </label>
          </div>
        </div>

        <div className="options" style={{ marginTop: 10 }}>
          {Array.isArray(question.options) && question.options.map((opt, oi) => (
            <div className="option-row" key={oi} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <label className="option" style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                <input type={question.type} name={question.type === "checkbox" ? `q${qIndex}[]` : `q${qIndex}`} value={opt} readOnly style={{ marginRight: 8 }} />
                <input
                  className="option-input"
                  value={opt}
                  onChange={e => onOptionTextChange && onOptionTextChange(qIndex, oi, e.target.value)}
                />
              </label>

              <button type="button" onClick={() => onToggleLogicEditor && onToggleLogicEditor(qIndex, opt)} title="Edit logic for this option" className="remove-option-btn" style={{ background: "transparent", color: "#0ea5e9", border: "1px solid rgba(14,165,233,0.12)" }}>
                Logic
              </button>

              <button type="button" onClick={() => onRemoveOption && onRemoveOption(qIndex, oi)} title="Remove this option" className="remove-option-btn">
                Remove option
              </button>
            </div>
          ))}
        </div>

        <div className="q-actions" style={{ marginTop: 8 }}>
          <button type="button" onClick={() => onAddOption && onAddOption(qIndex)}>+ Add Option</button>
          <button type="button" onClick={() => onRemoveQuestion && onRemoveQuestion(qIndex)} style={{ marginLeft: 8 }} className="remove-question-btn">Remove Question</button>
        </div>

        {/* Logic panel */}
        {openLogicEditor && openLogicEditor.qIndex === qIndex ? (
          <QuestionLogicEditor
            questions={[question]}
            qIndex={0}
            initialOption={openLogicEditor.optionValue}
            onSave={(qi, option, csv) => saveLogicForOption && saveLogicForOption(qIndex, option, csv)}
            onRemove={(qi, option) => removeLogicForOption && removeLogicForOption(qIndex, option)}
            onCancel={() => setOpenLogicEditor && setOpenLogicEditor(null)}
          />
        ) : null}

        {/* Quota panel */}
        {openQuotaEditor === qIndex ? (
          <QuestionQuotaEditor
            questions={[question]}
            qIndex={0}
            initialQuota={question.quota}
            onSave={(qi, quotaObj) => saveQuotaForQuestion && saveQuotaForQuestion(qIndex, quotaObj)}
            onRemove={qi => removeQuotaForQuestion && removeQuotaForQuestion(qIndex)}
            onCancel={() => setOpenQuotaEditor && setOpenQuotaEditor(null)}
          />
        ) : null}

        {/* Current logic and quota summary */}
        <div style={{ marginTop: 8, color: "#475569", fontSize: 13 }}>
          {Array.isArray(question.logic) && question.logic.length > 0 ? (
            <div>
              <strong>Logic:</strong>
              <ul style={{ margin: "6px 0 0 18px" }}>
                {question.logic.map((rule, ri) => (
                  <li key={ri}>
                    If option <em>"{rule.option}"</em> selected → show questions:{" "}
                    {Array.isArray(rule.showQuestions) && rule.showQuestions.length > 0
                      ? rule.showQuestions.map(n => Number(n) + 1).join(", ")
                      : "none"}
                    {rule.quotaCheck ? ` (option-quota: ${rule.quotaCheck.condition} ${rule.quotaCheck.value}${rule.quotaCheck.meetRequirement ? " must-meet" : ""})` : ""}
                  </li>
                ))}
              </ul>
            </div>
          ) : (
            <div style={{ opacity: 0.7 }}>No logic rules for this question.</div>
          )}
          {question.quota ? (
            <div style={{ marginTop: 6, fontSize: 13 }}>
              <strong>Quota:</strong> {question.quota.condition} {question.quota.value} {question.quota.meetRequirement ? "(must meet)" : ""}
            </div>
          ) : null}
        </div>
      </div>
    );
  }

  // End User Mode rendering
  if (!visibleSet || !visibleSet.has(qIndex)) return null;

  return (
    <div className="question-block">
      <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
        <div className="index-chip">#{qIndex + 1}</div>
        <div style={{ fontWeight: 600 }}>{question.text}</div>
      </div>
      <div style={{ marginTop: 8 }}>
        {question.options.map((opt, oi) => {
          const inputName = question.type === "checkbox" ? `q${qIndex}[]` : `q${qIndex}`;
          const checked = question.type === "checkbox"
            ? (Array.isArray(responses[qIndex]) && responses[qIndex].includes(opt))
            : responses[qIndex] === opt;
          return (
            <label key={oi} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
              <input
                type={question.type}
                name={inputName}
                value={opt}
                checked={checked}
                onChange={e => onEndUserChange && onEndUserChange(qIndex, opt, e.target.checked)}
              />
              <span>{opt}</span>
            </label>
          );
        })}
      </div>
    </div>
  );
}
