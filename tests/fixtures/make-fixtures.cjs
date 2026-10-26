// Builds one small fixture per attachment type into this folder.
// Needs the npm packages jszip and xlsx (dev only; the app uses the copies in vendor/).
const fs = require("fs");
const path = require("path");
const JSZip = require("jszip");
const XLSX = require("xlsx");
const out = __dirname;
fs.mkdirSync(out, { recursive: true });

const CT = `<?xml version="1.0" encoding="UTF-8" standalone="yes"?>`;
const esc = (s) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;");

async function docx() {
  const zip = new JSZip();
  zip.file("[Content_Types].xml", `${CT}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/word/document.xml" ContentType="application/vnd.openxmlformats-officedocument.wordprocessingml.document.main+xml"/></Types>`);
  zip.file("_rels/.rels", `${CT}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="http://schemas.openxmlformats.org/officeDocument/2006/relationships/officeDocument" Target="word/document.xml"/></Relationships>`);
  const p = (...runs) => `<w:p>${runs.join("")}</w:p>`;
  const r = (t) => `<w:r><w:t xml:space="preserve">${esc(t)}</w:t></w:r>`;
  zip.file("word/document.xml", `${CT}<w:document xmlns:w="http://schemas.openxmlformats.org/wordprocessingml/2006/main"><w:body>
${p(r("Project story"))}
${p(r("AI Judges is a pitch-critique panel "), r("that runs entirely on your own PC."))}
${p()}
${p(r("Name"), "<w:r><w:tab/></w:r>", r("Role"))}
${p(r("審査員は三人います。"))}
</w:body></w:document>`);
  fs.writeFileSync(path.join(out, "story.docx"), await zip.generateAsync({ type: "nodebuffer" }));
}

async function pptx() {
  const zip = new JSZip();
  const P = `xmlns:p="http://schemas.openxmlformats.org/presentationml/2006/main" xmlns:a="http://schemas.openxmlformats.org/drawingml/2006/main" xmlns:r="http://schemas.openxmlformats.org/officeDocument/2006/relationships"`;
  const REL = `http://schemas.openxmlformats.org/officeDocument/2006/relationships`;
  zip.file("[Content_Types].xml", `${CT}<Types xmlns="http://schemas.openxmlformats.org/package/2006/content-types"><Default Extension="rels" ContentType="application/vnd.openxmlformats-package.relationships+xml"/><Default Extension="xml" ContentType="application/xml"/><Override PartName="/ppt/presentation.xml" ContentType="application/vnd.openxmlformats-officedocument.presentationml.presentation.main+xml"/></Types>`);
  zip.file("_rels/.rels", `${CT}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/officeDocument" Target="ppt/presentation.xml"/></Relationships>`);
  // Presentation order is slide2.xml then slide1.xml, so file names don't give the order.
  zip.file("ppt/presentation.xml", `${CT}<p:presentation ${P}><p:sldIdLst><p:sldId id="256" r:id="rId3"/><p:sldId id="257" r:id="rId2"/></p:sldIdLst></p:presentation>`);
  zip.file("ppt/_rels/presentation.xml.rels", `${CT}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId2" Type="${REL}/slide" Target="slides/slide1.xml"/><Relationship Id="rId3" Type="${REL}/slide" Target="slides/slide2.xml"/></Relationships>`);
  const sp = (lines, ph) => `<p:sp><p:nvSpPr><p:cNvPr id="2" name="s"/><p:cNvSpPr/><p:nvPr>${ph ? `<p:ph type="${ph}"/>` : ""}</p:nvPr></p:nvSpPr><p:txBody>${lines.map((l) => `<a:p>${l.map((t) => `<a:r><a:t>${esc(t)}</a:t></a:r>`).join("")}</a:p>`).join("")}</p:txBody></p:sp>`;
  const slide = (...shapes) => `${CT}<p:sld ${P}><p:cSld><p:spTree>${shapes.join("")}</p:spTree></p:cSld></p:sld>`;
  zip.file("ppt/slides/slide2.xml", slide(sp([["AI Judges"]], "title"), sp([["Three local judges ", "critique your pitch"], ["Runs on Ollama"]])));
  zip.file("ppt/slides/slide1.xml", slide(sp([["Business model"]], "title"), sp([["Free for individuals; $9/month team tier"]])));
  zip.file("ppt/slides/_rels/slide2.xml.rels", `${CT}<Relationships xmlns="http://schemas.openxmlformats.org/package/2006/relationships"><Relationship Id="rId1" Type="${REL}/notesSlide" Target="../notesSlides/notesSlide1.xml"/></Relationships>`);
  zip.file("ppt/notesSlides/notesSlide1.xml", `${CT}<p:notes ${P}><p:cSld><p:spTree>${sp([], "sldImg")}${sp([["Speaker note: open with the demo story."]], "body")}${sp([["1"]], "sldNum")}</p:spTree></p:cSld></p:notes>`);
  fs.writeFileSync(path.join(out, "deck.pptx"), await zip.generateAsync({ type: "nodebuffer" }));
}

function xlsx() {
  const book = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet([["Judge", "Criterion", "Score"], ["Vera", "Design", 45], ["Marco", "Presentation", 75]]), "Scores");
  const rows = [["Row", "Note"]];
  for (let i = 1; i < 250; i++) rows.push([i, `note ${i}`]);
  XLSX.utils.book_append_sheet(book, XLSX.utils.aoa_to_sheet(rows), "Long");
  fs.writeFileSync(path.join(out, "scores.xlsx"), XLSX.write(book, { type: "buffer", bookType: "xlsx" }));
}

// A minimal PDF with a correct xref table; `pages` is a list of content streams.
function pdf(name, pages) {
  const objs = [];
  const kids = pages.map((_, i) => `${4 + i * 2} 0 R`).join(" ");
  objs[1] = `<< /Type /Catalog /Pages 2 0 R >>`;
  objs[2] = `<< /Type /Pages /Kids [${kids}] /Count ${pages.length} >>`;
  objs[3] = `<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>`;
  pages.forEach((stream, i) => {
    objs[4 + i * 2] = `<< /Type /Page /Parent 2 0 R /MediaBox [0 0 612 792] /Resources << /Font << /F1 3 0 R >> >> /Contents ${5 + i * 2} 0 R >>`;
    objs[5 + i * 2] = `<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`;
  });
  let body = "%PDF-1.4\n";
  const offsets = [];
  for (let n = 1; n < objs.length; n++) { offsets[n] = body.length; body += `${n} 0 obj\n${objs[n]}\nendobj\n`; }
  const xref = body.length;
  body += `xref\n0 ${objs.length}\n0000000000 65535 f \n` + offsets.slice(1).map((o) => `${String(o).padStart(10, "0")} 00000 n \n`).join("");
  body += `trailer\n<< /Size ${objs.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
  fs.writeFileSync(path.join(out, name), body, "latin1");
}
const text = (lines) => `BT /F1 12 Tf 72 720 Td 16 TL ${lines.map((l) => `(${l}) Tj T*`).join(" ")} ET`;

(async () => {
  await docx();
  await pptx();
  xlsx();
  pdf("pitch.pdf", [
    text(["AI Judges: a pitch-critique tool for people who enter hackathons.", "Three local judges reject your pitch with a quoted reason."]),
    text(["Free and open source for individuals; a $9/month team tier."]),
  ]);
  pdf("scanned.pdf", ["0.9 g 72 72 468 648 re f"]); // a grey box and no text, like a scanned page
  fs.writeFileSync(path.join(out, "notes.txt"), "Plain text notes: the judges read exactly what is in the textarea.\n");
  console.log(fs.readdirSync(out).join(" "));
})();
