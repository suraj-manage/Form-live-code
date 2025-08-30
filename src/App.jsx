import React, { useState, useEffect } from "react";

export default function GoogleFormEditableOptions() {
  const [questions, setQuestions] = useState([
    { id: 1, text: "Untitled Question", type: "radio", options: ["Option 1", "Option 2"] },
  ]);

  const escapeHtml = (str) =>
    String(str)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");

  const generateCode = () => {
    return `
<div class="form">
  ${questions
    .map(
      (q, qi) => `
  <div class="question-block" data-id="${q.id}">
    <div class="question">${escapeHtml(q.text)}</div>
    ${q.options
      .map(
        (opt, oi) => `
    <div class="option">
      <input type="${q.type}" name="q${qi}" id="q${qi}opt${oi}">
      <label for="q${qi}opt${oi}">${escapeHtml(opt)}</label>
    </div>`
      )
      .join("")}
  </div>`
    )
    .join("\n")}
</div>`.trim();
  };

  const [code, setCode] = useState(generateCode());

  useEffect(() => {
    setCode(generateCode());
  }, [questions]);

  const addQuestion = () => {
    setQuestions([
      ...questions,
      { id: Date.now(), text: `Question ${questions.length + 1}`, type: "radio", options: ["Option 1"] },
    ]);
  };

  const addOption = (qid) => {
    setQuestions(
      questions.map((q) =>
        q.id === qid ? { ...q, options: [...q.options, `Option ${q.options.length + 1}`] } : q
      )
    );
  };

  const toggleType = (qid, type) => {
    setQuestions(questions.map((q) => (q.id === qid ? { ...q, type } : q)));
  };

  const changeQuestionText = (qid, text) => {
    setQuestions(questions.map((q) => (q.id === qid ? { ...q, text } : q)));
  };

  const changeOptionText = (qid, index, text) => {
    setQuestions(
      questions.map((q) =>
        q.id === qid
          ? {
              ...q,
              options: q.options.map((opt, i) => (i === index ? text : opt)),
            }
          : q
      )
    );
  };

  const pane = { width: "50%", padding: 10, boxSizing: "border-box", height: "100vh", overflow: "auto" };

  return (
    <div style={{ display: "flex", height: "100vh", fontFamily: "system-ui, sans-serif" }}>
      {/* Left: Code editor */}
      <div style={{ ...pane, background: "#f7f7f7", borderRight: "2px solid #ddd" }}>
        <h3 style={{ marginTop: 0 }}>Editable Code</h3>
        <textarea
          value={code}
          readOnly
          style={{ width: "100%", height: "90%", fontFamily: "monospace", fontSize: 14, resize: "none" }}
          spellCheck={false}
        />
      </div>

      {/* Right: Preview */}
      <div style={{ ...pane, background: "#fff" }}>
        <h3 style={{ marginTop: 0 }}>Form Preview</h3>

        {questions.map((q) => (
          <div key={q.id} style={{ border: "1px solid #ddd", padding: 10, marginBottom: 12, borderRadius: 6 }}>
            {/* Question title */}
            <input
              type="text"
              value={q.text}
              onChange={(e) => changeQuestionText(q.id, e.target.value)}
              style={{ fontWeight: "bold", fontSize: 16, marginBottom: 8, width: "100%" }}
            />

            {/* Options */}
            {q.options.map((opt, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 6, margin: "4px 0" }}>
                <input type={q.type} name={`q${q.id}`} />
                <input
                  type="text"
                  value={opt}
                  onChange={(e) => changeOptionText(q.id, i, e.target.value)}
                  style={{ flex: 1 }}
                />
              </div>
            ))}

            <button onClick={() => addOption(q.id)}>➕ Add Option</button>

            <div style={{ marginTop: 6 }}>
              <span>Type: </span>
              <button
                onClick={() => toggleType(q.id, "radio")}
                disabled={q.type === "radio"}
                style={{ opacity: q.type === "radio" ? 0.6 : 1, marginRight: 6 }}
              >
                Radio
              </button>
              <button
                onClick={() => toggleType(q.id, "checkbox")}
                disabled={q.type === "checkbox"}
                style={{ opacity: q.type === "checkbox" ? 0.6 : 1 }}
              >
                Checkbox
              </button>
            </div>
          </div>
        ))}

        <button onClick={addQuestion} style={{ marginTop: 10 }}>
          ➕ Add Question
        </button>

        <h4 style={{ marginTop: 20 }}>Live Render:</h4>
        <div
          dangerouslySetInnerHTML={{ __html: code }}
          style={{ border: "1px solid #ccc", padding: 12, borderRadius: 6 }}
        />

        <style>{`
          .form { display: block; }
          .question { font-weight: 600; margin-bottom: 6px; }
          .option { display: flex; align-items: center; gap: 8px; margin: 4px 0; }
        `}</style>
      </div>
    </div>
  );
}
