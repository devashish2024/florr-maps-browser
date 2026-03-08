import { useEffect, useState, memo } from "react";

// Simple markdown-to-HTML converter for README rendering
function mdToHtml(md) {
  // Extract tables first before inline processing
  const tableBlocks = [];
  md = md.replace(/((?:^\|.+\|\s*\n)+)/gm, (match) => {
    const placeholder = `__TABLE_${tableBlocks.length}__`;
    tableBlocks.push(match.trim());
    return placeholder + "\n";
  });

  let html = md
    // Horizontal rules
    .replace(/^---+$/gm, "<hr/>")
    // Headings
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    // Images (before links, since image syntax contains link syntax)
    .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
    // Linked images: [![alt](img)](href)
    .replace(/<a href="([^"]+)"[^>]*><img src="([^"]+)" alt="([^"]*)" \/><\/a>/g,
      '<a href="$1" target="_blank" rel="noopener noreferrer"><img src="$2" alt="$3" /></a>')
    // Bold
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    // Italic
    .replace(/\*(.+?)\*/g, "<em>$1</em>")
    // Line breaks
    .replace(/<br\/>/g, "<br/>")
    // Links
    .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>')
    // Unordered list items
    .replace(/^- (.+)$/gm, "<li>$1</li>");

  // Restore tables
  for (let i = 0; i < tableBlocks.length; i++) {
    const rows = tableBlocks[i].split("\n").filter((r) => r.trim());
    // Skip separator row (|---|---| etc)
    const dataRows = rows.filter((r) => !/^\|[\s-:|]+\|$/.test(r));
    let tableHtml = '<table>';
    for (const row of dataRows) {
      const cells = row.split("|").slice(1, -1); // trim leading/trailing |
      tableHtml += "<tr>";
      for (let cell of cells) {
        cell = cell.trim();
        // Process inline markdown in cells
        cell = cell
          .replace(/!\[([^\]]*)\]\(([^)]+)\)/g, '<img src="$2" alt="$1" />')
          .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
          .replace(/\*(.+?)\*/g, "<em>$1</em>")
          .replace(/<br\/>/g, "<br/>")
          .replace(/\[([^\]]+)\]\(([^)]+)\)/g, '<a href="$2" target="_blank" rel="noopener noreferrer">$1</a>');
        // Handle linked images
        cell = cell.replace(
          /<a href="([^"]+)"[^>]*><img src="([^"]+)" alt="([^"]*)" \/><\/a>/g,
          '<a href="$1" target="_blank" rel="noopener noreferrer"><img src="$2" alt="$3" /></a>'
        );
        tableHtml += `<td>${cell}</td>`;
      }
      tableHtml += "</tr>";
    }
    tableHtml += "</table>";
    html = html.replace(`__TABLE_${i}__`, tableHtml);
  }

  // Wrap consecutive <li> tags in <ul>
  html = html.replace(/((?:<li>.*<\/li>\n?)+)/g, "<ul>$1</ul>");

  // Paragraphs: wrap remaining non-tag lines
  html = html
    .split("\n\n")
    .map((block) => {
      const trimmed = block.trim();
      if (!trimmed) return "";
      if (/^<[a-z]/.test(trimmed)) return trimmed;
      // Avoid wrapping block-level elements in <p>
      if (/^<(h[1-6]|ul|ol|li|hr|div|blockquote|pre)/.test(trimmed)) return trimmed;
      return `<p>${trimmed.replace(/\n/g, "<br/>")}</p>`;
    })
    .join("\n");

  return html;
}

export default memo(function ReadmeViewer({ src = "/README.md" }) {
  const [html, setHtml] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    setHtml(null);
    setError(null);
    fetch(src)
      .then((r) => {
        if (!r.ok) throw new Error("Not found");
        return r.text();
      })
      .then((md) => setHtml(mdToHtml(md)))
      .catch(() => setError(`Could not load ${src}`));
  }, [src]);

  if (error) {
    return (
      <div style={{ color: "#888", padding: 40, fontFamily: "Game, Ubuntu, sans-serif" }}>
        {error}
      </div>
    );
  }

  if (!html) {
    return (
      <div style={{ color: "#888", padding: 40, fontFamily: "Game, Ubuntu, sans-serif" }}>
        Loading...
      </div>
    );
  }

  return (
    <div className="readme-viewer" style={{ height: "100%", overflow: "auto" }}>
      <div
        className="readme-content"
        dangerouslySetInnerHTML={{ __html: html }}
      />
    </div>
  );
})
