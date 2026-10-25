// Text extraction for attachment files, entirely in the browser. Each library is
// loaded from /vendor only when a file of its type is first attached.

export const ACCEPTED_FILES = ".md,.markdown,.txt,.pdf,.docx,.pptx,.xlsx";
export const MIN_EXTRACTED_CHARS = 50;
const MAX_SHEET_ROWS = 200;

const vendor = (path) => new URL(`./vendor/${path}`, import.meta.url).href;

// JSZip and SheetJS are UMD builds: importing them sets window.JSZip / window.XLSX.
let jszip, sheetjs, pdfjs;
async function loadJSZip() {
  if (!jszip) jszip = import(vendor("jszip/jszip.min.js")).then(() => window.JSZip);
  return jszip;
}
async function loadSheetJS() {
  if (!sheetjs) sheetjs = import(vendor("sheetjs/xlsx.mini.min.js")).then(() => window.XLSX);
  return sheetjs;
}
async function loadPdfjs() {
  if (!pdfjs) {
    pdfjs = import(vendor("pdfjs/pdf.min.mjs")).then((lib) => {
      lib.GlobalWorkerOptions.workerSrc = vendor("pdfjs/pdf.worker.min.mjs");
      return lib;
    });
  }
  return pdfjs;
}

const extension = (name) => name.toLowerCase().split(".").pop();

// Returns the file's text, or throws if the type isn't supported.
export async function extractText(file) {
  switch (extension(file.name)) {
    case "md": case "markdown": case "txt": return file.text();
    case "docx": return docxText(await file.arrayBuffer());
    case "pptx": return pptxText(await file.arrayBuffer());
    case "xlsx": return xlsxText(await file.arrayBuffer());
    case "pdf": return pdfText(await file.arrayBuffer());
    default: throw new Error(`unsupported file type: ${file.name}`);
  }
}

// --- Office Open XML ------------------------------------------------------------

const W = "http://schemas.openxmlformats.org/wordprocessingml/2006/main";
const A = "http://schemas.openxmlformats.org/drawingml/2006/main";
const P = "http://schemas.openxmlformats.org/presentationml/2006/main";
const R = "http://schemas.openxmlformats.org/officeDocument/2006/relationships";
const PKG = "http://schemas.openxmlformats.org/package/2006/relationships";

const parseXml = (text) => new DOMParser().parseFromString(text, "application/xml");
async function readXml(zip, path) {
  const entry = zip.file(path);
  return entry ? parseXml(await entry.async("string")) : null;
}

// A part's relationships, as Id -> { type, target } with targets resolved to zip paths.
async function relationships(zip, partPath) {
  const dir = partPath.slice(0, partPath.lastIndexOf("/") + 1);
  const rels = await readXml(zip, `${dir}_rels/${partPath.slice(dir.length)}.rels`);
  const map = new Map();
  for (const rel of rels?.getElementsByTagNameNS(PKG, "Relationship") ?? []) {
    const target = new URL(rel.getAttribute("Target"), `file:///${dir}`).pathname.slice(1);
    map.set(rel.getAttribute("Id"), { type: rel.getAttribute("Type"), target });
  }
  return map;
}

// docx: one line per paragraph, tabs and line breaks kept.
async function docxText(buffer) {
  const zip = await (await loadJSZip()).loadAsync(buffer);
  const doc = await readXml(zip, "word/document.xml");
  if (!doc) throw new Error("not a Word document");
  return [...doc.getElementsByTagNameNS(W, "p")].map((p) => {
    let line = "";
    for (const node of p.getElementsByTagNameNS(W, "*")) {
      if (node.localName === "t") line += node.textContent;
      else if (node.localName === "tab") line += "\t";
      else if (node.localName === "br") line += "\n";
    }
    return line;
  }).join("\n").replace(/\n{3,}/g, "\n\n").trim();
}

// DrawingML paragraphs (a:p) inside an element, as lines.
const drawingLines = (el) =>
  [...el.getElementsByTagNameNS(A, "p")]
    .map((p) => [...p.getElementsByTagNameNS(A, "t")].map((t) => t.textContent).join(""))
    .filter((line) => line.trim());

// pptx: slides in presentation order (sldIdLst, not file names), slide text then speaker notes.
async function pptxText(buffer) {
  const zip = await (await loadJSZip()).loadAsync(buffer);
  const presentation = await readXml(zip, "ppt/presentation.xml");
  if (!presentation) throw new Error("not a PowerPoint file");
  const presRels = await relationships(zip, "ppt/presentation.xml");
  const slidePaths = [...presentation.getElementsByTagNameNS(P, "sldId")]
    .map((s) => presRels.get(s.getAttributeNS(R, "id"))?.target).filter(Boolean);
  const out = [];
  for (const [i, path] of slidePaths.entries()) {
    const slide = await readXml(zip, path);
    if (!slide) continue;
    out.push(`--- Slide ${i + 1} ---`, ...drawingLines(slide));
    const notesRel = [...(await relationships(zip, path)).values()].find((r) => r.type.endsWith("/notesSlide"));
    const notes = notesRel && (await readXml(zip, notesRel.target));
    if (notes) {
      // Only the notes body: the notes page also holds the slide image and the slide number.
      const body = [...notes.getElementsByTagNameNS(P, "sp")]
        .filter((sp) => sp.getElementsByTagNameNS(P, "ph")[0]?.getAttribute("type") === "body");
      const lines = body.flatMap(drawingLines);
      if (lines.length) out.push("Notes:", ...lines);
    }
  }
  return out.join("\n");
}

// xlsx: each sheet under a marker, rows tab-separated, at most MAX_SHEET_ROWS rows per sheet.
async function xlsxText(buffer) {
  const XLSX = await loadSheetJS();
  const book = XLSX.read(buffer, { type: "array" });
  return book.SheetNames.map((name) => {
    const rows = XLSX.utils.sheet_to_json(book.Sheets[name], { header: 1, blankrows: false, defval: "", raw: false });
    return [`--- Sheet: ${name} ---`, ...rows.slice(0, MAX_SHEET_ROWS).map((r) => r.join("\t"))].join("\n");
  }).join("\n");
}

// --- PDF ---------------------------------------------------------------------------

async function pdfText(buffer) {
  const lib = await loadPdfjs();
  const doc = await lib.getDocument({ data: new Uint8Array(buffer) }).promise;
  const out = [];
  for (let n = 1; n <= doc.numPages; n++) {
    const content = await (await doc.getPage(n)).getTextContent();
    const text = content.items.map((item) => item.str + (item.hasEOL ? "\n" : "")).join("");
    out.push(`--- Page ${n} ---`, text.trim());
  }
  await doc.destroy();
  return out.join("\n");
}

// Characters that aren't markers or whitespace, to tell a scanned image from a document.
export function readableLength(text) {
  return text.replace(/^--- (Slide \d+|Page \d+|Sheet: .*) ---$/gm, "").replace(/\s+/g, "").length;
}
