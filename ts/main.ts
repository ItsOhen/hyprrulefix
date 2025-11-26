import { generateNamed, generateAnonymous } from "./rules.js";

const inputBox = document.getElementById("inputBox") as HTMLTextAreaElement;
const outputBox = document.getElementById("outputBox") as HTMLTextAreaElement;

document.getElementById("toNamed")!.addEventListener("click", () => {
  outputBox.value = generateNamed(inputBox.value);
});

document.getElementById("toAnon")!.addEventListener("click", () => {
  outputBox.value = generateAnonymous(inputBox.value);
});

document.getElementById("loadFile")!.addEventListener("click", () => {
  (document.getElementById("fileInput") as HTMLInputElement).click();
});

document.getElementById("fileInput")!.addEventListener("change", (e) => {
  const file = (e.target as HTMLInputElement).files?.[0];
  if (!file) return;

  const reader = new FileReader();
  reader.onload = () => (inputBox.value = reader.result as string);
  reader.readAsText(file);
});

document.getElementById("saveFile")!.addEventListener("click", () => {
  const blob = new Blob([outputBox.value], { type: "text/plain" });
  const url = URL.createObjectURL(blob);
  const a = document.createElement("a");
  a.href = url;
  a.download = "converted.conf";
  a.click();
  URL.revokeObjectURL(url);
});
