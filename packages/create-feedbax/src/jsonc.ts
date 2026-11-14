/** Strip comments without altering quoted URLs, escaped quotes, or comment-like text. */
export function withoutComments(input: string): string {
  let output = "",
    quote = "",
    escaped = false;
  for (let i = 0; i < input.length; i++) {
    const c = input[i]!;
    if (quote) {
      output += c;
      if (escaped) escaped = false;
      else if (c === "\\") escaped = true;
      else if (c === quote) quote = "";
    } else if (c === '"' || c === "'" || c === "`") {
      quote = c;
      output += c;
    } else if (c === "/" && input[i + 1] === "/") {
      while (i < input.length && input[i] !== "\n") i++;
      output += "\n";
    } else if (c === "/" && input[i + 1] === "*") {
      const end = input.indexOf("*/", i + 2);
      if (end < 0) throw new Error("Unclosed comment");
      output += " ";
      i = end + 1;
    } else output += c;
  }
  return output;
}
export function parseJsonc(input: string): unknown {
  const clean = withoutComments(input);
  let output = "",
    quoted = false,
    escaped = false;
  for (let i = 0; i < clean.length; i++) {
    const c = clean[i]!;
    if (!quoted && c === "," && /^\s*[}\]]/.test(clean.slice(i + 1))) continue;
    output += c;
    if (escaped) escaped = false;
    else if (quoted && c === "\\") escaped = true;
    else if (c === '"') quoted = !quoted;
  }
  return JSON.parse(output);
}
