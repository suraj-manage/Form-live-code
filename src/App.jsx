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

  // SOURCE HTML (the canonical form markup)
  const [code, setCode] = useState(initialCode);

  // parsed question objects with fields: id, text, type, options[], logic: [{ option, showQuestions: [indices] }]
  const [questions, setQuestions] = useState([]);

  // general debounce timer ref
  const parseTimer = useRef(null);

  // left editor language and text. Languages: 'html' | 'python' | 'vbscript'
  const [viewLang, setViewLang] = useState("html");
  const [leftText, setLeftText] = useState(initialCode);
  const programmaticLeftUpdate = useRef(false);

  // editing caret preservation
  const leftTextareaRef = useRef(null);

  // end-user view toggle
  const [endUserMode, setEndUserMode] = useState(false);

  // for end-user form answers
  const [responses, setResponses] = useState({}); // { qIndex: selectedValue or [values] }
  const [visibleSet, setVisibleSet] = useState(new Set()); // which question indices are currently visible

  // small UI state: which option logic editor is open { qIndex, optionValue } or null
  const [openLogicEditor, setOpenLogicEditor] = useState(null);

  // pending text-change confirmation (when a question with logic was edited)
  // shape: { qIndex, oldText, newText } or null
  const [pendingTextChange, setPendingTextChange] = useState(null);

  // ---------- Utilities: parse code (HTML) into question objects ----------
  const parseCodeToQuestions = (html) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const form = doc.querySelector("form");
      if (!form) return [];

      const qNodes = form.querySelectorAll(".question");
      const parsed = Array.from(qNodes).map((qNode, qi) => {
        const p = qNode.querySelector("p");
        const text = p ? p.textContent.trim() : "Untitled Question";

        const labels = qNode.querySelectorAll("label");
        const options = Array.from(labels).map((label) => {
          const input = label.querySelector("input");
          // prefer input value, fallback to label text nodes
          const raw = input?.getAttribute("value");
          if (raw !== undefined && raw !== null) return raw;
          let labelText = "";
          Array.from(label.childNodes).forEach((node) => {
            if (node.nodeType === Node.TEXT_NODE) labelText += node.textContent;
          });
          return labelText.trim();
        });

        const firstInput = qNode.querySelector("input[type=radio], input[type=checkbox]");
        const type = firstInput?.getAttribute("type") === "checkbox" ? "checkbox" : "radio";

        // include id equal to index to show index in preview
        return { id: qi, type, text, options: options.slice(), logic: [] };
      });

      return parsed;
    } catch (err) {
      console.error("parse error", err);
      return [];
    }
  };

  // ---------- Serialize only the <form> element to string ----------
  const formFromDocToCode = (doc) => {
    const form = doc.querySelector("form");
    if (!form) return "<form></form>";
    const serializer = new XMLSerializer();
    return serializer.serializeToString(form);
  };

  // ---------- Normalize names q0, q1, q{n}[] for checkboxes ----------
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

  // ---------- Merge parsed questions with existing logic stored in state ----------
  // We match by question text and option string. This keeps logic attached when user edits markup slightly.
  const mergeParsedWithExisting = (parsed) => {
    const prev = questions || [];
    const merged = parsed.map((pQ, idx) => {
      // find prev by exact question text
      const found = prev.find((pr) => pr.text === pQ.text);
      const logic = [];
      if (found && Array.isArray(found.logic)) {
        found.logic.forEach((rule) => {
          // keep rule if current options include the option string
          if (pQ.options.includes(rule.option)) {
            const showQuestions = (Array.isArray(rule.showQuestions) ? rule.showQuestions : [])
              .map((n) => Number(n))
              .filter((n) => Number.isFinite(n) && n >= 0);
            logic.push({ option: rule.option, showQuestions });
          }
        });
      }
      return { id: idx, type: pQ.type, text: pQ.text, options: pQ.options.slice(), logic };
    });
    return merged;
  };

  // ---------- Debounced parse of code into questions (keeps logic merged) ----------
  useEffect(() => {
    clearTimeout(parseTimer.current);
    parseTimer.current = setTimeout(() => {
      const parsed = parseCodeToQuestions(code);
      const merged = mergeParsedWithExisting(parsed);
      setQuestions(merged);
    }, 200);
    return () => clearTimeout(parseTimer.current);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [code]);

  // ---------- Build payload object for language generation (includes logic) ----------
  const buildPayloadObject = (qs) => {
    return {
      form: qs.map((q) => ({
        question: q.text,
        answer: [],
        type: q.type,
        options: q.options,
        logic: Array.isArray(q.logic) ? q.logic.map((r) => ({ option: r.option, showQuestions: r.showQuestions })) : []
      }))
    };
  };

  const escapeHtml = (str) => {
    if (typeof str !== "string") return "";
    return str
      .replace(/&/g, "&amp;")
      .replace(/</g, "&lt;")
      .replace(/>/g, "&gt;")
      .replace(/"/g, "&quot;");
  };

  // ---------- Generate left pane code for languages ----------
  const generateCodeForLanguage = (lang, qs) => {
    const payloadObj = buildPayloadObject(qs);
    if (lang === "html") return code;
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

  // ---------- Keep left text in sync when viewLang/questions/code changes ----------
  useEffect(() => {
    const newLeft = generateCodeForLanguage(viewLang, questions);
    // preserve caret if textarea focused
    const ta = leftTextareaRef.current;
    const wasFocused = ta && document.activeElement === ta;
    let selStart = 0, selEnd = 0;
    if (wasFocused) {
      try { selStart = ta.selectionStart; selEnd = ta.selectionEnd; } catch { selStart = selEnd = 0; }
    }

    programmaticLeftUpdate.current = true;
    setLeftText(newLeft);

    // restore selection on next paint
    requestAnimationFrame(() => {
      programmaticLeftUpdate.current = false;
      if (ta && wasFocused) {
        try {
          ta.focus();
          const len = ta.value.length;
          ta.setSelectionRange(Math.min(selStart, len), Math.min(selEnd, len));
        } catch {}
      }
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [viewLang, questions, code]);

  // ---------- Convert JSON-like payload in leftText into HTML form code ----------
  const buildHtmlFromPayload = (payloadObj) => {
    if (!payloadObj || !Array.isArray(payloadObj.form)) return null;
    let html = "<form>\n";
    payloadObj.form.forEach((qb, qi) => {
      const qText = qb.question ?? "Untitled Question";
      const type = qb.type === "checkbox" ? "checkbox" : "radio";
      const options = Array.isArray(qb.options) ? qb.options : [];
      html += `  <div class="question">\n    <p>${escapeHtml(qText)}</p>\n`;
      options.forEach((opt) => {
        const v = escapeHtml(opt);
        html += `    <label><input type="${type}" name="${type === "checkbox" ? `q${qi}[]` : `q${qi}`}" value="${v}" /> ${v}</label>\n`;
      });
      html += "  </div>\n";
    });
    html += "</form>";
    return html;
  };

  // ---------- Tolerant JSON cleanup helper ----------
  const tolerantJsonCleanup = (s) => {
    let t = s;
    t = t.replace(/\/\/.*$/gm, "");
    t = t.replace(/\/\*[\s\S]*?\*\//g, "");
    t = t.replace(/'([^']*)'/g, (m, g1) => {
      return '"' + g1.replace(/"/g, '\\"') + '"';
    });
    t = t.replace(/,\s*(?=[}\]])/g, "");
    return t;
  };

  // ---------- Extract JSON object from text (python or vb), tolerant ----------
  const tryParsePayloadFromText = (text, lang) => {
    try {
      if (!text || typeof text !== "string") return null;
      // find the first {...} block
      let first = text.indexOf("{");
      let last = text.lastIndexOf("}");
      if (first === -1 || last === -1 || last <= first) return null;
      let jsonCandidate = text.slice(first, last + 1);
      if (lang === "vbscript") jsonCandidate = jsonCandidate.replace(/""/g, '"');
      jsonCandidate = tolerantJsonCleanup(jsonCandidate);
      const obj = JSON.parse(jsonCandidate);
      if (obj && typeof obj === "object" && Array.isArray(obj.form)) return obj;
      return null;
    } catch (err) {
      return null;
    }
  };

  // ---------- When user edits leftText (non-html), convert to HTML and update preview ----------
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
      // update main HTML and questions, merge logic where possible
      setCode(newHtml);
      const parsed = parseCodeToQuestions(newHtml);
      // mergeParsedWithExisting uses existing questions state to preserve logic
      const merged = mergeParsedWithExisting(parsed);
      // merge in logic if provided in payload
      // payload may include logic array per question; adopt it directly if present
      const withLogic = merged.map((mq, i) => {
        const payloadQ = parsedPayload.form[i];
        if (payloadQ && Array.isArray(payloadQ.logic)) {
          // ensure showQuestions are numbers
          const l = payloadQ.logic.map((r) => ({
            option: String(r.option),
            showQuestions: (Array.isArray(r.showQuestions) ? r.showQuestions.map((n) => Number(n)).filter(Number.isFinite) : [])
          }));
          return { ...mq, logic: l };
        }
        return mq;
      });
      setQuestions(withLogic);
      // normalize leftText (in selected language) to a consistent printed representation
      programmaticLeftUpdate.current = true;
      const normalized = generateCodeForLanguage(viewLang, withLogic);
      setLeftText(normalized);
      setTimeout(() => (programmaticLeftUpdate.current = false), 10);
    }, 200);
    return () => clearTimeout(leftEditTimer.current);
  }, [leftText, viewLang]);

  // ---------- Mutate a question in the DOM/code, then re-parse+merge ----------
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
    const newCode = formFromDocToCode(doc);
    const parsed = parseCodeToQuestions(newCode);
    const merged = mergeParsedWithExisting(parsed);
    setCode(newCode);
    setQuestions(merged);
  };

  // ---------- Question text change ----------
  const handlePreviewQuestionTextChange = (qIndex, newText) => {
    // store old text
    const oldText = questions[qIndex] ? questions[qIndex].text : "";

    // apply change immediately in DOM/state using mutateQuestionInCode
    mutateQuestionInCode(qIndex, (qNode, doc) => {
      let p = qNode.querySelector("p");
      if (!p) {
        p = doc.createElement("p");
        qNode.insertBefore(p, qNode.firstChild);
      }
      p.textContent = newText;
    });

    // if there was logic previously and text actually changed, prompt user about logic
    const hadLogic = questions[qIndex] && Array.isArray(questions[qIndex].logic) && questions[qIndex].logic.length > 0 && oldText !== newText;
    if (hadLogic) {
      // pendingTextChange stores old & new so modal can revert or clear logic as requested
      setPendingTextChange({ qIndex, oldText, newText });
    }
  };

  // modal actions for pending text change
  const keepLogicAndClose = () => {
    // keep logic as-is; nothing else to do (text already applied)
    setPendingTextChange(null);
  };

  const clearLogicForQuestion = (qIndex) => {
    // clear logic only for that question
    setQuestions((prevQs) => {
      const copy = JSON.parse(JSON.stringify(prevQs));
      if (copy[qIndex]) copy[qIndex].logic = [];
      return copy;
    });
    setPendingTextChange(null);
  };

  const cancelTextChangeAndRevert = (qIndex, oldText) => {
    // revert the text change in DOM/state
    mutateQuestionInCode(qIndex, (qNode, doc) => {
      let p = qNode.querySelector("p");
      if (!p) {
        p = doc.createElement("p");
        qNode.insertBefore(p, qNode.firstChild);
      }
      p.textContent = oldText;
    });
    setPendingTextChange(null);
  };

  // ---------- Option text change: migrates logic rule name then updates DOM ----------
  const handlePreviewOptionTextChange = (qIndex, optionIndex, newText) => {
    // migrate logic key in state if option text changed
    setQuestions((prevQs) => {
      const copy = JSON.parse(JSON.stringify(prevQs));
      const q = copy[qIndex];
      if (!q) return prevQs;
      const oldOption = q.options && q.options[optionIndex];
      if (oldOption !== undefined && oldOption !== newText) {
        if (Array.isArray(q.logic)) {
          q.logic = q.logic.map((rule) => (rule.option === oldOption ? { option: newText, showQuestions: rule.showQuestions } : rule));
        }
        if (Array.isArray(q.options)) q.options[optionIndex] = newText;
      }
      return copy;
    });

    mutateQuestionInCode(qIndex, (qNode, doc) => {
      const labels = qNode.querySelectorAll("label");
      if (!labels[optionIndex]) return;
      const label = labels[optionIndex];
      const input = label.querySelector("input");
      if (input) input.setAttribute("value", newText);

      // remove trailing text nodes and append new text node
      if (input) {
        let node = input.nextSibling;
        while (node) {
          const next = node.nextSibling;
          label.removeChild(node);
          node = next;
        }
      } else {
        Array.from(label.childNodes).forEach((node) => {
          if (node.nodeType === Node.TEXT_NODE) label.removeChild(node);
        });
      }
      label.appendChild(doc.createTextNode(newText));
    });
  };

  // ---------- Add option ----------
  const handleAddOption = (qIndex) => {
    mutateQuestionInCode(qIndex, (qNode, doc) => {
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

  // ---------- Remove option: update questions state logic, then mutate DOM preserving indentation ----------
  const handleRemoveOption = (qIndex, optionIndex) => {
    // first update questions state: remove option from options[] and remove logic rule for that option
    setQuestions((prevQs) => {
      const copy = JSON.parse(JSON.stringify(prevQs));
      if (!copy[qIndex]) return prevQs;
      const optionName = copy[qIndex].options && copy[qIndex].options[optionIndex];
      // remove option
      if (Array.isArray(copy[qIndex].options)) copy[qIndex].options.splice(optionIndex, 1);
      // remove logic rules referencing that option
      if (Array.isArray(copy[qIndex].logic)) copy[qIndex].logic = copy[qIndex].logic.filter((r) => r.option !== optionName);
      return copy;
    });

    // mutate DOM: remove label and maintain indentation/newlines
    mutateQuestionInCode(qIndex, (qNode, doc) => {
      const labels = Array.from(qNode.querySelectorAll("label"));
      if (!labels[optionIndex]) return;
      qNode.removeChild(labels[optionIndex]);

      // cleanup whitespace text nodes
      Array.from(qNode.childNodes).forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() === "") qNode.removeChild(node);
      });

      // re-add indentation before each remaining label
      const labelsAfter = qNode.querySelectorAll("label");
      labelsAfter.forEach((lbl) => {
        qNode.insertBefore(doc.createTextNode("\n    "), lbl);
      });
      // trailing indentation/newline before closing div
      qNode.appendChild(doc.createTextNode("\n  "));
    });
  };

  // ---------- Remove question: show confirmation that ALL logic will be removed; if confirmed remove ----------
  const handleRemoveQuestion = (qIndex) => {
    const proceed = window.confirm(
      `Removing question ${qIndex + 1} will DELETE that question AND RESET ALL LOGIC across the entire form.\n\nDo you want to continue?`
    );
    if (!proceed) return;

    // mutate DOM: remove qNode, then normalize and reparse/merge
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
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() === "") form.removeChild(node);
    });

    normalizeNames(doc);
    const newCode = formFromDocToCode(doc);

    // re-parse and merge, but then CLEAR ALL logic per requirement
    const parsed = parseCodeToQuestions(newCode);
    const merged = mergeParsedWithExisting(parsed);
    const cleared = merged.map((mq) => ({ ...mq, logic: [] }));

    setCode(newCode);
    setQuestions(cleared);
  };

  // ---------- Add question ----------
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

    normalizeNames(doc);
    const newCode = formFromDocToCode(doc);
    const parsed = parseCodeToQuestions(newCode);
    const merged = mergeParsedWithExisting(parsed);
    setCode(newCode);
    setQuestions(merged);
  };

  // ---------- Toggle type radio <-> checkbox ----------
  const handleToggleType = (qIndex, newType) => {
    // If question has logic, confirm clearing logic for that question
    if (questions[qIndex] && Array.isArray(questions[qIndex].logic) && questions[qIndex].logic.length > 0) {
      const ok = window.confirm(
        `Question #${qIndex + 1} has logic defined. Changing input type may invalidate that logic.\n\nClear logic for this question?`
      );
      if (ok) {
        setQuestions((prevQs) => {
          const copy = JSON.parse(JSON.stringify(prevQs));
          if (copy[qIndex]) copy[qIndex].logic = [];
          return copy;
        });
      }
    }

    mutateQuestionInCode(qIndex, (qNode) => {
      const inputs = qNode.querySelectorAll("input[type=radio], input[type=checkbox]");
      inputs.forEach((inp) => inp.setAttribute("type", newType));
    });
  };

  // ---------- Inline logic editor UI control (no popup): open editor for specific option ----------
  const toggleLogicEditor = (qIndex, optionValue) => {
    if (openLogicEditor && openLogicEditor.qIndex === qIndex && openLogicEditor.optionValue === optionValue) {
      setOpenLogicEditor(null);
      return;
    }
    setOpenLogicEditor({ qIndex, optionValue });
  };

  // ---------- Save logic edits from inline editor: user enters comma-separated 1-based question numbers ----------
  const saveLogicForOption = (qIndex, optionValue, csv) => {
    // parse CSV into indices (0-based)
    const arr = String(csv || "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "")
      .map((s) => {
        const n = Number(s);
        return Number.isFinite(n) && n >= 1 ? n - 1 : null;
      })
      .filter((n) => n !== null && Number.isFinite(n));
    // sanity: filter out self-reference (can't show itself)
    const filtered = arr.filter((n) => n !== qIndex);
    // update questions state
    setQuestions((prevQs) => {
      const copy = JSON.parse(JSON.stringify(prevQs));
      if (!copy[qIndex]) return prevQs;
      copy[qIndex].logic = copy[qIndex].logic || [];
      const ruleIndex = copy[qIndex].logic.findIndex((r) => r.option === optionValue);
      if (ruleIndex >= 0) {
        copy[qIndex].logic[ruleIndex].showQuestions = filtered;
      } else {
        copy[qIndex].logic.push({ option: optionValue, showQuestions: filtered });
      }
      return copy;
    });
    setOpenLogicEditor(null);
  };

  // ---------- Remove a logic rule for option ----------
  const removeLogicForOption = (qIndex, optionValue) => {
    setQuestions((prevQs) => {
      const copy = JSON.parse(JSON.stringify(prevQs));
      if (!copy[qIndex]) return prevQs;
      copy[qIndex].logic = (copy[qIndex].logic || []).filter((r) => r.option !== optionValue);
      return copy;
    });
    setOpenLogicEditor(null);
  };

  // ---------- Submit (editor) - sends form definition/payload to backend -->
  const handleSubmitDefinition = async (e) => {
    e.preventDefault();
    const formPayload = questions.map((q) => ({
      question: q.text,
      answer: [],
      type: q.type,
      options: q.options,
      logic: Array.isArray(q.logic) ? q.logic.map((r) => ({ option: r.option, showQuestions: r.showQuestions })) : []
    }));
    const payload = { form: formPayload };
    console.log("Submitting form definition:", payload);
    try {
      const res = await fetch("http://localhost:5000/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      console.log("Backend (definition):", data);
      alert("Form definition submitted successfully");
    } catch (err) {
      console.error(err);
      alert("Submit failed");
    }
  };

  // ---------- END-USER form logic: compute visible questions based on selected options ----------
  // When end-user selects options, recalc visibleSet using logic rules
  const recalcVisibility = (currentResponses, qs) => {
    const visible = new Set();
    const allQs = qs.map((_, i) => i);
    const conditionalSet = new Set();
    qs.forEach((q) => {
      (q.logic || []).forEach((r) => {
        (r.showQuestions || []).forEach((n) => conditionalSet.add(Number(n)));
      });
    });

    // determine triggered set from responses
    const triggered = new Set();
    qs.forEach((q, qi) => {
      const resp = currentResponses[qi];
      if (q.type === "radio") {
        if (resp) {
          const rule = (q.logic || []).find((r) => r.option === resp);
          if (rule && Array.isArray(rule.showQuestions)) rule.showQuestions.forEach((n) => triggered.add(Number(n)));
        }
      } else if (q.type === "checkbox") {
        if (Array.isArray(resp)) {
          resp.forEach((val) => {
            const rule = (q.logic || []).find((r) => r.option === val);
            if (rule && Array.isArray(rule.showQuestions)) rule.showQuestions.forEach((n) => triggered.add(Number(n)));
          });
        }
      }
    });

    // Show non-conditional by default + triggered conditional ones
    allQs.forEach((i) => {
      if (!conditionalSet.has(i)) visible.add(i);
    });
    triggered.forEach((i) => visible.add(i));

    return visible;
  };

  // ---------- End-user selection change ----------
  const handleEndUserChange = (qIndex, value, checked) => {
    setResponses((prev) => {
      const copy = JSON.parse(JSON.stringify(prev || {}));
      // for radio, value is single
      if (questions[qIndex].type === "radio") {
        copy[qIndex] = value;
      } else {
        // checkbox: maintain array
        const arr = Array.isArray(copy[qIndex]) ? copy[qIndex].slice() : [];
        if (checked) {
          if (!arr.includes(value)) arr.push(value);
        } else {
          const idx = arr.indexOf(value);
          if (idx >= 0) arr.splice(idx, 1);
        }
        copy[qIndex] = arr;
      }
      // recalc visible set immediately
      const newVisible = recalcVisibility(copy, questions);
      setVisibleSet(newVisible);
      return copy;
    });
  };

  // ---------- Start end-user mode (navigates to end-user view) ----------
  const startEndUserForm = () => {
    // initial responses empty
    setResponses({});
    // compute initial visibility: by default show non-conditional only
    const initialVisible = recalcVisibility({}, questions);
    setVisibleSet(initialVisible);
    setEndUserMode(true);
    // hide any open logic editors
    setOpenLogicEditor(null);
  };

  // ---------- Submit end-user form data to backend ----------
  const handleSubmitEndUserForm = async (e) => {
    e.preventDefault();
    // build payload to send with answers and optionally form structure
    const answers = questions.map((q, qi) => {
      const key = `q${qi}`;
      const ans = responses[qi];
      return {
        question: q.text,
        answer: Array.isArray(ans) ? ans : ans ? [ans] : [],
        type: q.type,
        options: q.options
      };
    });
    const payload = { form: answers, submittedAt: new Date().toISOString() };
    console.log("Submitting end-user answers:", payload);
    try {
      const res = await fetch("http://localhost:5000/api/forms/response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      console.log("Backend (response):", data);
      alert("Form submitted — thank you!");
      // Return to editor after submit (optional)
      setEndUserMode(false);
    } catch (err) {
      console.error(err);
      alert("Submit failed");
    }
  };

  // ---------- Submit handler for editor form (sends definition) ----------
  const onEditorSubmit = (e) => {
    e.preventDefault();
    // send to backend as form definition
    handleSubmitDefinition(e);
  };

  // ---------- Left editor change handler ----------
  const onLeftChange = (e) => {
    setLeftText(e.target.value);
    if (viewLang === "html" && !programmaticLeftUpdate.current) {
      setCode(e.target.value);
    }
  };

  // ---------- initial parse on mount ----------
  useEffect(() => {
    const parsed = parseCodeToQuestions(code);
    const merged = mergeParsedWithExisting(parsed);
    setQuestions(merged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- Render ----------
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
            <option value="html">HTML (raw)</option>
            <option value="python">Python</option>
            <option value="vbscript">VBScript</option>
          </select>
          <div style={{ marginLeft: "auto", fontSize: 13, color: "#94a3b8" }}>
            {viewLang === "html" ? "Editable (HTML)" : "Editable (JSON payload inside code)"}
          </div>
        </div>

        <textarea
          ref={leftTextareaRef}
          className="editor"
          value={leftText}
          onChange={onLeftChange}
          spellCheck="false"
        />

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={() => { /* normalize code to current generated view */ programmaticLeftUpdate.current = true; const normalized = generateCodeForLanguage(viewLang, questions); setLeftText(normalized); setTimeout(() => programmaticLeftUpdate.current = false, 10); }}>
            Normalize Left Text
          </button>
          <button onClick={() => { setQuestions(parseCodeToQuestions(code)); }}>
            Reparse HTML
          </button>
          <button onClick={() => { setQuestions(buildPayloadObject(questions).form); alert("Quick convert — check preview."); }}>
            Quick Sync
          </button>
        </div>
      </div>

      <div className="right">
        {/* Pending text-change modal (appears if a question with logic text was edited) */}
        {pendingTextChange ? (
          <div className="modal-overlay">
            <div className="modal">
              <h4>Question text changed</h4>
              <p>
                You changed text for question #{pendingTextChange.qIndex + 1}. This question has logic rules attached.
              </p>
              <p>What do you want to do with the logic for this question?</p>
              <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
                <button onClick={() => keepLogicAndClose()}>Keep logic & Apply text</button>
                <button onClick={() => clearLogicForQuestion(pendingTextChange.qIndex)} style={{ background: "transparent", color: "#ef4444", border: "1px solid rgba(239,68,68,0.12)" }}>
                  Clear logic & Apply
                </button>
                <button onClick={() => cancelTextChangeAndRevert(pendingTextChange.qIndex, pendingTextChange.oldText)} style={{ marginLeft: "auto" }}>
                  Cancel (revert text)
                </button>
              </div>
            </div>
          </div>
        ) : null}

        {!endUserMode ? (
          <>
            <h3>Preview / Editor</h3>
            <form onSubmit={onEditorSubmit}>
              {questions.length === 0 && <div>No questions found in code.</div>}

              {questions.map((q, qi) => (
                <div className="question-block" key={qi}>
                  <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 12 }}>
                    <div style={{ display: "flex", gap: 8, alignItems: "center" }}>
                      <div className="index-chip">
                        #{q.id + 1}
                      </div>
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

                  <div className="options" style={{ marginTop: 10 }}>
                    {q.options.map((opt, oi) => (
                      <div className="option-row" key={oi} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <label className="option" style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                          <input
                            type={q.type}
                            name={q.type === "checkbox" ? `q${qi}[]` : `q${qi}`}
                            value={opt}
                            readOnly
                            style={{ marginRight: 8 }}
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

                  {/* inline logic editor (opened for a specific qIndex/option) */}
                  {openLogicEditor && openLogicEditor.qIndex === qi ? (
                    <div style={{ marginTop: 6 }}>
                      {q.options.map((opt) => (
                        <div key={opt} style={{ marginBottom: 6 }}>
                          {openLogicEditor.optionValue === opt ? (
                            <LogicInlineEditor
                              questions={questions}
                              qIndex={qi}
                              optionValue={opt}
                              initialRules={(q.logic || []).find((r) => r.option === opt) || { showQuestions: [] }}
                              onSave={saveLogicForOption}
                              onCancel={() => setOpenLogicEditor(null)}
                              onRemove={() => removeLogicForOption(qi, opt)}
                            />
                          ) : null}
                        </div>
                      ))}
                    </div>
                  ) : null}

                  <div className="q-actions" style={{ marginTop: 8 }}>
                    <button type="button" onClick={() => handleAddOption(qi)}>
                      + Add Option
                    </button>
                    {" "}
                    <button type="button" onClick={() => handleRemoveQuestion(qi)} style={{ marginLeft: 8 }} className="remove-question-btn">
                      Remove Question
                    </button>
                  </div>

                  {/* show current logic rules */}
                  <div style={{ marginTop: 8, color: "#475569", fontSize: 13 }}>
                    {Array.isArray(q.logic) && q.logic.length > 0 ? (
                      <div>
                        <strong>Logic:</strong>
                        <ul style={{ margin: "6px 0 0 18px" }}>
                          {q.logic.map((rule, ri) => (
                            <li key={ri}>
                              If option <em>"{rule.option}"</em> selected → show questions:{" "}
                              {Array.isArray(rule.showQuestions) && rule.showQuestions.length > 0
                                ? rule.showQuestions.map((n) => Number(n) + 1).join(", ")
                                : "none"}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div style={{ opacity: 0.7 }}>No logic rules for this question.</div>
                    )}
                  </div>
                </div>
              ))}

              <div className="form-actions" style={{ marginTop: 16 }}>
                <button type="button" onClick={handleAddQuestion}>
                  + Add Question
                </button>
                {" "}
                <button type="submit">Save Definition</button>
                {" "}
                <button type="button" onClick={startEndUserForm} style={{ marginLeft: 8 }}>
                  Preview End-User Form
                </button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h3>End-User Form</h3>
            <form onSubmit={handleSubmitEndUserForm}>
              {questions.length === 0 && <div>No questions to show.</div>}

              {questions.map((q, qi) => {
                // only show if visibleSet includes it
                if (!visibleSet.has(qi)) return null;
                return (
                  <div className="question-block" key={qi}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div className="index-chip">
                        #{qi + 1}
                      </div>
                      <div style={{ fontWeight: 600 }}>{q.text}</div>
                    </div>

                    <div style={{ marginTop: 8 }}>
                      {q.options.map((opt, oi) => {
                        const inputName = q.type === "checkbox" ? `q${qi}[]` : `q${qi}`;
                        const checked = q.type === "checkbox" ? (Array.isArray(responses[qi]) && responses[qi].includes(opt)) : responses[qi] === opt;
                        return (
                          <label key={oi} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <input
                              type={q.type}
                              name={inputName}
                              value={opt}
                              checked={checked}
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

              <div style={{ marginTop: 16, display: "flex", gap: 8 }}>
                <button type="submit">Submit Answers</button>
                <button type="button" onClick={() => setEndUserMode(false)}>Back to Editor</button>
              </div>
            </form>
          </>
        )}
      </div>
    </div>
  );
}

/* ---------- Inline logic editor component (kept inside same file for simplicity) ---------- */
function LogicInlineEditor({ questions, qIndex, optionValue, initialRules, onSave, onCancel, onRemove }) {
  // initialRules: { option, showQuestions: [indices] }
  const [csv, setCsv] = useState((initialRules && Array.isArray(initialRules.showQuestions)) ? initialRules.showQuestions.map((n) => Number(n) + 1).join(",") : "");
  return (
    <div style={{ background: "#f8fafc", padding: 8, borderRadius: 6, border: "1px solid #e2e8f0", marginTop: 8 }}>
      <div style={{ marginBottom: 6, fontSize: 13, color: "#334155" }}>
        Logic for option <strong>"{optionValue}"</strong> (enter question numbers to SHOW, comma-separated, 1-based):
      </div>
      <input
        value={csv}
        onChange={(e) => setCsv(e.target.value)}
        placeholder="e.g. 2,4"
        style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e2e8f0", boxSizing: "border-box" }}
      />
      <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
        <button type="button" onClick={() => onSave(qIndex, optionValue, csv)}>Save</button>
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" onClick={() => onRemove(qIndex, optionValue)} style={{ background: "transparent", color: "#ef4444", border: "1px solid rgba(239,68,68,0.12)" }}>
          Remove Rule
        </button>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
        Note: question numbers are 1-based (first question is 1). A question cannot show itself; such references will be ignored.
      </div>
    </div>
  );
}
