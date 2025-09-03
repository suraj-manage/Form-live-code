// Utility functions and helpers for parsing, generating and replacing payloads.
// This file is written to be defensive and tolerant, and to map between internal
// question shape { text, type, options, logic, quota } and the payload shape
// { form: [{ question, answer, type, options, logic, quota }] }.

export function parseCodeToQuestions(html) {
  // Parse a basic HTML structure into internal question objects.
  try {
    const doc = document.createElement("div");
    doc.innerHTML = html || "";
    const questionDivs = doc.querySelectorAll(".question");
    const questions = [];
    questionDivs.forEach((qDiv, i) => {
      const p = qDiv.querySelector("p");
      const text = p ? p.textContent.trim() : `Untitled Question ${i + 1}`;
      // Determine input type: radio or checkbox
      const radios = qDiv.querySelectorAll('input[type="radio"]');
      const checkboxes = qDiv.querySelectorAll('input[type="checkbox"]');
      const type = checkboxes.length > 0 ? "checkbox" : "radio";
      const inputs = type === "checkbox" ? checkboxes : radios;
      const options = Array.from(inputs || []).map((inp) => {
        const v = inp.getAttribute("value");
        if (v !== null && v !== undefined) return v;
        return inp.nextSibling ? ("" + inp.nextSibling.textContent).trim() : "";
      });
      questions.push({ text, type, options: options.length ? options : ["Option 1"], logic: [], quota: null });
    });
    return questions;
  } catch (err) {
    console.error("parseCodeToQuestions error:", err);
    return [];
  }
}

export function buildHtmlFromPayload(payload) {
  // Accept payload objects where each form item may have .question or .text
  if (!payload || !Array.isArray(payload.form)) return "<form></form>";
  let html = "<form>\n";
  payload.form.forEach((q, i) => {
    const qText = q.question ?? q.text ?? "Untitled Question";
    const type = q.type === "checkbox" ? "checkbox" : "radio";
    const options = Array.isArray(q.options) && q.options.length ? q.options : ["Option 1"];
    html += `  <div class="question">\n    <p>${escapeHtml(qText)}</p>\n`;
    options.forEach((opt) => {
      const v = escapeHtml(opt);
      html += `    <label><input type="${type}" name="${type === "checkbox" ? `q${i}[]` : `q${i}`}" value="${v}" /> ${v}</label>\n`;
    });
    html += "  </div>\n";
  });
  html += "</form>";
  return html;
}

export function buildPayloadObject(internalQuestions) {
  // Map internal questions to the payload shape
  return {
    form: (internalQuestions || []).map((q) => ({
      question: q.text ?? "",
      answer: [],
      type: q.type ?? "radio",
      options: Array.isArray(q.options) ? q.options.slice() : [],
      logic: Array.isArray(q.logic) ? q.logic.map((r) => ({ option: r.option, showQuestions: Array.isArray(r.showQuestions) ? r.showQuestions.slice() : [] })) : [],
      quota: q.quota ?? null,
    })),
  };
}

export function generateCodeForLanguage(lang, internalQuestions, html) {
  const payloadObj = buildPayloadObject(internalQuestions);
  const payloadStr = JSON.stringify(payloadObj, null, 2);

  if (lang === "html") return html || buildHtmlFromPayload(payloadObj);

  if (lang === "python") {
    return [
      "# Python requests example",
      "import requests",
      "",
      'url = "http://localhost:5000/api/forms/submit"',
      "payload = " + payloadStr,
      "",
      "resp = requests.post(url, json=payload)",
      "print(resp.status_code)",
      "print(resp.text)",
      "",
    ].join("\n");
  }

  if (lang === "vbscript") {
    return [
      "' VBScript HTTP request example (payload shown as JSON block)",
      "Set objHTTP = CreateObject(\"WinHttp.WinHttpRequest.5.1\")",
      'url = "http://localhost:5000/api/forms/submit"',
      "Set payload = " + payloadStr,
      'objHTTP.Open "POST", url, False',
      'objHTTP.SetRequestHeader "Content-Type", "application/json"',
      "objHTTP.Send payload",
      'WScript.Echo objHTTP.Status & " " & objHTTP.ResponseText',
      "",
    ].join("\n");
  }

  if (lang === "javascript") {
    return [
      "// JavaScript (Node.js) fetch example",
      "import fetch from 'node-fetch';",
      "",
      'const url = "http://localhost:5000/api/forms/submit";',
      "const payload = " + payloadStr + ";",
      "",
      "async function submitForm() {",
      "  try {",
      "    const resp = await fetch(url, {",
      "      method: 'POST',",
      "      headers: { 'Content-Type': 'application/json' },",
      "      body: JSON.stringify(payload)",
      "    });",
      "    console.log(resp.status);",
      "    console.log(await resp.text());",
      "  } catch (err) {",
      "    console.error('Error:', err);",
      "  }",
      "}",
      "",
      "submitForm();",
      "",
    ].join("\n");
  }

  return "";
}


// Extract JSON payload block from Python code sample
export function extractJsonFromPython(code) {
  if (!code || typeof code !== "string") return null;
  // Non-greedy match, stops at newline or end of file
  const regex = /payload\s*=\s*({[\s\S]*?})\s*(?:\n|$)/m;
  const match = code.match(regex);
  return match ? match[1] : null;
}

// Extract JSON payload block from VBScript code sample
export function extractJsonFromVBScript(code) {
  if (!code || typeof code !== "string") return null;
  const regex = /Set\s+payload\s*=\s*({[\s\S]*?})\s*(?:\n|$)/m;
  const match = code.match(regex);
  return match ? match[1] : null;
}


// Replace payload block in Python code with newJson (stringified JSON)
export function replacePayloadInPython(code, newJson) {
  if (!code || typeof code !== "string") return code;
  const regex = /(payload\s*=\s*)({[\s\S]*})/m;
  if (regex.test(code)) {
    return code.replace(regex, (_, prefix) => `${prefix}${newJson}`);
  } else {
    // if no payload block found, append it at the end
    return code + "\n\npayload = " + newJson;
  }
}

// Replace payload block in VBScript code with newJson (stringified JSON)
export function replacePayloadInVBScript(code, newJson) {
  if (!code || typeof code !== "string") return code;
  const regex = /(Set\s+payload\s*=\s*)({[\s\S]*})/m;
  if (regex.test(code)) {
    return code.replace(regex, (_, prefix) => `${prefix}${newJson}`);
  } else {
    return code + "\n\nSet payload = " + newJson;
  }
}

// Normalize an incoming payload.form array into internal question objects
export function normalizePayloadFormToQuestions(formArray) {
  if (!Array.isArray(formArray)) return [];
  return formArray.map((item, idx) => {
    const text = item.question ?? item.text ?? `Untitled Question ${idx + 1}`;
    const type = item.type === "checkbox" ? "checkbox" : "radio";
    const options = Array.isArray(item.options) && item.options.length ? item.options.slice() : ["Option 1"];
    const logic = Array.isArray(item.logic) ? item.logic.map((r) => ({ option: r.option, showQuestions: Array.isArray(r.showQuestions) ? r.showQuestions.slice() : [] })) : [];
    const quota = item.quota ?? null;
    return { text, type, options, logic, quota };
  });
}

// Helper: escape HTML for safe insertion into the textarea-generated HTML
export function escapeHtml(str) {
  if (typeof str !== "string") return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

export function extractJsonFromJavaScript(code) {
  if (!code || typeof code !== "string") return null;
  const regex = /const\s+payload\s*=\s*({[\s\S]*?});/m;
  const match = code.match(regex);
  return match ? match[1] : null;
}

export function replacePayloadInJavaScript(code, newJson) {
  if (!code || typeof code !== "string") return code;
  const regex = /(const\s+payload\s*=\s*)({[\s\S]*})(;?)/m;
  if (regex.test(code)) {
    return code.replace(regex, (_, prefix, _oldJson, suffix) => `${prefix}${newJson}${suffix || ";"}`);
  } else {
    return code + "\n\nconst payload = " + newJson + ";";
  }
}
