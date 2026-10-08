import { describe, expect, test } from "bun:test";
import { existsSync, readFileSync } from "node:fs";
import { resolve } from "node:path";
import { creationFeaturedWorks, inspirationSource } from "../src/pages/create/creation-inspirations";

describe("curated creation inspirations", () => {
    test("all templates have unique titles, usable prompts and local cover assets", () => {
        expect(creationFeaturedWorks.length).toBe(22);
        expect(new Set(creationFeaturedWorks.map((item) => item.title)).size).toBe(22);
        for (const item of creationFeaturedWorks) {
            expect(["image", "video", "text"]).toContain(item.mode);
            expect(item.prompt.length).toBeGreaterThan(35);
            expect(existsSync(resolve(import.meta.dir, "../public", item.image.slice(1)))).toBe(true);
        }
    });
    test("adapted prompts retain provenance and the data license", () => {
        expect(creationFeaturedWorks.filter((item) => item.source).length).toBe(8);
        const retainedArtwork = creationFeaturedWorks.find(item => item.image === "/inspiration-assets/wing-it-barn.webp");
        expect(retainedArtwork?.mode).toBe("text");
        const artworkNotice = readFileSync(resolve(import.meta.dir, "../public/inspiration-assets/credits.html"), "utf8");
        expect(artworkNotice).toContain("Vivien Lulkowski");
        expect(artworkNotice).toContain("CC BY 4.0");
        expect(inspirationSource.license).toBe("CC0-1.0");
        expect(inspirationSource.revision).toMatch(/^[a-f0-9]{40}$/);
        expect(inspirationSource.notice).toContain("不代表实际生成结果");
    });
});
