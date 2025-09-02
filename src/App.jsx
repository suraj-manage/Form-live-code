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

  // Source HTML and state
  const [code, setCode] = useState(initialCode);
  const [questions, setQuestions] = useState([]);
  const parseTimer = useRef(null);

  // Editor pane
  const [viewLang, setViewLang] = useState("html");
  const [leftText, setLeftText] = useState(initialCode);
  const programmaticLeftUpdate = useRef(false);
  const leftTextareaRef = useRef(null);

  // End-user
  const [endUserMode, setEndUserMode] = useState(false);
  const [responses, setResponses] = useState({});
  const [visibleSet, setVisibleSet] = useState(new Set());

  // UI state
  const [openLogicEditor, setOpenLogicEditor] = useState(null); // { qIndex, optionValue } or null
  const [openQuotaEditor, setOpenQuotaEditor] = useState(null); // qIndex or null

  const [pendingTextChange, setPendingTextChange] = useState(null);

  // ---------- parsing helpers ----------
  const parseCodeToQuestions = (html) => {
    try {
      const parser = new DOMParser();
      const doc = parser.parseFromString(html, "text/html");
      const form = doc.querySelector("form");
      if (!form) return [];
      const qNodes = form.querySelectorAll(".question");
      return Array.from(qNodes).map((qNode, qi) => {
        const p = qNode.querySelector("p");
        const text = p ? p.textContent.trim() : "Untitled Question";
        const labels = qNode.querySelectorAll("label");
        const options = Array.from(labels).map((label) => {
          const input = label.querySelector("input");
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
        return { id: qi, type, text, options: options.slice(), logic: [], quota: null };
      });
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

  // merge parsed with existing to keep logic & quota when editing markup
  const mergeParsedWithExisting = (parsed) => {
    const prev = questions || [];
    return parsed.map((pQ, idx) => {
      const found = prev.find((pr) => pr.text === pQ.text);
      const logic = [];
      if (found && Array.isArray(found.logic)) {
        found.logic.forEach((rule) => {
          if (pQ.options.includes(rule.option)) {
            const showQuestions = (Array.isArray(rule.showQuestions) ? rule.showQuestions : [])
              .map((n) => Number(n))
              .filter((n) => Number.isFinite(n) && n >= 0);
            logic.push({
              option: rule.option,
              showQuestions,
              quotaCheck: rule.quotaCheck || null
            });
          }
        });
      }
      const quota = found && found.quota ? found.quota : null;
      return { id: idx, type: pQ.type, text: pQ.text, options: pQ.options.slice(), logic, quota };
    });
  };

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

  // ---------- quota helpers ----------
  const updateQuota = (qIndex, optionValue, newQuota) => {
    setQuestions(prevQs => {
      const copy = JSON.parse(JSON.stringify(prevQs));
      const q = copy[qIndex];
      if (!q) return prevQs;
      const rule = (q.logic || []).find(r => r.option === optionValue);
      if (rule) {
        rule.quotaCheck = newQuota;
      } else {
        q.logic = q.logic || [];
        q.logic.push({ option: optionValue, showQuestions: [], quotaCheck: newQuota });
      }
      return copy;
    });
  };

  const saveQuotaForQuestion = (qIndex, quotaObj) => {
    setQuestions(prevQs => {
      const copy = JSON.parse(JSON.stringify(prevQs));
      if (!copy[qIndex]) return prevQs;
      copy[qIndex].quota = quotaObj;
      return copy;
    });
    setOpenQuotaEditor(null);
  };

  const removeQuotaForQuestion = (qIndex) => {
    setQuestions(prevQs => {
      const copy = JSON.parse(JSON.stringify(prevQs));
      if (!copy[qIndex]) return prevQs;
      copy[qIndex].quota = null;
      return copy;
    });
    setOpenQuotaEditor(null);
  };

  // ---------- payload generation ----------
  const buildPayloadObject = (qs) => {
    return {
      form: qs.map((q) => ({
        question: q.text,
        answer: [],
        type: q.type,
        options: q.options,
        logic: Array.isArray(q.logic) ? q.logic.map((r) => ({ option: r.option, showQuestions: r.showQuestions, quotaCheck: r.quotaCheck || null })) : [],
        quota: q.quota || null
      }))
    };
  };

  const escapeHtml = (str) => {
    if (typeof str !== "string") return "";
    return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
  };

  const generateCodeForLanguage = (lang, qs) => {
    const payloadObj = buildPayloadObject(qs);
    if (lang === "html") return code;
    const payloadStr = JSON.stringify(payloadObj, null, 2);
    if (lang === "python") {
      return `# Python requests example\nimport requests\n\nurl = "http://localhost:5000/api/forms/submit"\npayload = ${payloadStr}\n\nresp = requests.post(url, json=payload)\nprint(resp.status_code)\nprint(resp.text)`;
    }
    if (lang === "vbscript") {
      const vbJson = payloadStr.replace(/\"/g, '""');
      return `' VBScript example using MSXML2\nDim payload\npayload = "${vbJson}"\n\nDim http\nSet http = CreateObject("MSXML2.XMLHTTP")\nhttp.open "POST", "http://localhost:5000/api/forms/submit", False\nhttp.setRequestHeader "Content-Type", "application/json"\nhttp.send payload\n\nWScript.Echo http.responseText`;
    }
    return "";
  };

  useEffect(() => {
    const newLeft = generateCodeForLanguage(viewLang, questions);
    const ta = leftTextareaRef.current;
    const wasFocused = ta && document.activeElement === ta;
    let selStart = 0, selEnd = 0;
    if (wasFocused) {
      try { selStart = ta.selectionStart; selEnd = ta.selectionEnd; } catch { selStart = selEnd = 0; }
    }

    programmaticLeftUpdate.current = true;
    setLeftText(newLeft);

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

  // ---------- left <-> payload parsing ----------
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

  const tryParsePayloadFromText = (text, lang) => {
    try {
      if (!text || typeof text !== "string") return null;
      let first = text.indexOf("{");
      let last = text.lastIndexOf("}");
      if (first === -1 || last === -1 || last <= first) return null;
      let jsonCandidate = text.slice(first, last + 1);
      if (lang === "vbscript") {
        jsonCandidate = jsonCandidate.replace(/""/g, '"');
        jsonCandidate = jsonCandidate.replace(/\\"/g, '"');
      }
      jsonCandidate = tolerantJsonCleanup(jsonCandidate);
      const obj = JSON.parse(jsonCandidate);
      if (obj && typeof obj === "object" && Array.isArray(obj.form)) return obj;
      return null;
    } catch (err) {
      return null;
    }
  };

  const applyPayloadFromLeft = (text = leftText, lang = viewLang) => {
    if (programmaticLeftUpdate.current) return false;
    if (lang === "html") return false;
    const parsedPayload = tryParsePayloadFromText(text, lang);
    if (!parsedPayload) return false;
    const newHtml = buildHtmlFromPayload(parsedPayload);
    if (!newHtml) return false;

    setCode(newHtml);
    const parsed = parseCodeToQuestions(newHtml);
    const merged = mergeParsedWithExisting(parsed);
    const withLogic = merged.map((mq, i) => {
      const payloadQ = parsedPayload.form[i];
      if (payloadQ && Array.isArray(payloadQ.logic)) {
        const l = payloadQ.logic.map((r) => ({
          option: String(r.option),
          showQuestions: (Array.isArray(r.showQuestions) ? r.showQuestions.map((n) => Number(n)).filter(Number.isFinite) : []),
          quotaCheck: r.quotaCheck || null
        }));
        const qQuota = payloadQ.quota || null;
        return { ...mq, logic: l, quota: qQuota };
      }
      if (payloadQ && payloadQ.quota) {
        return { ...mq, quota: payloadQ.quota };
      }
      return mq;
    });
    setQuestions(withLogic);

    programmaticLeftUpdate.current = true;
    const normalized = generateCodeForLanguage(lang, withLogic);
    setLeftText(normalized);
    setTimeout(() => (programmaticLeftUpdate.current = false), 10);
    return true;
  };

  const leftEditTimer = useRef(null);
  useEffect(() => {
    if (programmaticLeftUpdate.current) return;
    if (viewLang === "html") return;
    clearTimeout(leftEditTimer.current);
    leftEditTimer.current = setTimeout(() => {
      applyPayloadFromLeft(leftText, viewLang);
    }, 200);
    return () => clearTimeout(leftEditTimer.current);
  }, [leftText, viewLang]);

  // ---------- mutate DOM helpers ----------
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

  // ---------- preview editing ----------
  const handlePreviewQuestionTextChange = (qIndex, newText) => {
    const oldText = questions[qIndex] ? questions[qIndex].text : "";
    const oldLogic = questions[qIndex] && Array.isArray(questions[qIndex].logic) ? JSON.parse(JSON.stringify(questions[qIndex].logic)) : [];
    const hadLogic = oldLogic && oldLogic.length > 0 && oldText !== newText;
    if (hadLogic) {
      if (!pendingTextChange || pendingTextChange.qIndex !== qIndex) {
        setPendingTextChange({ qIndex, oldText, oldLogic });
        setQuestions((prevQs) => {
          const copy = JSON.parse(JSON.stringify(prevQs));
          if (copy[qIndex]) copy[qIndex].text = newText;
          return copy;
        });
        return;
      }
      if (pendingTextChange && pendingTextChange.qIndex === qIndex) {
        setQuestions((prevQs) => {
          const copy = JSON.parse(JSON.stringify(prevQs));
          if (copy[qIndex]) copy[qIndex].text = newText;
          return copy;
        });
        return;
      }
    }

    mutateQuestionInCode(qIndex, (qNode, doc) => {
      let p = qNode.querySelector("p");
      if (!p) {
        p = doc.createElement("p");
        qNode.insertBefore(p, qNode.firstChild);
      }
      p.textContent = newText;
    });
  };

  const keepLogicAndClose = () => {
    if (!pendingTextChange) return;
    const { qIndex, oldLogic } = pendingTextChange;
    const newText = (questions[qIndex] && questions[qIndex].text) || "";
    mutateQuestionInCode(qIndex, (qNode, doc) => {
      let p = qNode.querySelector("p");
      if (!p) {
        p = doc.createElement("p");
        qNode.insertBefore(p, qNode.firstChild);
      }
      p.textContent = newText;
    });
    setQuestions((prevQs) => {
      const copy = JSON.parse(JSON.stringify(prevQs));
      if (copy[qIndex]) copy[qIndex].logic = Array.isArray(oldLogic) ? oldLogic : [];
      return copy;
    });
    setPendingTextChange(null);
  };

  const clearLogicForQuestion = (qIndex) => {
    if (!pendingTextChange || pendingTextChange.qIndex !== qIndex) return;
    const newText = (questions[qIndex] && questions[qIndex].text) || "";
    mutateQuestionInCode(qIndex, (qNode, doc) => {
      let p = qNode.querySelector("p");
      if (!p) {
        p = doc.createElement("p");
        qNode.insertBefore(p, qNode.firstChild);
      }
      p.textContent = newText;
    });
    setQuestions((prevQs) => {
      const copy = JSON.parse(JSON.stringify(prevQs));
      if (copy[qIndex]) copy[qIndex].logic = [];
      return copy;
    });
    setPendingTextChange(null);
  };

  const cancelTextChangeAndRevert = (qIndex, oldText) => {
    mutateQuestionInCode(qIndex, (qNode, doc) => {
      let p = qNode.querySelector("p");
      if (!p) {
        p = doc.createElement("p");
        qNode.insertBefore(p, qNode.firstChild);
      }
      p.textContent = oldText;
    });
    setQuestions((prevQs) => {
      const copy = JSON.parse(JSON.stringify(prevQs));
      if (copy[qIndex]) copy[qIndex].text = oldText;
      return copy;
    });
    setPendingTextChange(null);
  };

  // ---------- option editing ----------
  const handlePreviewOptionTextChange = (qIndex, optionIndex, newText) => {
    setQuestions((prevQs) => {
      const copy = JSON.parse(JSON.stringify(prevQs));
      const q = copy[qIndex];
      if (!q) return prevQs;
      const oldOption = q.options && q.options[optionIndex];
      if (oldOption !== undefined && oldOption !== newText) {
        if (Array.isArray(q.logic)) {
          q.logic = q.logic.map((rule) => (rule.option === oldOption ? { option: newText, showQuestions: rule.showQuestions, quotaCheck: rule.quotaCheck || null } : rule));
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
      qNode.appendChild(doc.createTextNode("\n  "));
    });
  };

  const handleRemoveOption = (qIndex, optionIndex) => {
    setQuestions((prevQs) => {
      const copy = JSON.parse(JSON.stringify(prevQs));
      if (!copy[qIndex]) return prevQs;
      const optionName = copy[qIndex].options && copy[qIndex].options[optionIndex];
      if (Array.isArray(copy[qIndex].options)) copy[qIndex].options.splice(optionIndex, 1);
      if (Array.isArray(copy[qIndex].logic)) copy[qIndex].logic = copy[qIndex].logic.filter((r) => r.option !== optionName);
      return copy;
    });

    mutateQuestionInCode(qIndex, (qNode, doc) => {
      const labels = Array.from(qNode.querySelectorAll("label"));
      if (!labels[optionIndex]) return;
      qNode.removeChild(labels[optionIndex]);
      Array.from(qNode.childNodes).forEach((node) => {
        if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() === "") qNode.removeChild(node);
      });
      const labelsAfter = qNode.querySelectorAll("label");
      labelsAfter.forEach((lbl) => {
        qNode.insertBefore(doc.createTextNode("\n    "), lbl);
      });
      qNode.appendChild(doc.createTextNode("\n  "));
    });
  };

  const handleRemoveQuestion = (qIndex) => {
    const proceed = window.confirm(
      `Removing question ${qIndex + 1} will DELETE that question AND RESET ALL LOGIC across the entire form.\n\nDo you want to continue?`
    );
    if (!proceed) return;

    const parser = new DOMParser();
    const doc = parser.parseFromString(code, "text/html");
    const form = doc.querySelector("form");
    if (!form) return;
    const qNodes = form.querySelectorAll(".question");
    const qNode = qNodes[qIndex];
    if (!qNode) return;
    form.removeChild(qNode);

    Array.from(form.childNodes).forEach((node) => {
      if (node.nodeType === Node.TEXT_NODE && node.textContent.trim() === "") form.removeChild(node);
    });

    normalizeNames(doc);
    const newCode = formFromDocToCode(doc);

    // re-parse and merge, but CLEAR ALL logic & quotas per requirement
    const parsed = parseCodeToQuestions(newCode);
    const merged = mergeParsedWithExisting(parsed);
    const cleared = merged.map((mq) => ({ ...mq, logic: [], quota: null }));

    setCode(newCode);
    setQuestions(cleared);
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

    normalizeNames(doc);
    const newCode = formFromDocToCode(doc);
    const parsed = parseCodeToQuestions(newCode);
    const merged = mergeParsedWithExisting(parsed);
    setCode(newCode);
    setQuestions(merged);
  };

  const handleToggleType = (qIndex, newType) => {
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

  // ---------- Logic editor open/close ----------
  const toggleLogicEditor = (qIndex, optionValue) => {
    if (openLogicEditor && openLogicEditor.qIndex === qIndex && openLogicEditor.optionValue === optionValue) {
      setOpenLogicEditor(null);
      return;
    }
    setOpenLogicEditor({ qIndex, optionValue });
    // close quota editor when logic opened
    setOpenQuotaEditor(null);
  };

  // ---------- Quota editor toggle (FIX) ----------
  const toggleQuotaEditor = (qIndex) => {
    setOpenQuotaEditor(prev => (prev === qIndex ? null : qIndex));
    // close logic editor when quota opened
    setOpenLogicEditor(null);
  };

  // ---------- Logic CRUD ----------
  const saveLogicForOption = (qIndex, optionValue, csv) => {
    const arr = String(csv || "")
      .split(",")
      .map((s) => s.trim())
      .filter((s) => s !== "")
      .map((s) => {
        const n = Number(s);
        return Number.isFinite(n) && n >= 1 ? n - 1 : null;
      })
      .filter((n) => n !== null && Number.isFinite(n));

    setQuestions(prevQs => {
      const copy = JSON.parse(JSON.stringify(prevQs));
      const q = copy[qIndex];
      if (!q) return prevQs;
      let rule = (q.logic || []).find(r => r.option === optionValue);
      if (!rule) {
        rule = { option: optionValue, showQuestions: arr, quotaCheck: null };
        q.logic = q.logic || [];
        q.logic.push(rule);
      } else {
        rule.showQuestions = arr;
      }
      return copy;
    });

    setOpenLogicEditor(null);
  };

  const removeLogicForOption = (qIndex, optionValue) => {
    setQuestions((prevQs) => {
      const copy = JSON.parse(JSON.stringify(prevQs));
      if (!copy[qIndex]) return prevQs;
      copy[qIndex].logic = (copy[qIndex].logic || []).filter((r) => r.option !== optionValue);
      return copy;
    });
    setOpenLogicEditor(null);
  };

  // ---------- submit / end-user handlers ----------
  const handleSubmitDefinition = async (e) => {
    e.preventDefault();
    const formPayload = questions.map((q) => ({
      question: q.text,
      answer: [],
      type: q.type,
      options: q.options,
      logic: Array.isArray(q.logic) ? q.logic.map((r) => ({ option: r.option, showQuestions: r.showQuestions, quotaCheck: r.quotaCheck || null })) : [],
      quota: q.quota || null
    }));

    const payload = {
      title: "Editor form",
      description: "",
      form: formPayload,
      meta: {
        submittedFrom: typeof window !== "undefined" ? window.location.href : "unknown",
        sentAt: new Date().toISOString()
      }
    };

    try {
      const res = await fetch("http://localhost:5000/api/forms/submit", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        console.error("Failed to save form definition:", res.status, data);
        alert(`Save failed: ${res.status} ${data && data.error ? "- " + data.error : ""}`);
        return;
      }
      if (data && data.form && data.form._id) alert(`Form definition submitted successfully (id: ${data.form._id})`);
      else if (data && data.message) alert(`Form definition submitted successfully: ${data.message}`);
      else alert("Form definition submitted successfully");
    } catch (err) {
      console.error("Submit error:", err);
      alert("Submit failed (network or unexpected error). See console for details.");
    }
  };

  const recalcVisibility = (currentResponses, qs) => {
    const visible = new Set();
    const allQs = qs.map((_, i) => i);
    const conditionalSet = new Set();
    qs.forEach((q) => {
      (q.logic || []).forEach((r) => {
        (r.showQuestions || []).forEach((n) => conditionalSet.add(Number(n)));
      });
    });

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

    allQs.forEach((i) => {
      if (!conditionalSet.has(i)) visible.add(i);
    });
    triggered.forEach((i) => visible.add(i));
    return visible;
  };

  const handleEndUserChange = (qIndex, value, checked) => {
    setResponses((prev) => {
      const copy = JSON.parse(JSON.stringify(prev || {}));
      if (questions[qIndex].type === "radio") {
        copy[qIndex] = value;
      } else {
        const arr = Array.isArray(copy[qIndex]) ? copy[qIndex].slice() : [];
        if (checked) {
          if (!arr.includes(value)) arr.push(value);
        } else {
          const idx = arr.indexOf(value);
          if (idx >= 0) arr.splice(idx, 1);
        }
        copy[qIndex] = arr;
      }
      const newVisible = recalcVisibility(copy, questions);
      setVisibleSet(newVisible);
      return copy;
    });
  };

  const startEndUserForm = () => {
    setResponses({});
    const initialVisible = recalcVisibility({}, questions);
    setVisibleSet(initialVisible);
    setEndUserMode(true);
    setOpenLogicEditor(null);
    setOpenQuotaEditor(null);
  };

  const handleSubmitEndUserForm = async (e) => {
    e.preventDefault();
    const answers = questions.map((q, qi) => {
      const ans = responses[qi];
      return {
        question: q.text,
        answer: Array.isArray(ans) ? ans : ans ? [ans] : [],
        type: q.type,
        options: q.options
      };
    });
    const payload = { form: answers, submittedAt: new Date().toISOString() };
    try {
      const res = await fetch("http://localhost:5000/api/forms/response", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(payload),
      });
      const data = await res.json().catch(() => null);
      if (!res.ok) {
        console.error("Failed to submit answers:", res.status, data);
        alert(`Submit failed: ${res.status} ${data && data.error ? "- " + data.error : ""}`);
        return;
      }
      alert("Form submitted — thank you!");
      setEndUserMode(false);
    } catch (err) {
      console.error("Submit error:", err);
      alert("Submit failed (network or unexpected error). See console for details.");
    }
  };

  const onEditorSubmit = (e) => { e.preventDefault(); handleSubmitDefinition(e); };

  const onLeftChange = (e) => {
    setLeftText(e.target.value);
    if (viewLang === "html" && !programmaticLeftUpdate.current) {
      setCode(e.target.value);
    } else {
      if (!programmaticLeftUpdate.current) {
        applyPayloadFromLeft(e.target.value, viewLang);
      }
    }
  };

  const onLeftBlur = () => applyPayloadFromLeft(leftText, viewLang);

  useEffect(() => {
    const parsed = parseCodeToQuestions(code);
    const merged = mergeParsedWithExisting(parsed);
    setQuestions(merged);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // ---------- render ----------
  return (
    <div className="container">
      <div className="left">
        <h3>Form Code (editable)</h3>

        <div style={{ marginBottom: 8, display: "flex", gap: 8, alignItems: "center" }}>
          <label htmlFor="lang-select" style={{ fontSize: 13, color: "#475569" }}>Show as:</label>
          <select id="lang-select" value={viewLang} onChange={(e) => setViewLang(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6, border: "1px solid #e2e8f0" }}>
            <option value="html">HTML (raw)</option>
            <option value="python">Python</option>
            <option value="vbscript">VBScript</option>
          </select>
          <div style={{ marginLeft: "auto", fontSize: 13, color: "#94a3b8" }}>
            {viewLang === "html" ? "Editable (HTML)" : "Editable (JSON payload inside code)"}
          </div>
        </div>

        <textarea ref={leftTextareaRef} className="editor" value={leftText} onChange={onLeftChange} onBlur={onLeftBlur} spellCheck="false" />

        <div style={{ display: "flex", gap: 8, marginTop: 12 }}>
          <button onClick={() => { programmaticLeftUpdate.current = true; const normalized = generateCodeForLanguage(viewLang, questions); setLeftText(normalized); setTimeout(() => programmaticLeftUpdate.current = false, 10); }}>
            Normalize Left Text
          </button>
          <button onClick={() => { setQuestions(parseCodeToQuestions(code)); }}>Reparse HTML</button>
          <button onClick={() => { setQuestions(buildPayloadObject(questions).form); alert("Quick convert — check preview."); }}>Quick Sync</button>
        </div>
      </div>

      <div className="right">
        {pendingTextChange ? (
          <div className="modal-overlay">
            <div className="modal">
              <h4>Question text changed</h4>
              <p>You changed text for question #{pendingTextChange.qIndex + 1}. This question has logic rules attached.</p>
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
                      <div className="index-chip">#{q.id + 1}</div>
                      <input className="question-input" value={q.text} onChange={(e) => handlePreviewQuestionTextChange(qi, e.target.value)} />

                      {/* Quota button uses the fixed toggle */}
                      <button
                        type="button"
                        onClick={() => toggleQuotaEditor(qi)}
                        title="Edit quota for this question"
                        style={{ marginLeft: 6, background: "transparent", color: "#7c3aed", border: "1px solid rgba(124,58,237,0.08)", padding: "6px 8px", borderRadius: 6 }}
                      >
                        Quota
                      </button>
                    </div>

                    <div className="type-switch">
                      <label>
                        <input type="radio" name={`type-${qi}`} checked={q.type === "radio"} onChange={() => handleToggleType(qi, "radio")} /> radio
                      </label>
                      <label>
                        <input type="radio" name={`type-${qi}`} checked={q.type === "checkbox"} onChange={() => handleToggleType(qi, "checkbox")} /> checkbox
                      </label>
                    </div>
                  </div>

                  <div className="options" style={{ marginTop: 10 }}>
                    {q.options.map((opt, oi) => (
                      <div className="option-row" key={oi} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 6 }}>
                        <label className="option" style={{ display: "flex", alignItems: "center", gap: 8, flex: 1 }}>
                          <input type={q.type} name={q.type === "checkbox" ? `q${qi}[]` : `q${qi}`} value={opt} readOnly style={{ marginRight: 8 }} />
                          <input className="option-input" value={opt} onChange={(e) => handlePreviewOptionTextChange(qi, oi, e.target.value)} />
                        </label>

                        <button type="button" onClick={() => toggleLogicEditor(qi, opt)} title="Edit logic for this option" className="remove-option-btn" style={{ background: "transparent", color: "#0ea5a3", borderColor: "rgba(14,165,163,0.12)" }}>
                          Logic
                        </button>

                        <button type="button" onClick={() => handleRemoveOption(qi, oi)} title="Remove this option" className="remove-option-btn">
                          Remove option
                        </button>
                      </div>
                    ))}
                  </div>

                  <div className="q-actions" style={{ marginTop: 8 }}>
                    <button type="button" onClick={() => handleAddOption(qi)}>+ Add Option</button>{" "}
                    <button type="button" onClick={() => handleRemoveQuestion(qi)} style={{ marginLeft: 8 }} className="remove-question-btn">Remove Question</button>
                  </div>

                  {/* Logic panel (unified, below q-actions) */}
                  {openLogicEditor && openLogicEditor.qIndex === qi ? (
                    <QuestionLogicEditor
                      questions={questions}
                      qIndex={qi}
                      initialOption={openLogicEditor.optionValue}
                      onSave={saveLogicForOption}
                      onRemove={removeLogicForOption}
                      onCancel={() => setOpenLogicEditor(null)}
                    />
                  ) : null}

                  {/* Quota panel (toggled by Quota button) */}
                  {openQuotaEditor === qi ? (
                    <QuestionQuotaEditor
                      questions={questions}
                      qIndex={qi}
                      initialQuota={q.quota}
                      onSave={saveQuotaForQuestion}
                      onRemove={removeQuotaForQuestion}
                      onCancel={() => setOpenQuotaEditor(null)}
                    />
                  ) : null}

                  {/* show current logic rules and quota summary */}
                  <div style={{ marginTop: 8, color: "#475569", fontSize: 13 }}>
                    {Array.isArray(q.logic) && q.logic.length > 0 ? (
                      <div>
                        <strong>Logic:</strong>
                        <ul style={{ margin: "6px 0 0 18px" }}>
                          {q.logic.map((rule, ri) => (
                            <li key={ri}>
                              If option <em>"{rule.option}"</em> selected → show questions:{" "}
                              {Array.isArray(rule.showQuestions) && rule.showQuestions.length > 0 ? rule.showQuestions.map((n) => Number(n) + 1).join(", ") : "none"}
                              {rule.quotaCheck ? ` (option-quota: ${rule.quotaCheck.condition} ${rule.quotaCheck.value}${rule.quotaCheck.meetRequirement ? " must-meet" : ""})` : ""}
                            </li>
                          ))}
                        </ul>
                      </div>
                    ) : (
                      <div style={{ opacity: 0.7 }}>No logic rules for this question.</div>
                    )}

                    {q.quota ? (
                      <div style={{ marginTop: 6, fontSize: 13 }}>
                        <strong>Quota:</strong> {q.quota.condition} {q.quota.value} {q.quota.meetRequirement ? "(must meet)" : ""}
                      </div>
                    ) : null}
                  </div>
                </div>
              ))}

              <div className="form-actions" style={{ marginTop: 16 }}>
                <button type="button" onClick={handleAddQuestion}>+ Add Question</button>{" "}
                <button type="submit">Save Definition</button>{" "}
                <button type="button" onClick={startEndUserForm} style={{ marginLeft: 8 }}>Preview End-User Form</button>
              </div>
            </form>
          </>
        ) : (
          <>
            <h3>End-User Form</h3>
            <form onSubmit={handleSubmitEndUserForm}>
              {questions.length === 0 && <div>No questions to show.</div>}
              {questions.map((q, qi) => {
                if (!visibleSet.has(qi)) return null;
                return (
                  <div className="question-block" key={qi}>
                    <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                      <div className="index-chip">#{qi + 1}</div>
                      <div style={{ fontWeight: 600 }}>{q.text}</div>
                    </div>

                    <div style={{ marginTop: 8 }}>
                      {q.options.map((opt, oi) => {
                        const inputName = q.type === "checkbox" ? `q${qi}[]` : `q${qi}`;
                        const checked = q.type === "checkbox" ? (Array.isArray(responses[qi]) && responses[qi].includes(opt)) : responses[qi] === opt;
                        return (
                          <label key={oi} style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 8 }}>
                            <input type={q.type} name={inputName} value={opt} checked={checked} onChange={(e) => handleEndUserChange(qi, opt, e.target.checked)} />
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

/* ---------- Logic editor component (panel-style) ---------- */
function QuestionLogicEditor({ questions, qIndex, initialOption, onSave, onRemove, onCancel }) {
  const opts = (questions[qIndex] && Array.isArray(questions[qIndex].options)) ? questions[qIndex].options : [];
  const [selectedOption, setSelectedOption] = useState(initialOption || (opts[0] || ""));
  const [csv, setCsv] = useState("");
  useEffect(() => {
    setSelectedOption(initialOption || (opts[0] || ""));
    const rule = (questions[qIndex] && Array.isArray(questions[qIndex].logic)) ? questions[qIndex].logic.find(r => r.option === (initialOption || opts[0])) : null;
    if (rule && Array.isArray(rule.showQuestions)) setCsv(rule.showQuestions.map(n => Number(n) + 1).join(","));
    else setCsv("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [initialOption, qIndex, questions]);

  useEffect(() => {
    const rule = (questions[qIndex] && Array.isArray(questions[qIndex].logic)) ? questions[qIndex].logic.find(r => r.option === selectedOption) : null;
    if (rule && Array.isArray(rule.showQuestions)) setCsv(rule.showQuestions.map(n => Number(n) + 1).join(","));
    else setCsv("");
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [selectedOption]);

  const handleSave = () => onSave(qIndex, selectedOption, csv);
  const handleRemove = () => onRemove(qIndex, selectedOption);

  return (
    <div style={{ marginTop: 10, padding: 10, borderRadius: 8, border: "1px solid #e6edf3", background: "#f9fafb" }}>
      <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 600 }}>Logic for Question #{qIndex + 1}</div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <label style={{ fontSize: 13, color: "#334155" }}>Option:</label>
        <select value={selectedOption} onChange={(e) => setSelectedOption(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6 }}>
          {opts.map((o, i) => <option key={i} value={o}>{o}</option>)}
        </select>
      </div>

      <div style={{ marginBottom: 8 }}>
        <div style={{ fontSize: 13, color: "#334155", marginBottom: 6 }}>Show questions (enter numbers, 1-based, comma-separated):</div>
        <input value={csv} onChange={(e) => setCsv(e.target.value)} placeholder="e.g. 2,4" style={{ width: "100%", padding: "6px 8px", borderRadius: 6, border: "1px solid #e2e8f0", boxSizing: "border-box" }} />
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={handleSave}>Save</button>
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" onClick={handleRemove} style={{ marginLeft: "auto", background: "transparent", color: "#ef4444", border: "1px solid rgba(239,68,68,0.12)" }}>Remove Rule</button>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
        Tip: question numbers are 1-based. A question cannot show itself; such references will be ignored.
      </div>
    </div>
  );
}

/* ---------- Question-level quota editor ---------- */
function QuestionQuotaEditor({ questions, qIndex, initialQuota, onSave, onRemove, onCancel }) {
  const [condition, setCondition] = useState(initialQuota ? initialQuota.condition : "=");
  const [value, setValue] = useState(initialQuota && typeof initialQuota.value === "number" ? initialQuota.value : "");
  const [meetRequirement, setMeetRequirement] = useState(initialQuota ? !!initialQuota.meetRequirement : false);

  useEffect(() => {
    setCondition(initialQuota ? initialQuota.condition : "=");
    setValue(initialQuota && typeof initialQuota.value === "number" ? initialQuota.value : "");
    setMeetRequirement(initialQuota ? !!initialQuota.meetRequirement : false);
  }, [initialQuota]);

  const handleSave = () => {
    const qObj = { condition: condition, value: value === "" ? null : Number(value), meetRequirement: !!meetRequirement };
    onSave(qIndex, qObj);
  };

  const handleRemove = () => onRemove(qIndex);

  return (
    <div style={{ marginTop: 10, padding: 10, borderRadius: 8, border: "1px solid #e6edf3", background: "#ffffff" }}>
      <div style={{ marginBottom: 8, fontSize: 14, fontWeight: 600 }}>Quota for Question #{qIndex + 1}</div>

      <div style={{ display: "flex", gap: 8, alignItems: "center", marginBottom: 8 }}>
        <label style={{ fontSize: 13, color: "#334155" }}>Condition:</label>
        <select value={condition} onChange={(e) => setCondition(e.target.value)} style={{ padding: "6px 8px", borderRadius: 6 }}>
          <option value="=">=</option>
          <option value="<">&lt;</option>
          <option value=">">&gt;</option>
        </select>

        <input
          type="number"
          placeholder="value"
          value={value}
          onChange={(e) => setValue(e.target.value === "" ? "" : Number(e.target.value))}
          style={{ padding: "6px 8px", borderRadius: 6, width: 120 }}
        />

        <label style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <input type="checkbox" checked={meetRequirement} onChange={(e) => setMeetRequirement(e.target.checked)} />
          <span style={{ fontSize: 13 }}>Must meet</span>
        </label>
      </div>

      <div style={{ display: "flex", gap: 8 }}>
        <button type="button" onClick={handleSave}>Save Quota</button>
        <button type="button" onClick={onCancel}>Cancel</button>
        <button type="button" onClick={handleRemove} style={{ marginLeft: "auto", background: "transparent", color: "#ef4444", border: "1px solid rgba(239,68,68,0.12)" }}>Remove Quota</button>
      </div>

      <div style={{ marginTop: 8, fontSize: 12, color: "#64748b" }}>
        Quota is for editor/searching/automation. It does not by itself hide/show questions unless you add runtime logic that checks it.
      </div>
    </div>
  );
}
