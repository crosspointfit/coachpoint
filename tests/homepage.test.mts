import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

test("public home and shared chrome contain no competition or external documentation links", async () => {
  for (const path of [
    "../src/app/page.tsx",
    "../src/app/layout.tsx",
    "../src/components/SiteHeader.tsx",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /webmcp\.devpost\.com|learn\.chatgpt\.com/);
    assert.doesNotMatch(source, /href=["']https?:\/\//);
  }
});

test("home presentation remains English and does not expose Chinese catalog labels", async () => {
  for (const path of [
    "../src/app/page.tsx",
    "../src/components/home/HomeExerciseGallery.tsx",
  ]) {
    const source = await readFile(new URL(path, import.meta.url), "utf8");
    assert.doesNotMatch(source, /[\u3400-\u9fff]|\.nameZh/);
  }
});
