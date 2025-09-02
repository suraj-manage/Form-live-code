export const parseCodeToQuestions = (html) => {
  try {
    const parser = new DOMParser();
    const doc = parser.parseFromString(html, "text/html");
    const form = doc.querySelector("form");
    if (!form) return [];
    const qNodes = form.querySelectorAll(".question");
    return Array.from(qNodes).map((qNode, qi) => {
      const p = qNode.querySelector("p");
      const text = p?.textContent.trim() || "Untitled Question";
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
      return { id: qi, type, text, options: options.slice(), logic: [] };
    });
  } catch (err) {
    console.error("parse error", err);
    return [];
  }
};

export const formFromDocToCode = (doc) => {
  const form = doc.querySelector("form");
  if (!form) return "<form></form>";
  const serializer = new XMLSerializer();
  return serializer.serializeToString(form);
};

export const normalizeNames = (doc) => {
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

export const mergeParsedWithExisting = (prevQuestions, parsed) => {
  const prev = prevQuestions || [];
  return parsed.map((pQ, idx) => {
    const found = prev.find((pr) => pr.text === pQ.text);
    const logic = [];
    if (found?.logic) {
      found.logic.forEach((rule) => {
        if (pQ.options.includes(rule.option)) {
          const showQuestions = (Array.isArray(rule.showQuestions) ? rule.showQuestions : [])
            .map(Number)
            .filter(n => Number.isFinite(n) && n >= 0);
          logic.push({ option: rule.option, showQuestions });
        }
      });
    }
    return { id: idx, type: pQ.type, text: pQ.text, options: pQ.options.slice(), logic };
  });
};

export const buildPayloadObject = (qs) => {
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

export const escapeHtml = (str) => {
  if (typeof str !== "string") return "";
  return str.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/\"/g, "&quot;");
};

export const generateCodeForLanguage = (lang, qs, html) => {
  const payloadObj = buildPayloadObject(qs);
  if (lang === "html") return html;
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

export const tolerantJsonCleanup = (s) => {
  let t = s;
  t = t.replace(/\/\/.*$/gm, "");
  t = t.replace(/\/\*[\s\S]*?\*\//g, "");
  t = t.replace(/'([^']*)'/g, (m, g1) => '"' + g1.replace(/"/g, '\\"') + '"');
  t = t.replace(/,\s*(?=[}\]])/g, "");
  return t;
};

export const tryParsePayloadFromText = (text, lang) => {
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
    if (obj?.form && Array.isArray(obj.form)) return obj;
    return null;
  } catch (err) {
    return null;
  }
};

export const buildHtmlFromPayload = (payloadObj) => {
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
