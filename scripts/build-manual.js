import { readFileSync, writeFileSync } from "fs";
import { marked } from "marked";

const md = readFileSync("MANUAL.md", "utf8");
const body = marked.parse(md);

const html = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="utf-8" />
  <title>Area Tactics — Manual</title>
  <style>
    *, *::before, *::after { box-sizing: border-box; margin: 0; padding: 0; }

    body {
      background: #1a1a2e;
      color: #ddeeff;
      font-family: sans-serif;
      font-size: 15px;
      line-height: 1.65;
      padding: 40px 20px 80px;
    }

    .page {
      max-width: 820px;
      margin: 0 auto;
    }

    h1 {
      font-size: 28px;
      color: #ffffff;
      margin-bottom: 6px;
      border-bottom: 2px solid #334466;
      padding-bottom: 10px;
    }

    h2 {
      font-size: 20px;
      color: #88aaff;
      margin: 36px 0 10px;
      border-bottom: 1px solid #334466;
      padding-bottom: 6px;
    }

    h3 {
      font-size: 16px;
      color: #aaccff;
      margin: 22px 0 8px;
    }

    p {
      margin-bottom: 10px;
      color: #ccddf0;
    }

    ul, ol {
      margin: 6px 0 12px 22px;
      color: #ccddf0;
    }

    li { margin-bottom: 4px; }

    strong { color: #ffffff; }

    em { color: #99bbdd; font-style: italic; }

    a { color: #5599ff; }

    hr {
      border: none;
      border-top: 1px solid #334466;
      margin: 28px 0;
    }

    table {
      width: 100%;
      border-collapse: collapse;
      margin: 12px 0 20px;
      font-size: 14px;
    }

    thead tr { background: rgba(51, 68, 102, 0.6); }

    th {
      text-align: left;
      padding: 8px 12px;
      color: #aaccff;
      font-weight: 600;
      border-bottom: 1px solid #334466;
    }

    td {
      padding: 7px 12px;
      border-bottom: 1px solid rgba(51, 68, 102, 0.4);
      color: #ccddf0;
    }

    tr:hover td { background: rgba(255,255,255,0.04); }

    code {
      background: rgba(255,255,255,0.08);
      border-radius: 3px;
      padding: 1px 5px;
      font-family: monospace;
      font-size: 13px;
      color: #eef;
    }

    .top-bar {
      display: flex;
      align-items: baseline;
      gap: 16px;
      margin-bottom: 20px;
    }
  </style>
</head>
<body>
  <div class="page">
    ${body}
  </div>
</body>
</html>
`;

writeFileSync("public/manual.html", html);
console.log("manual.html written to public/");
