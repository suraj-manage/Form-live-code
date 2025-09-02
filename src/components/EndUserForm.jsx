import React from 'react';

export default function EndUserForm({
  questions,
  visibleSet,
  responses,
  handleEndUserChange,
  handleSubmitEndUserForm,
  setEndUserMode,
}) {
  return (
    <>
      <h3>End-User Form</h3>
      <form onSubmit={handleSubmitEndUserForm}>
        {questions.length === 0 && <div>No questions to show.</div>}
        {questions.map((q, qi) => {
          if (!visibleSet.has(qi)) return null;
          return (
            <div className="question-block" key={qi}>
              <div className="q-row">
                <div className="left-col">
                  <div className="index-chip">#{qi + 1}</div>
                  <div style={{ fontWeight: 600 }}>{q.text}</div>
                </div>
              </div>
              <div style={{ marginTop: 8 }}>
                {q.options.map((opt, oi) => {
                  const inputName = q.type === "checkbox" ? `q${qi}[]` : `q${qi}`;
                  const isChecked = q.type === "checkbox" ?
                    (Array.isArray(responses[qi]) && responses[qi].includes(opt)) :
                    responses[qi] === opt;
                  return (
                    <label key={oi}>
                      <input
                        type={q.type}
                        name={inputName}
                        value={opt}
                        checked={isChecked}
                        onChange={(e) => handleEndUserChange(qi, opt, e.target.checked)}
                      />
                      <span>{opt}</span>
                    </label>
                  );
                })}
              </div>
            </div>
          );
        })}
        <div className="form-actions" style={{ marginTop: 16 }}>
          <button type="submit">Submit Answers</button>
          <button type="button" onClick={() => setEndUserMode(false)}>Back to Editor</button>
        </div>
      </form>
    </>
  );
}