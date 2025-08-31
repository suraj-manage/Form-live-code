import React, { useEffect, useRef, useState } from "react";
import "./App.css";

export default function App() {
  const initialCode = `<form>
  <div class="question">
    <p>What is your favorite color?</p>
    <label><input type="radio" name="q0" value="Red" /> Red</label>
    <label><input type="radio" name="q0" value="Blue" /> Blue</label>
    <label><input type="radio" name="q0" value="Green" /> Green</label>
  </div>
</form>`;

  const [code, setCode] = useState(initialCode);
  const [questions, setQuestions] = useState([]);
  const parseTimer = useRef(null);

  const parseCodeToQuestions = (html) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const form = doc.querySelector("form");
      if (!form) return [];

      const qNodes = form.querySelectorAll(".question");
      const parsed = Array.from(qNodes).map((qNode) => {
        const p = qNode.querySelector("p");
        const text = p ? p.textContent.trim() : "Untitled Question";

        const labels = qNode.querySelectorAll("label");
        const options = Array.from(labels).map((label) => {
          const input = label.querySelector("input");
          // Set text same as value
          return input?.getAttribute("value") ?? label.textContent.trim();
        });

        const firstInput = qNode.querySelector("input");
        const type = firstInput?.getAttribute("type") === "checkbox" ? "checkbox" : "radio";

        return { type, text, options };
      });

      return parsed;
    } catch (err) {
      console.error("parse error", err);
      return [];
    }
  };

  const formFromDocToCode = (doc) => {
    const form = doc.querySelector("form");
    if (!form) return "<form></form>";
    const serializer = new XMLSerializer();
    return serializer.serializeToString(form);
  };

  useEffect(() => {
    clearTimeout(parseTimer.current);
    parseTimer.current = setTimeout(() => {
      const parsed = parseCodeToQuestions(code);
      setQuestions(parsed);
    }, 200);
    return () => clearTimeout(parseTimer.current);
  }, [code]);

  const mutateQuestionInCode = (qIndex, mutateFn) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(code, "text/html");
    const form = doc.querySelector("form");
    if (!form) return;
    const qNodes = form.querySelectorAll(".question");
    const qNode = qNodes[qIndex];
    if (!qNode) return;
    mutateFn(qNode, doc, qIndex);
    const newCode = formFromDocToCode(doc);
    setCode(newCode);
    setQuestions(parseCodeToQuestions(newCode));
  };

  const handlePreviewQuestionTextChange = (qIndex, newText) => {
    mutateQuestionInCode(qIndex, (qNode, doc) => {
      let p = qNode.querySelector("p");
      if (!p) {
        p = doc.createElement("p");
        qNode.insertBefore(p, qNode.firstChild);
      }
      p.textContent = newText;

      // Also update first input value to match question text if desired
      const firstInput = qNode.querySelector("input");
      if (firstInput) firstInput.setAttribute("value", newText);
    });
  };

  const handlePreviewOptionTextChange = (qIndex, optionIndex, newText) => {
    mutateQuestionInCode(qIndex, (qNode, doc) => {
      const labels = qNode.querySelectorAll("label");
      if (!labels[optionIndex]) return;
      const label = labels[optionIndex];
      const input = label.querySelector("input");
      if (input) input.setAttribute("value", newText);

      // Remove old label text and append newText
      while (label.childNodes.length > 1) label.removeChild(label.lastChild);
      label.appendChild(doc.createTextNode(newText));
    });
  };

  const handleAddOption = (qIndex) => {
    mutateQuestionInCode(qIndex, (qNode, doc) => {
      const existingInputs = qNode.querySelectorAll("input");
      const optionCount = existingInputs.length;
      const firstInput = qNode.querySelector("input");
      const type = firstInput?.getAttribute("type") || "radio";
      const nameAttr = type === "checkbox" ? `q${qIndex}[]` : `q${qIndex}`;
      const label = doc.createElement("label");
      const input = doc.createElement("input");
      input.setAttribute("type", type);
      input.setAttribute("name", nameAttr);
      input.setAttribute("value", `Option ${optionCount + 1}`);
      label.appendChild(input);
      label.appendChild(doc.createTextNode(`Option ${optionCount + 1}`));
      qNode.appendChild(doc.createTextNode("\n    "));
      qNode.appendChild(label);
    });
  };

  const handleAddQuestion = () => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(code, "text/html");
    const form = doc.querySelector("form");
    if (!form) return;
    const newIndex = form.querySelectorAll(".question").length;
    const qDiv = doc.createElement("div");
    qDiv.setAttribute("class", "question");
    qDiv.appendChild(doc.createTextNode("\n    "));
    const p = doc.createElement("p");
    p.textContent = "New Question";
    qDiv.appendChild(p);
    qDiv.appendChild(doc.createTextNode("\n    "));
    const label = doc.createElement("label");
    const input = doc.createElement("input");
    input.setAttribute("type", "radio");
    input.setAttribute("name", `q${newIndex}`);
    input.setAttribute("value", "Option 1");
    label.appendChild(input);
    label.appendChild(doc.createTextNode("Option 1"));
    qDiv.appendChild(label);
    form.appendChild(doc.createTextNode("\n  "));
    form.appendChild(qDiv);
    form.appendChild(doc.createTextNode("\n"));
    const newCode = formFromDocToCode(doc);
    setCode(newCode);
    setQuestions(parseCodeToQuestions(newCode));
  };

  const handleToggleType = (qIndex, newType) => {
    mutateQuestionInCode(qIndex, (qNode) => {
      const inputs = qNode.querySelectorAll("input");
      inputs.forEach((inp) => {
        inp.setAttribute("type", newType);
        if (newType === "checkbox") inp.setAttribute("name", `q${qIndex}[]`);
        else inp.setAttribute("name", `q${qIndex}`);
      });
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const payload = {};
    questions.forEach((q, qi) => {
      const key = `q${qi}`;
      if (q.type === "radio") payload[q.text] = fd.get(key) || null;
      else payload[q.text] = fd.getAll(key + "[]");
    });
    console.log("Submitting:", payload);
    try {
      const res = await fetch("http://localhost:5000/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      console.log("Backend:", data);
      alert("Submitted successfully");
    } catch (err) {
      console.error(err);
      alert("Submit failed");
    }
  };

  useEffect(() => {
    setQuestions(parseCodeToQuestions(code));
  }, []);

  return (
    <div className="container">
      <div className="left">
        <h3>Form Code (editable)</h3>
        <textarea
          className="editor"
          value={code}
          onChange={(e) => setCode(e.target.value)}
        />
      </div>

      <div className="right">
        <h3>Preview</h3>
        <form onSubmit={handleSubmit}>
          {questions.length === 0 && <div>No questions found in code.</div>}

          {questions.map((q, qi) => (
            <div className="question-block" key={qi}>
              <div className="q-row">
                <input
                  className="question-input"
                  value={q.text}
                  onChange={(e) =>
                    handlePreviewQuestionTextChange(qi, e.target.value)
                  }
                />
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
                  <label className="option" key={oi}>
                    <input
                      type={q.type}
                      name={q.type === "checkbox" ? `q${qi}[]` : `q${qi}`}
                      value={opt}
                    />
                    <input
                      className="option-input"
                      value={opt}
                      onChange={(e) =>
                        handlePreviewOptionTextChange(qi, oi, e.target.value)
                      }
                    />
                  </label>
                ))}
              </div>

              <div className="q-actions">
                <button type="button" onClick={() => handleAddOption(qi)}>
                  + Add Option
                </button>
              </div>
            </div>
          ))}

          <div className="form-actions">
            <button type="button" onClick={handleAddQuestion}>
              + Add Question
            </button>
            <button type="submit">Submit</button>
          </div>
        </form>

        <h4>Raw Form HTML (current)</h4>
        <pre className="raw">{code}</pre>
      </div>
    </div>
  );
}
