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
          // prefer input value, fallback to label text
          const raw = input?.getAttribute("value");
          if (raw !== undefined && raw !== null) return raw;
          // build the label text by concatenating text nodes after the input
          let labelText = "";
          Array.from(label.childNodes).forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) {
              labelText += node.textContent;
            }
          });
          return labelText.trim();
        });

        const firstInput = qNode.querySelector("input[type=radio], input[type=checkbox]");
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

  // Normalize names after any mutation, so q indices stay consistent
  const normalizeNames = (doc) => {
    const form = doc.querySelector("form");
    if (!form) return;
    const qNodes = form.querySelectorAll(".question");
    qNodes.forEach((qNode, qi) => {
      const inputs = qNode.querySelectorAll("input[type=radio], input[type=checkbox]");
      inputs.forEach((inp) => {
        const type = inp.getAttribute("type");
        if (type === "checkbox") inp.setAttribute("name", `q${qi}[]`);
        else inp.setAttribute("name", `q${qi}`);
      });
    });
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
    // normalize names (re-index) after any mutation
    normalizeNames(doc);
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

      // NOTE: removed updating first input value — question and options are independent
    });
  };

  const handlePreviewOptionTextChange = (qIndex, optionIndex, newText) => {
    mutateQuestionInCode(qIndex, (qNode, doc) => {
      const labels = qNode.querySelectorAll("label");
      if (!labels[optionIndex]) return;
      const label = labels[optionIndex];
      const input = label.querySelector("input");
      if (input) input.setAttribute("value", newText);

      // Remove all text nodes and any nodes after the input, then append new text node
      if (input) {
        let node = input.nextSibling;
        while (node) {
          const next = node.nextSibling;
          label.removeChild(node);
          node = next;
        }
      } else {
        // fallback: remove trailing children that are text nodes
        Array.from(label.childNodes).forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) {
            label.removeChild(node);
          }
        });
      }

      label.appendChild(doc.createTextNode(newText));
    });
  };

  // remove a single option label by index
  const handleRemoveOption = (qIndex, optionIndex) => {
    mutateQuestionInCode(qIndex, (qNode, doc) => {
      const labels = qNode.querySelectorAll("label");
      if (!labels[optionIndex]) return;
      const label = labels[optionIndex];
      qNode.removeChild(label);

      // clean up extra whitespace text nodes if present
      Array.from(qNode.childNodes).forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() === "") {
          qNode.removeChild(node);
        }
      });
    });
  };

  const handleAddOption = (qIndex) => {
    mutateQuestionInCode(qIndex, (qNode, doc) => {
      // count only actual choice inputs (radio/checkbox)
      const existingInputs = qNode.querySelectorAll("input[type=radio], input[type=checkbox]");
      const optionCount = existingInputs.length;
      const firstInput = qNode.querySelector("input[type=radio], input[type=checkbox]");
      const type = firstInput?.getAttribute("type") || "radio";
      const nameAttr = type === "checkbox" ? `q${qIndex}[]` : `q${qIndex}`;
      const label = doc.createElement("label");
      const input = doc.createElement("input");
      input.setAttribute("type", type);
      input.setAttribute("name", nameAttr);
      input.setAttribute("value", `Option ${optionCount + 1}`);
      label.appendChild(input);
      label.appendChild(doc.createTextNode(` Option ${optionCount + 1}`));
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
    label.appendChild(doc.createTextNode(" Option 1"));
    qDiv.appendChild(label);
    form.appendChild(doc.createTextNode("\n  "));
    form.appendChild(qDiv);
    form.appendChild(doc.createTextNode("\n"));

    // normalize names for the whole doc after adding
    normalizeNames(doc);

    const newCode = formFromDocToCode(doc);
    setCode(newCode);
    setQuestions(parseCodeToQuestions(newCode));
  };

  const handleRemoveQuestion = (qIndex) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(code, "text/html");
    const form = doc.querySelector("form");
    if (!form) return;
    const qNodes = form.querySelectorAll(".question");
    const qNode = qNodes[qIndex];
    if (!qNode) return;
    form.removeChild(qNode);

    // cleanup stray whitespace text nodes
    Array.from(form.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() === "") {
        form.removeChild(node);
      }
    });

    // normalize names after removal
    normalizeNames(doc);

    const newCode = formFromDocToCode(doc);
    setCode(newCode);
    setQuestions(parseCodeToQuestions(newCode));
  };

  const handleToggleType = (qIndex, newType) => {
    mutateQuestionInCode(qIndex, (qNode) => {
      const inputs = qNode.querySelectorAll("input[type=radio], input[type=checkbox]");
      inputs.forEach((inp) => {
        inp.setAttribute("type", newType);
        // name normalization happens after mutation
      });
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);

    // Build payload in mongoose schema format
    const formPayload = questions.map((q, qi) => {
      const key = `q${qi}`;
      const ans =
        q.type === "radio"
          ? fd.get(key)
          : fd.getAll(key + "[]");

      return {
        question: q.text,
        answer: Array.isArray(ans) ? ans : [ans].filter(Boolean), // always array
        type: q.type,
        options: q.options
      };
    });

    const payload = { form: formPayload };

    console.log("Submitting:", payload);

    try {
      // NOTE: endpoint aligned to backend structure
      const res = await fetch("http://localhost:5000/api/forms/submit", {
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
                  <div className="option-row" key={oi} style={{ display: "flex", alignItems: "center", gap: "8px", marginBottom: "6px" }}>
                    <label className="option" style={{ display: "flex", alignItems: "center", gap: "8px" }}>
                      <input
                        type={q.type}
                        name={q.type === "checkbox" ? `q${qi}[]` : `q${qi}`}
                        value={opt}
                        readOnly
                      />
                      <input
                        className="option-input"
                        value={opt}
                        onChange={(e) =>
                          handlePreviewOptionTextChange(qi, oi, e.target.value)
                        }
                      />
                    </label>
                    <button
                      type="button"
                      onClick={() => handleRemoveOption(qi, oi)}
                      title="Remove this option"
                    >
                      Remove option
                    </button>
                  </div>
                ))}
              </div>

              <div className="q-actions" style={{ marginTop: "8px" }}>
                <button type="button" onClick={() => handleAddOption(qi)}>
                  + Add Option
                </button>
                {" "}
                <button type="button" onClick={() => handleRemoveQuestion(qi)} style={{ marginLeft: "8px" }}>
                  Remove Question
                </button>
              </div>
            </div>
          ))}

          <div className="form-actions" style={{ marginTop: "16px" }}>
            <button type="button" onClick={handleAddQuestion}>
              + Add Question
            </button>
            {" "}
            <button type="submit">Submit</button>
          </div>
        </form>

        <h4>Raw Form HTML (current)</h4>
        <pre className="raw" style={{ whiteSpace: "pre-wrap" }}>{code}</pre>
      </div>
    </div>
  );
}
