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

  const [viewLang, setViewLang] = useState("html"); // 'html' | 'python' | 'vbscript'
  const [leftText, setLeftText] = useState(initialCode);

  const programmaticLeftUpdate = useRef(false);

  const parseCodeToQuestions = (html) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const form = doc.querySelector("form");
      if (!form) return [];

      const qNodes = form.querySelectorAll(".question");
      return Array.from(qNodes).map((qNode) => {
        const p = qNode.querySelector("p");
        const text = p ? p.textContent.trim() : "Untitled Question";

        const labels = qNode.querySelectorAll("label");
        const options = Array.from(labels).map((label) => {
          const input = label.querySelector("input");
          return input?.value ?? label.textContent.trim();
        });

        const firstInput = qNode.querySelector("input[type=radio], input[type=checkbox]");
        const type = firstInput?.type === "checkbox" ? "checkbox" : "radio";

        return { type, text, options };
      });
    } catch (err) {
      console.error("parse error", err);
      return [];
    }
  };

  const formFromDocToCode = (doc) => {
    const form = doc.querySelector("form");
    if (!form) return "<form></form>";
    return new XMLSerializer().serializeToString(form);
  };

  const normalizeNames = (doc) => {
    const form = doc.querySelector("form");
    if (!form) return;
    const qNodes = form.querySelectorAll(".question");
    qNodes.forEach((qNode, qi) => {
      const inputs = qNode.querySelectorAll("input[type=radio], input[type=checkbox]");
      inputs.forEach((inp) => {
        const type = inp.type;
        if (type === "checkbox") inp.name = `q${qi}[]`;
        else inp.name = `q${qi}`;
      });
    });
  };

  useEffect(() => {
    clearTimeout(parseTimer.current);
    parseTimer.current = setTimeout(() => {
      setQuestions(parseCodeToQuestions(code));
    }, 200);
    return () => clearTimeout(parseTimer.current);
  }, [code]);

  const buildPayloadObject = (qs) => ({
    form: qs.map((q) => ({
      question: q.text,
      answer: [],
      type: q.type,
      options: q.options,
    })),
  });

  const escapeHtml = (str) => {
    if (typeof str !== "string") return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };

  const generateCodeForLanguage = (lang, qs) => {
    if (lang === "html") return code;

    const payloadObj = buildPayloadObject(qs);
    const payloadStr = JSON.stringify(payloadObj, null, 2);

    if (lang === "python") {
      return `# Python requests example\nimport requests\n\nurl = "http://localhost:5000/api/forms/submit"\npayload = ${payloadStr}\n\nresp = requests.post(url, json=payload)\nprint(resp.status_code)\nprint(resp.text)`;
    }

    if (lang === "vbscript") {
      const vbJson = payloadStr.replace(/"/g, '""');
      return `' VBScript example using MSXML2\nDim payload\npayload = "${vbJson}"\n\nDim http\nSet http = CreateObject("MSXML2.XMLHTTP")\nhttp.open "POST", "http://localhost:5000/api/forms/submit", False\nhttp.setRequestHeader "Content-Type", "application/json"\nhttp.send payload\n\nWScript.Echo http.responseText`;
    }

    return "";
  };

  useEffect(() => {
    const newLeft = generateCodeForLanguage(viewLang, questions);
    programmaticLeftUpdate.current = true;
    setLeftText(newLeft);
    setTimeout(() => (programmaticLeftUpdate.current = false), 10);
  }, [viewLang, questions, code]);

  const buildHtmlFromPayload = (payloadObj) => {
    if (!payloadObj || !Array.isArray(payloadObj.form)) return null;
    let html = "<form>\n";
    payloadObj.form.forEach((qb, qi) => {
      const qText = qb.question ?? "Untitled Question";
      const type = qb.type === "checkbox" ? "checkbox" : "radio";
      const options = Array.isArray(qb.options) ? qb.options : [];
      html += `  <div class="question">\n    <p>${escapeHtml(qText)}</p>\n`;
      options.forEach((opt) => {
        html += `    <label><input type="${type}" name="${
          type === "checkbox" ? `q${qi}[]` : `q${qi}`
        }" value="${escapeHtml(opt)}" /> ${escapeHtml(opt)}</label>\n`;
      });
      html += "  </div>\n";
    });
    html += "</form>";
    return html;
  };

  const tolerantJsonCleanup = (s) =>
    s.replace(/\/\/.*$/gm, "")
      .replace(/\/\*[\s\S]*?\*\//g, "")
      .replace(/'([^']*)'/g, (m, g1) => `"${g1.replace(/"/g, '\\"')}"`)
      .replace(/,\s*(?=[}\]])/g, "");

  const tryParsePayloadFromText = (text, lang) => {
    try {
      if (!text || typeof text !== "string") return null;
      const first = text.indexOf("{");
      const last = text.lastIndexOf("}");
      if (first === -1 || last === -1 || last <= first) return null;
      let jsonCandidate = text.slice(first, last + 1);
      if (lang === "vbscript") jsonCandidate = jsonCandidate.replace(/""/g, '"');
      jsonCandidate = tolerantJsonCleanup(jsonCandidate);
      const obj = JSON.parse(jsonCandidate);
      if (obj && typeof obj === "object" && Array.isArray(obj.form)) return obj;
      return null;
    } catch {
      return null;
    }
  };

  const leftEditTimer = useRef(null);
  useEffect(() => {
    if (programmaticLeftUpdate.current) return;
    if (viewLang === "html") return;
    clearTimeout(leftEditTimer.current);
    leftEditTimer.current = setTimeout(() => {
      const parsedPayload = tryParsePayloadFromText(leftText, viewLang);
      if (!parsedPayload) return;
      const newHtml = buildHtmlFromPayload(parsedPayload);
      if (!newHtml) return;
      setCode(newHtml);
      setQuestions(parseCodeToQuestions(newHtml));
      programmaticLeftUpdate.current = true;
      setLeftText(generateCodeForLanguage(viewLang, parseCodeToQuestions(newHtml)));
      setTimeout(() => (programmaticLeftUpdate.current = false), 10);
    }, 200);
    return () => clearTimeout(leftEditTimer.current);
  }, [leftText, viewLang]);

  const mutateQuestionInCode = (qIndex, mutateFn) => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(code, "text/html");
    const form = doc.querySelector("form");
    if (!form) return;
    const qNodes = form.querySelectorAll(".question");
    const qNode = qNodes[qIndex];
    if (!qNode) return;
    mutateFn(qNode, doc, qIndex);
    normalizeNames(doc);
    setCode(formFromDocToCode(doc));
    setQuestions(parseCodeToQuestions(formFromDocToCode(doc)));
  };

  const handlePreviewQuestionTextChange = (qIndex, newText) => {
    mutateQuestionInCode(qIndex, (qNode, doc) => {
      let p = qNode.querySelector("p");
      if (!p) {
        p = doc.createElement("p");
        qNode.insertBefore(p, qNode.firstChild);
      }
      p.textContent = newText;
    });
  };

  const handlePreviewOptionTextChange = (qIndex, optionIndex, newText) => {
    mutateQuestionInCode(qIndex, (qNode, doc) => {
      const labels = qNode.querySelectorAll("label");
      if (!labels[optionIndex]) return;
      const label = labels[optionIndex];
      const input = label.querySelector("input");
      if (input) input.value = newText;

      // clean old text nodes
      Array.from(label.childNodes)
        .filter((n) => n.nodeType === Node.TEXT_NODE)
        .forEach((n) => label.removeChild(n));
      label.appendChild(doc.createTextNode(newText));
    });
  };

  const handleAddOption = (qIndex) => {
    mutateQuestionInCode(qIndex, (qNode, doc) => {
      const inputs = qNode.querySelectorAll("input[type=radio], input[type=checkbox]");
      const type = inputs[0]?.type || "radio";
      const nameAttr = type === "checkbox" ? `q${qIndex}[]` : `q${qIndex}`;
      const optionCount = inputs.length;
      const label = doc.createElement("label");
      const input = doc.createElement("input");
      input.type = type;
      input.name = nameAttr;
      input.value = `Option ${optionCount + 1}`;
      label.appendChild(input);
      label.appendChild(doc.createTextNode(` Option ${optionCount + 1}`));
      qNode.appendChild(doc.createTextNode("\n    "));
      qNode.appendChild(label);
    });
  };
  const handleRemoveOption = (qIndex, optionIndex) => {
    mutateQuestionInCode(qIndex, (qNode, doc) => {
      const labels = Array.from(qNode.querySelectorAll("label"));
      if (!labels[optionIndex]) return;

      // remove the selected label
      qNode.removeChild(labels[optionIndex]);

      // optional: re-add newline/indentation for remaining labels
      Array.from(qNode.querySelectorAll("label")).forEach(lbl => {
        qNode.insertBefore(doc.createTextNode("\n    "), lbl);
      });
      qNode.appendChild(doc.createTextNode("\n  "));
    });
  };

  const handleAddQuestion = () => {
    const parser = new DOMParser();
    const doc = parser.parseFromString(code, "text/html");
    const form = doc.querySelector("form");
    if (!form) return;
    const newIndex = form.querySelectorAll(".question").length;
    const qDiv = doc.createElement("div");
    qDiv.className = "question";
    const p = doc.createElement("p");
    p.textContent = "New Question";
    qDiv.appendChild(p);
    const label = doc.createElement("label");
    const input = doc.createElement("input");
    input.type = "radio";
    input.name = `q${newIndex}`;
    input.value = "Option 1";
    label.appendChild(input);
    label.appendChild(doc.createTextNode(" Option 1"));
    qDiv.appendChild(label);
    form.appendChild(qDiv);
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
    normalizeNames(doc);
    const newCode = formFromDocToCode(doc);
    setCode(newCode);
    setQuestions(parseCodeToQuestions(newCode));
  };

  const handleToggleType = (qIndex, newType) => {
    mutateQuestionInCode(qIndex, (qNode) => {
      const inputs = qNode.querySelectorAll("input[type=radio], input[type=checkbox]");
      inputs.forEach((inp) => (inp.type = newType));
    });
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    const fd = new FormData(e.target);
    const formPayload = questions.map((q, qi) => {
      const key = `q${qi}`;
      const ans = q.type === "radio" ? fd.get(key) : fd.getAll(key + "[]");
      return { question: q.text, answer: Array.isArray(ans) ? ans : [ans].filter(Boolean), type: q.type, options: q.options };
    });
    const payload = { form: formPayload };
    console.log("Submitting:", payload);
    try {
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
        <div style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "center" }}>
          <label htmlFor="lang-select" style={{ fontSize: 13, color: "#475569" }}>Show as:</label>
          <select
            id="lang-select"
            value={viewLang}
            onChange={(e) => setViewLang(e.target.value)}
            style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #e2e8f0" }}
          >
            <option value="html">JS (raw)</option>
            <option value="python">Python</option>
            <option value="vbscript">VBScript</option>
          </select>
          <div style={{ marginLeft: "auto", fontSize: 13, color: "#94a3b8" }}>
            {viewLang === "html" ? "Editable" : "Editable (converts to HTML if JSON valid)"}
          </div>
        </div>
        <textarea className="editor" value={leftText} onChange={(e) => {
          setLeftText(e.target.value);
          if (viewLang === "html") setCode(e.target.value);
        }} spellCheck="false" />
      </div>

      <div className="right">
        <h3>Preview</h3>
        <form onSubmit={handleSubmit}>
          {questions.length === 0 && <div>No questions found in code.</div>}
          {questions.map((q, qi) => (
            <div className="question-block" key={qi}>
              <div className="q-row">
                <input className="question-input" value={q.text} onChange={(e) => handlePreviewQuestionTextChange(qi, e.target.value)} />
                <div className="type-switch">
                  <label><input type="radio" name={`type-${qi}`} checked={q.type === "radio"} onChange={() => handleToggleType(qi, "radio")} /> radio</label>
                  <label><input type="radio" name={`type-${qi}`} checked={q.type === "checkbox"} onChange={() => handleToggleType(qi, "checkbox")} /> checkbox</label>
                </div>
              </div>
              <div className="options">
                {q.options.map((opt, oi) => (
                  <div className="option-row" key={oi} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                    <label className="option" style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <input type={q.type} name={q.type === "checkbox" ? `q${qi}[]` : `q${qi}`} value={opt} readOnly />
                      <input className="option-input" value={opt} onChange={(e) => handlePreviewOptionTextChange(qi, oi, e.target.value)} />
                    </label>
                    <button type="button" onClick={() => handleRemoveOption(qi, oi)} title="Remove this option" className="remove-option-btn">Remove option</button>
                  </div>
                ))}
              </div>
              <div className="q-actions" style={{ marginTop: 8 }}>
                <button type="button" onClick={() => handleAddOption(qi)}>+ Add Option</button>
                <button type="button" onClick={() => handleRemoveQuestion(qi)} style={{ marginLeft: 8 }} className="remove-question-btn">Remove Question</button>
              </div>
            </div>
          ))}
          <div className="form-actions" style={{ marginTop: 16 }}>
            <button type="button" onClick={handleAddQuestion}>+ Add Question</button>
            <button type="submit">Submit</button>
          </div>
        </form>
        <h4>Raw Form HTML (current)</h4>
        <pre className="raw" style={{ whiteSpace: "pre-wrap" }}>{code}</pre>
      </div>
    </div>
  );
}
