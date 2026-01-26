import { generateRules } from "./rules.js";

const outputBox = document.getElementById("outputBox") as HTMLTextAreaElement;
const fileInput = document.getElementById("fileInput") as HTMLInputElement;
const loadBtn = document.getElementById("loadFile")!;
const saveBtn = document.getElementById("saveFile")!;
const toggle = document.getElementById("ruleTypeSwitch") as HTMLInputElement;
const overlay = document.getElementById("dropOverlay")!;
const container = outputBox.parentElement!;
const statusIndicator = document.getElementById("statusIndicator")!;

let savedSource = "";

function showConversionFeedback() {
  statusIndicator.classList.add("visible");
  outputBox.classList.add("converted");
  setTimeout(() => {
    statusIndicator.classList.remove("visible");
    outputBox.classList.remove("converted");
  }, 1500);
}

function updateOutput(source: string) {
  savedSource = source;
  outputBox.value = generateRules(source, !toggle.checked);
  outputBox.disabled = false;
  overlay.classList.add("hidden");
  showConversionFeedback();
}

function loadFromClipboard(e: ClipboardEvent) {
  const source = e.clipboardData?.getData("text") || "";
  if (source.trim() === "") return;
  localStorage.setItem("ruleSource", source);
  updateOutput(source);
}

function loadFile(file: File) {
  const reader = new FileReader();
  reader.onload = () => {
    const content = reader.result as string;
    localStorage.setItem("ruleSource", content);
    updateOutput(content);
  };
  reader.readAsText(file);
}

window.addEventListener("paste", (e) => {
  e.preventDefault();
  loadFromClipboard(e);
})

toggle.addEventListener("change", () => {
  localStorage.setItem("ruleType", toggle.checked ? "anon" : "named");
  if (savedSource) {
    outputBox.value = generateRules(savedSource, !toggle.checked);
    showConversionFeedback();
  }
});

loadBtn.addEventListener("click", () => fileInput.click());
fileInput.addEventListener("change", (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (file) loadFile(file);
});

saveBtn.addEventListener("click", () => {
  const blob = new Blob([outputBox.value], { type: "text/plain" });
  const url = URL.createObjectURL(blob);

  const a = document.createElement("a");
  a.href = url;
  a.download = "rules.conf";
  a.click();

  URL.revokeObjectURL(url);
});

container.addEventListener("dragover", (e) => {
  e.preventDefault();
  outputBox.classList.add("drag-over");
});

container.addEventListener("dragleave", () => {
  outputBox.classList.remove("drag-over");
});

container.addEventListener("drop", (e) => {
  e.preventDefault();
  outputBox.classList.remove("drag-over");
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  const reader = new FileReader();
  loadFile(file);
});