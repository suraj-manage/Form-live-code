import React from 'react';
import LogicInlineEditor from './LogicInlineEditor';

export default function QuestionEditor({
  questions,
  onEditorSubmit,
  startEndUserForm,
  handlePreviewQuestionTextChange,
  handleToggleType,
  handleAddOption,
  handleRemoveOption,
  handlePreviewOptionTextChange,
  toggleLogicEditor,
  saveLogicForOption,
  removeLogicForOption,
  handleAddQuestion,
  handleRemoveQuestion,
  openLogicEditor,
}) {
  return (
    <>
      <h3>Preview / Editor</h3>
      <form onSubmit={onEditorSubmit}>
        {questions.length === 0 && <div>No questions found in code.</div>}
        {questions.map((q, qi) => (
          <div className="question-block" key={qi}>
            <div className="q-row">
              <div className="left-col">
                <div className="index-chip">#{q.id + 1}</div>
                <input
                  className="question-input"
                  value={q.text}
                  onChange={(e) => handlePreviewQuestionTextChange(qi, e.target.value)}
                />
              </div>
              <div className="type-switch">
                <label>
                  <input
                    type="radio"
                    name={`type-${qi}`}
                    checked={q.type === "radio"}
                    onChange={() => handleToggleType(qi, "radio")}
                  />{" "}
                  radio
                </label>
                <label>
                  <input
                    type="radio"
                    name={`type-${qi}`}
                    checked={q.type === "checkbox"}
                    onChange={() => handleToggleType(qi, "checkbox")}
                  />{" "}
                  checkbox
                </label>
              </div>
            </div>
            <div className="options">
              {q.options.map((opt, oi) => (
                <div className="option-row" key={oi}>
                  <label className="option">
                    <input
                      type={q.type}
                      name={q.type === "checkbox" ? `q${qi}[]` : `q${qi}`}
                      value={opt}
                      readOnly
                    />
                    <input
                      className="option-input"
                      value={opt}
                      onChange={(e) => handlePreviewOptionTextChange(qi, oi, e.target.value)}
                    />
                  </label>
                  <button
                    type="button"
                    onClick={() => toggleLogicEditor(qi, opt)}
                    title="Edit logic for this option"
                    className="remove-option-btn"
                    style={{ background: "transparent", color: "#0ea5a3", borderColor: "rgba(14,165,163,0.12)" }}
                  >
                    Logic
                  </button>
                  <button
                    type="button"
                    onClick={() => handleRemoveOption(qi, oi)}
                    title="Remove this option"
                    className="remove-option-btn"
                  >
                    Remove option
                  </button>
                </div>
              ))}
            </div>
            {openLogicEditor && openLogicEditor.qIndex === qi && (
              <div className="logic-editor-container">
                {q.options.map((opt) => (
                  <div key={opt}>
                    {openLogicEditor.optionValue === opt && (
                      <LogicInlineEditor
                        questions={questions}
                        qIndex={qi}
                        optionValue={opt}
                        initialRules={(q.logic || []).find((r) => r.option === opt) || { showQuestions: [] }}
                        onSave={saveLogicForOption}
                        onCancel={() => toggleLogicEditor(null)}
                        onRemove={() => removeLogicForOption(qi, opt)}
                      />
                    )}
                  </div>
                ))}
              </div>
            )}
            <div className="q-actions">
              <button type="button" onClick={() => handleAddOption(qi)}>+ Add Option</button>
              <button type="button" onClick={() => handleRemoveQuestion(qi)} className="remove-question-btn">Remove Question</button>
            </div>
            <div className="logic-info">
              {q.logic.length > 0 ? (
                <div>
                  <strong>Logic:</strong>
                  <ul>
                    {q.logic.map((rule, ri) => (
                      <li key={ri}>
                        If option <em>"{rule.option}"</em> selected → show questions:{" "}
                        {rule.showQuestions.length > 0 ? rule.showQuestions.map(n => n + 1).join(", ") : "none"}
                      </li>
                    ))}
                  </ul>
                </div>
              ) : (
                <div className="small">No logic rules for this question.</div>
              )}
            </div>
          </div>
        ))}
        <div className="form-actions">
          <button type="button" onClick={handleAddQuestion}>+ Add Question</button>
          <button type="submit">Save Definition</button>
          <button type="button" onClick={startEndUserForm}>Preview End-User Form</button>
        </div>
      </form>
    </>
  );
}