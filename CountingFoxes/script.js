const textInput = document.getElementById("textInput");
const cleanPreview = document.getElementById("cleanPreview");

const wordCount = document.getElementById("wordCount");
const lineCount = document.getElementById("lineCount");
const charCount = document.getElementById("charCount");
const cleanCharCount = document.getElementById("cleanCharCount");
const noSpaceCharCount = document.getElementById("noSpaceCharCount");
const paragraphCount = document.getElementById("paragraphCount");

const clearBtn = document.getElementById("clearBtn");
const copyCleanBtn = document.getElementById("copyCleanBtn");

function stripMarkdown(text) {
  return (
    text
      // Remove fenced code block markers but keep the code text inside.
      .replace(/```[\s\S]*?```/g, (match) =>
        match.replace(/```[a-zA-Z0-9_-]*\n?/g, "").replace(/```/g, ""),
      )

      // Remove inline code markers.
      .replace(/`([^`]+)`/g, "$1")

      // Remove Markdown headings.
      .replace(/^#{1,6}\s+/gm, "")

      // Remove blockquotes.
      .replace(/^>\s?/gm, "")

      // Remove bold/italic markers.
      .replace(/(\*\*|__)(.*?)\1/g, "$2")
      .replace(/(\*|_)(.*?)\1/g, "$2")

      // Remove strikethrough.
      .replace(/~~(.*?)~~/g, "$1")

      // Convert Markdown links [text](url) into just text.
      .replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1")

      // Convert images ![alt](url) into just alt text.
      .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, "$1")

      // Remove raw URLs.
      .replace(/\bhttps?:\/\/\S+/gi, "")

      // Remove unordered list markers.
      .replace(/^\s*[-*+]\s+/gm, "")

      // Remove ordered list markers.
      .replace(/^\s*\d+\.\s+/gm, "")

      // Remove horizontal rules.
      .replace(/^\s*(-{3,}|\*{3,}|_{3,})\s*$/gm, "")

      // Remove Markdown table divider rows.
      .replace(/^\s*\|?[\s:-]+\|[\s|:-]*$/gm, "")

      // Remove extra Markdown table pipes, but keep the text.
      .replace(/\|/g, " ")

      // Collapse excessive spaces but preserve line breaks.
      .replace(/[ \t]+/g, " ")
      .replace(/\n{3,}/g, "\n\n")
      .trim()
  );
}

function countWords(text) {
  const matches = text.match(/\b[\p{L}\p{N}]+(?:['’-][\p{L}\p{N}]+)*\b/gu);
  return matches ? matches.length : 0;
}

function countLinesRaw(text) {
  if (text.length === 0) return 0;
  return text.split(/\r\n|\r|\n/).length;
}

function countParagraphs(text) {
  const paragraphs = text
    .split(/\n\s*\n/)
    .map((block) => block.trim())
    .filter(Boolean);

  return paragraphs.length;
}

function updateCounts() {
  const rawText = textInput.value;
  const cleanText = stripMarkdown(rawText);

  wordCount.textContent = countWords(cleanText).toLocaleString();
  lineCount.textContent = countLinesRaw(rawText).toLocaleString();
  charCount.textContent = rawText.length.toLocaleString();
  cleanCharCount.textContent = cleanText.length.toLocaleString();
  noSpaceCharCount.textContent = cleanText
    .replace(/\s/g, "")
    .length.toLocaleString();
  paragraphCount.textContent = countParagraphs(cleanText).toLocaleString();

  cleanPreview.textContent =
    cleanText || "Your Markdown-stripped text will appear here.";
}

textInput.addEventListener("input", updateCounts);

clearBtn.addEventListener("click", () => {
  textInput.value = "";
  updateCounts();
  textInput.focus();
});

copyCleanBtn.addEventListener("click", async () => {
  const cleanText = stripMarkdown(textInput.value);

  try {
    await navigator.clipboard.writeText(cleanText);
    copyCleanBtn.textContent = "Copied!";
    setTimeout(() => {
      copyCleanBtn.textContent = "Copy Clean Text";
    }, 1200);
  } catch {
    alert(
      "Could not copy text. Your browser may have blocked clipboard access.",
    );
  }
});

updateCounts();
