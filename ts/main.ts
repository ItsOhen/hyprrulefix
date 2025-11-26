import { generateRules } from "./rules.js";

const outputBox = document.getElementById("outputBox") as HTMLTextAreaElement;
const fileInput = document.getElementById("fileInput") as HTMLInputElement;
const loadFileBtn = document.getElementById("loadFile")!;
const saveBtn = document.getElementById("saveFile")!;
const toggle = document.getElementById("ruleTypeSwitch") as HTMLInputElement;
const outputOverlay = document.getElementById("dropOverlay")!;
const outputContainer = outputBox.parentElement!;

const savedType = localStorage.getItem("ruleType");
if (savedType) {
  toggle.checked = savedType === "anon";
}

let savedSource = localStorage.getItem("ruleSource") || "";

function updateOutput(source: string) {
  savedSource = source;
  outputOverlay.style.display = "none"; // hide overlay when we have content
  outputBox.value = generateRules(source, !toggle.checked);
  outputBox.disabled = false;
}

if (savedSource) {
  updateOutput(savedSource);
} else {
  outputBox.value = "";
  outputBox.disabled = true;
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

toggle.addEventListener("change", () => {
  localStorage.setItem("ruleType", toggle.checked ? "anon" : "named");
  if (savedSource) {
    outputBox.value = generateRules(savedSource, !toggle.checked);
  }
});

loadFileBtn.addEventListener("click", () => fileInput.click());

fileInput.addEventListener("change", (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;
  loadFile(file);
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

// --- Drag & Drop ---
outputContainer.addEventListener("dragover", (e) => {
  e.preventDefault();
  outputOverlay.style.display = "flex";
});

outputContainer.addEventListener("dragleave", (e) => {
  // Only hide if leaving the container entirely
  const related = e.relatedTarget as HTMLElement;
  if (!related || !outputContainer.contains(related)) {
    outputOverlay.style.display = savedSource ? "none" : "flex";
  }
});

outputContainer.addEventListener("drop", (e) => {
  e.preventDefault();
  const file = e.dataTransfer?.files?.[0];
  if (!file) return;
  loadFile(file);
});
