import React from "react";
import QuestionLogicEditor from "./QuestionLogicEditor";
import QuestionQuotaEditor from "./QuestionQuotaEditor";

export default function QuestionBlock({
  question,
  qIndex,
  mode,
  responses,
  visibleSet,
  onQuestionTextChange,
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
  setOpenQuotaEditor
}) {
  // Editor Mode rendering
  if (mode === "editor") {
    return (
      <div className="question-block">
        <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
          <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
            <div className="index-chip">#{qIndex + 1}</div>
            <input
              className="question-input"
              value={question.text}
              onChange={e => onQuestionTextChange(qIndex, e.target.value)}
            />
            <button
              type="button"
              onClick={() => onToggleQuotaEditor(qIndex)}
              title="Edit quota for this question"
              style={{ marginLeft: 6, background: "transparent", color: "#7c3aed", border: "1px solid rgba(124,58,237,0.08)", padding: "6px 8px", borderRadius: 6 }}
            >
              Quota
            </button>
          </div>
          <div className="type-switch" style={{ marginLeft: "auto", display: "flex", gap: 8 }}>
            <label>
              <input type="radio" name={`type-${qIndex}`} checked={question.type === "radio"} onChange={() => onToggleType(qIndex, "radio")} /> radio
            </label>
            <label>
              <input type="radio" name={`type-${qIndex}`} checked={question.type === "checkbox"} onChange={() => onToggleType(qIndex, "checkbox")} /> checkbox
            </label>
          </div>
        </div>

        <div className="options" style={{ marginTop: 10 }}>
          {question.options.map((opt, oi) => (
            <div className="option-row" key={oi} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
              <label className="option" style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                <input type={question.type} name={question.type === "checkbox" ? `q${qIndex}[]` : `q${qIndex}`} value={opt} readOnly style={{ marginRight: 8 }} />
                <input
                  className="option-input"
                  value={opt}
                  onChange={e => onOptionTextChange(qIndex, oi, e.target.value)}
                />
              </label>
              <button type="button" onClick={() => onToggleLogicEditor(qIndex, opt)} title="Edit logic for this option" className="remove-option-btn" style={{ background: "transparent", color: "#0ea5e9", border: "1px solid rgba(14,165,233,0.12)" }}>
                Logic
              </button>
              <button type="button" onClick={() => onRemoveOption(qIndex, oi)} title="Remove this option" className="remove-option-btn">
                Remove option
              </button>
            </div>
          ))}
        </div>

        <div className="q-actions" style={{ marginTop: 8 }}>
          <button type="button" onClick={() => onAddOption(qIndex)}>+ Add Option</button>
          <button type="button" onClick={() => onRemoveQuestion(qIndex)} style={{ marginLeft: 8 }} className="remove-question-btn">Remove Question</button>
        </div>

        {/* Logic panel */}
        {openLogicEditor && openLogicEditor.qIndex === qIndex ? (
          <QuestionLogicEditor
            questions={[question]}
            qIndex={0}
            initialOption={openLogicEditor.optionValue}
            onSave={(qi, option, csv) => saveLogicForOption(qIndex, option, csv)}
            onRemove={(qi, option) => removeLogicForOption(qIndex, option)}
            onCancel={() => setOpenLogicEditor(null)}
          />
        ) : null}

        {/* Quota panel */}
        {openQuotaEditor === qIndex ? (
          <QuestionQuotaEditor
            questions={[question]}
            qIndex={0}
            initialQuota={question.quota}
            onSave={(qi, quotaObj) => saveQuotaForQuestion(qIndex, quotaObj)}
            onRemove={qi => removeQuotaForQuestion(qIndex)}
            onCancel={() => setOpenQuotaEditor(null)}
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
                    {rule.quotaCheck
                      ? ` (option-quota: ${rule.quotaCheck.condition} ${rule.quotaCheck.value}${rule.quotaCheck.meetRequirement ? " must-meet" : ""})`
                      : ""}
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
  if (mode === "endUser") {
    if (visibleSet && !visibleSet.has(qIndex)) return null;
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
                  onChange={e => onEndUserChange(qIndex, opt, e.target.checked)}
                />
                <span>{opt}</span>
              </label>
            );
          })}
        </div>
      </div>
    );
  }

  return null;
}